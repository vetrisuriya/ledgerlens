import { PSM, createWorker, type Worker } from 'tesseract.js';
import { preprocess } from './preprocess';

export interface OcrBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: OcrBox;
}

export interface OcrLine {
  text: string;
  confidence: number;
  bbox: OcrBox;
  words: OcrWord[];
}

export interface OcrResult {
  text: string;
  lines: OcrLine[];
  confidence: number;
  /** Page segmentation mode that produced this result, for diagnostics. */
  psm: string;
  /**
   * Headline total re-read in isolation, when one was found.
   *
   * A receipt's amount is set much larger than anything else on screen, which
   * makes it the one figure worth reading twice. Tesseract has no character for
   * the rupee sign and tends to read it as a digit and glue it to the number, so
   * a full-page pass reported "32,000" for an amount of 2,000. Cropping to the
   * headline and reading it as a single line drops the stray glyph.
   */
  headline?: string;
}

export interface RecognizeOptions {
  onProgress?: (progress: number) => void;
}

/**
 * Segmentation modes tried in order.
 *
 * Mobile receipts are sparse, whitespace-heavy screens that Tesseract's default
 * full layout analysis frequently mis-segments. Sparse-text mode is tried first
 * and usually wins; denser layouts fall through to single-block and finally to
 * the default. The ladder stops as soon as a pass reads cleanly, so the common
 * case costs a single recognition pass.
 */
const PSM_LADDER: PSM[] = [PSM.SPARSE_TEXT, PSM.SINGLE_BLOCK, PSM.AUTO];
const GOOD_LINE_COUNT = 6;
const GOOD_CONFIDENCE = 70;
/** How much larger than body text a receipt's total is set. */
const HEADLINE_RATIO = 2.5;
/** Most headline candidates worth re-reading. */
const MAX_HEADLINE_CANDIDATES = 2;

class OcrEngine {
  private workerPromise: Promise<Worker> | null = null;
  private currentPsm: string | null = null;

  private getWorker(): Promise<Worker> {
    if (!this.workerPromise) {
      this.workerPromise = createWorker('eng').catch((error: unknown) => {
        this.workerPromise = null;
        throw error;
      });
    }
    return this.workerPromise;
  }

  async recognize(file: File, options: RecognizeOptions = {}): Promise<OcrResult> {
    const worker = await this.getWorker();
    options.onProgress?.(0.05);

    // Preprocessing is the expensive part and does not depend on segmentation,
    // so it is paid for once and reused across every attempt.
    const { blob } = await preprocess(file);
    options.onProgress?.(0.2);

    let best: OcrResult | null = null;
    let bestScore = -1;

    for (let index = 0; index < PSM_LADDER.length; index++) {
      const psm = PSM_LADDER[index]!;

      if (this.currentPsm !== psm) {
        await worker.setParameters({
          tessedit_pageseg_mode: psm,
          // Keeps the horizontal gap on label/value rows, which is what lets the
          // parser tell "UPI Ref No" apart from the number beside it.
          preserve_interword_spaces: '1',
        });
        this.currentPsm = psm;
      }

      // hocr and tsv are omitted deliberately; they are pure overhead here.
      const { data } = await worker.recognize(blob, {}, { blocks: true, text: true });
      const result = toResult(data, psm);
      const foundTotal = foundHeadlineTotal(result.lines);
      const score = scoreResult(result, foundTotal);

      if (score > bestScore) {
        bestScore = score;
        best = result;
      }

      // Keep going until a pass has both read the page and found the total. On a
      // receipt one segmentation mode returned a perfectly readable page that had
      // silently dropped the ₹600 line, and stopping at the first readable result
      // is how that became an empty amount in the table.
      const last = index === PSM_LADDER.length - 1;
      if (last || (isReadable(result) && foundTotal)) break;
      options.onProgress?.(0.2 + ((index + 1) / PSM_LADDER.length) * 0.75);
    }

    options.onProgress?.(1);
    const chosen = best!;

    // The total is the one number worth a second look, read from its own crop so
    // the page's other glyphs cannot bleed into it.
    const headline = await this.readHeadline(worker, blob, chosen);

    return headline ? { ...chosen, headline } : chosen;
  }

  /**
   * Re-reads the largest text on screen as a standalone line, and hands back
   * whatever it says for the parser to check.
   *
   * This is returned as a reading rather than a decision: cropping the total out
   * of the page changes what OCR makes of the currency glyph, so on some receipts
   * the crop is cleaner than the page and on others it is worse. The parser
   * compares the two and only accepts a correction.
   */
  private async readHeadline(
    worker: Worker,
    blob: Blob,
    result: OcrResult,
  ): Promise<string | null> {
    const candidates = headlineCandidates(result.lines);
    if (candidates.length === 0) return null;

    const previousPsm = this.currentPsm;
    let best: { text: string; digits: number } | null = null;

    try {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
        preserve_interword_spaces: '0',
      });
      this.currentPsm = null;

      for (const line of candidates) {
        const pad = 8;
        const { x0, y0, x1, y1 } = line.bbox;
        const rectangle = {
          left: Math.max(0, Math.round(x0 - pad)),
          top: Math.max(0, Math.round(y0 - pad)),
          width: Math.max(1, Math.round(x1 - x0 + pad * 2)),
          height: Math.max(1, Math.round(y1 - y0 + pad * 2)),
        };

        const { data } = await worker.recognize(blob, { rectangle }, { text: true });
        const text = (data.text ?? '').replace(/\s+/g, ' ').trim();
        // Ranked by digits rather than height: on a real receipt the rupee glyph
        // produced a taller line than the total it belongs to, and reading that
        // fragment in isolation returns nothing at all, so the digits are what
        // separate a real total from debris. The parser decides whether to trust
        // the result, by checking it against the figure the page read gave.
        const digits = text.replace(/\D/g, '').length;
        if (digits === 0) continue;
        if (!best || digits > best.digits) best = { text, digits };
      }
    } catch {
      // The re-read is an improvement, never a requirement.
    } finally {
      this.currentPsm = previousPsm;
    }

    return best?.text ?? null;
  }

  async dispose(): Promise<void> {
    if (!this.workerPromise) return;
    const pending = this.workerPromise;
    this.workerPromise = null;
    this.currentPsm = null;
    try {
      const worker = await pending;
      await worker.terminate();
    } catch {
      // Worker was never successfully created; nothing to clean up.
    }
  }
}

export const ocrEngine = new OcrEngine();

function isReadable(result: OcrResult): boolean {
  return result.lines.length >= GOOD_LINE_COUNT && result.confidence >= GOOD_CONFIDENCE;
}

/**
 * Whether a pass found a figure set at headline size, which is what a receipt's
 * total looks like.
 *
 * Height alone is not enough, and neither is height plus "contains a digit": on a
 * real receipt the rupee glyph was read as a lone "2," on a line taller than the
 * total below it, so a pass that had lost the total entirely still looked like it
 * had found one. Two digits or more is what separates a total from that debris.
 */
function foundHeadlineTotal(lines: OcrLine[]): boolean {
  return headlineCandidates(lines).some((line) => line.text.replace(/\D/g, '').length >= 2);
}

/**
 * Ranks one segmentation pass against another.
 *
 * The total is weighted heavily because it is the field a payment screenshot
 * exists to deliver: a pass that found a headline-sized figure outranks a pass
 * that read slightly more of the page around it, since one leaves the row's most
 * important cell empty.
 */
function scoreResult(result: OcrResult, foundTotal: boolean): number {
  const base = result.lines.length * (result.confidence / 100);
  return foundTotal ? base * 2 : base;
}

/**
 * Lines large enough to be a receipt's headline total, tallest first.
 *
 * The body size is the reference rather than the tallest line, because OCR
 * invents tall fragments: a real receipt came back with the rupee glyph on a line
 * of its own, taller than the total below it.
 */
function headlineCandidates(lines: OcrLine[]): OcrLine[] {
  const heights = lines.map(medianWordHeight).filter((height) => height > 0);
  if (heights.length < 3) return [];

  const sorted = [...heights].sort((a, b) => a - b);
  const body = sorted[Math.floor(sorted.length / 2)]!;

  return lines
    .filter((line) => medianWordHeight(line) >= body * HEADLINE_RATIO)
    .sort((a, b) => medianWordHeight(b) - medianWordHeight(a))
    .slice(0, MAX_HEADLINE_CANDIDATES);
}

/** Median glyph height, which tracks type size better than the line box. */
function medianWordHeight(line: OcrLine): number {
  const source = line.words.length > 0 ? line.words : [line];
  const sizes = source
    .map((word) => word.bbox.y1 - word.bbox.y0)
    .filter((size) => size > 0)
    .sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)] ?? 0;
}

function toResult(data: unknown, psm: string): OcrResult {
  const record = data as Record<string, unknown>;
  const lines = toLines(record);
  const text =
    typeof record.text === 'string' && record.text.trim()
      ? record.text
      : lines.map((line) => line.text).join('\n');

  return {
    text,
    lines,
    confidence: typeof record.confidence === 'number' ? record.confidence : 0,
    psm,
  };
}

/**
 * Prefers Tesseract's own line segmentation and only rebuilds lines from word
 * boxes if the engine produced none. Re-deriving geometry by hand merges rows
 * on dense mobile layouts, which is exactly where label and value live.
 */
function toLines(data: Record<string, unknown>): OcrLine[] {
  if (Array.isArray(data.lines)) {
    const fromEngine = data.lines
      .map(toLine)
      .filter((line): line is OcrLine => line !== null);
    if (fromEngine.length > 0) return fromEngine;
  }

  return groupIntoLines(collectWords(data));
}

function toLine(value: unknown): OcrLine | null {
  const candidate = value as Partial<OcrLine> | null;
  if (!candidate || typeof candidate.text !== 'string') return null;

  const text = candidate.text.replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const bbox = candidate.bbox ?? { x0: 0, y0: 0, x1: 0, y1: 0 };

  return {
    text,
    confidence: typeof candidate.confidence === 'number' ? candidate.confidence : 0,
    bbox: {
      x0: bbox.x0 ?? 0,
      y0: bbox.y0 ?? 0,
      x1: bbox.x1 ?? 0,
      y1: bbox.y1 ?? 0,
    },
    words: Array.isArray(candidate.words) ? (candidate.words as OcrWord[]) : [],
  };
}

function collectWords(data: Record<string, unknown>): OcrWord[] {
  if (Array.isArray(data.words) && data.words.length > 0) {
    return data.words.filter(isUsableWord);
  }

  const blocks = data.blocks;
  if (!Array.isArray(blocks)) return [];

  const words: OcrWord[] = [];
  for (const block of blocks) {
    const paragraphs = (block as { paragraphs?: unknown }).paragraphs;
    if (!Array.isArray(paragraphs)) continue;
    for (const paragraph of paragraphs) {
      const lines = (paragraph as { lines?: unknown }).lines;
      if (!Array.isArray(lines)) continue;
      for (const line of lines) {
        const lineWords = (line as { words?: unknown }).words;
        if (!Array.isArray(lineWords)) continue;
        for (const word of lineWords) {
          if (isUsableWord(word)) words.push(word);
        }
      }
    }
  }
  return words;
}

function isUsableWord(word: unknown): word is OcrWord {
  const candidate = word as Partial<OcrWord> | null;
  if (!candidate || typeof candidate.text !== 'string') return false;
  if (!candidate.text.trim()) return false;
  const bbox = candidate.bbox;
  return Boolean(bbox && typeof bbox.x0 === 'number' && typeof bbox.y0 === 'number');
}

function groupIntoLines(words: OcrWord[]): OcrLine[] {
  if (words.length === 0) return [];

  const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const groups: OcrWord[][] = [];

  for (const word of sorted) {
    const top = word.bbox.y0;
    const bottom = word.bbox.y1;
    const group = groups[groups.length - 1];

    if (group) {
      const groupTop = Math.min(...group.map((w) => w.bbox.y0));
      const groupBottom = Math.max(...group.map((w) => w.bbox.y1));
      // Same visual row when the vertical spans genuinely overlap, rather than
      // when their centres merely sit close together.
      const overlap = Math.min(bottom, groupBottom) - Math.max(top, groupTop);
      const shorter = Math.min(bottom - top, groupBottom - groupTop);
      if (shorter > 0 && overlap >= shorter * 0.5) {
        group.push(word);
        continue;
      }
    }
    groups.push([word]);
  }

  return groups.map((group) => {
    const lineWords = group.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    return {
      text: lineWords.map((w) => w.text).join(' '),
      confidence: lineWords.reduce((sum, w) => sum + (w.confidence || 0), 0) / lineWords.length,
      bbox: {
        x0: Math.min(...lineWords.map((w) => w.bbox.x0)),
        y0: Math.min(...lineWords.map((w) => w.bbox.y0)),
        x1: Math.max(...lineWords.map((w) => w.bbox.x1)),
        y1: Math.max(...lineWords.map((w) => w.bbox.y1)),
      },
      words: lineWords,
    };
  });
}
