import type { OcrLine } from '../engine';
import { cleanValue, normalizeText } from './text';

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/**
 * Currency prefixes seen in the wild, including the shapes Tesseract produces
 * when it misreads the rupee sign. `%`, `S` and `/` are low-confidence guesses
 * and are only consulted once the unambiguous forms have failed.
 */
const RUPEE = '\\u20B9';
const CURRENCY_STRICT = new RegExp(`(?:rs\\.?|inr|${RUPEE})\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)`, 'i');
const CURRENCY_LOOSE = new RegExp(`[%S/${RUPEE}]\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)`);
const BARE_AMOUNT = /(?<![\d/.,-])([1-9][0-9]{0,8}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?)(?![\d/])/g;
const BARE_DECIMAL = /(?<![\d/.,-])([1-9][0-9]{0,8}(?:,[0-9]{2,3})*\.[0-9]{2})(?![\d/])/g;
const NUMBER_TOKEN = /(?<![\d/.,-])([0-9][0-9,]*(?:\.[0-9]{1,2})?)(?![\d/])/g;
const UPI_ID = /[a-z0-9][a-z0-9._-]{1,60}@[a-z][a-z0-9]{1,30}/i;

/**
 * How much larger than body text a receipt's headline total is set. A real
 * Google Pay screenshot measured 4x; the account digits measured 2x.
 *
 * The looser tier catches receipts whose fonts OCR measures more tightly, where
 * the total lands near the boundary instead of clear of it: a three-digit total on
 * one of those was being skipped entirely, leaving the amount column empty.
 * Neither tier can settle on the wrong line, because a line only qualifies if it
 * carries a number, and the tall junk OCR invents contains none.
 */
const HEADLINE_RATIO = 2.5;
const HEADLINE_RATIO_LOOSE = 1.4;

/**
 * Bank names, longest first. Payment apps name the debit bank without a label
 * inside a card header, so a vendor list is the only way to pick it up.
 */
const BANK_VENDORS = [
  'HDFC Bank',
  'ICICI Bank',
  'State Bank',
  'Bank of Baroda',
  'Kotak Mahindra Bank',
  'Kotak Bank',
  'Axis Bank',
  'Yes Bank',
  'IndusInd Bank',
  'Punjab National Bank',
  'Canara Bank',
  'Union Bank',
  'IDFC First Bank',
  'Paytm Payments Bank',
  'Central Bank of India',
  'First Indian Bank',
  'Airtel Payments Bank',
  'Bandhan Bank',
  'IDBI Bank',
  'Bank of India',
  'Bank of Maharashtra',
  'Indian Bank',
  'Indian Overseas Bank',
  'UCO Bank',
  'Federal Bank',
  'Karur Vysya Bank',
  'RBL Bank',
  'South Indian Bank',
  'Jana Small Finance Bank',
  'Equitas Bank',
  'AU Small Finance Bank',
].join('|');
const BANK_ANYWHERE = new RegExp(`\\b(?:${BANK_VENDORS})\\b[^\\n]{0,18}`, 'i');
/**
 * Fallback for when OCR mangles the vendor's first letters.
 *
 * No leading word boundary is required: on a real capture the vendor and the word
 * "Bank" came back fused as "orcBank", which a `\bbank\b` cannot match.
 */
const BANK_GENERIC = /([a-z][a-z.&'\s]{0,24}bank\b[^\n]{0,12})/i;
/** A bank named inside brackets describes the other party, not the debit account. */
const BANK_IN_BRACKETS = /\([^)]*\bbanks?\b[^)]*\)/i;

const STATUS_WORDS: Array<[RegExp, string]> = [
  [/\bcompleted\b|\bsuccessful(?:ly)?\b|\bsuccess\b/, 'Completed'],
  [/\bfailed\b|\bfailure\b|\bdeclined\b|\brejected\b|\bcancelled\b|\bcanceled\b/, 'Failed'],
  [/\bpending\b|\bprocessing\b|\bin progress\b|\binitiated\b/, 'Pending'],
];

export interface ParsedDateTime {
  date: string | null;
  time: string | null;
}

/**
 * Extracts the amount as a bare number string so spreadsheet apps treat it as a
 * numeric cell rather than text. Currency symbols are dropped; callers label
 * the column with the currency.
 *
 * The figure comes from the page, then the engine's isolated re-read of the
 * headline may correct it. The re-read is deliberately allowed only to trim the
 * page's leading digits, never to supply a figure of its own: it shares OCR's
 * failure modes with the page read, and giving it the final say let a stray "3
 * working days" in a disclaimer become the amount.
 */
export function extractAmount(lines: OcrLine[], headline?: string | null): string | null {
  const fromPage = extractPageAmount(lines);
  return trimCurrencyArtefact(fromPage, headline) ?? fromPage;
}

/**
 * Strategies are tried in descending order of trust: heading-scoped first, then
 * the largest type on screen, then currency glyphs, then a bare decimal. The
 * ordering matters: Tesseract frequently turns the rupee sign into "%" or "3", and
 * a bare "1,500" is indistinguishable from a reference number without the
 * font-size signal that a receipt's headline total is set far larger than
 * everything around it.
 */
function extractPageAmount(lines: OcrLine[]): string | null {
  const text = lines.map((line) => line.text).join('\n');

  const labelled = findLineMatching(lines, /\b(amount|total|amt)\b/);
  if (labelled) {
    const match = CURRENCY_STRICT.exec(labelled) ?? CURRENCY_LOOSE.exec(labelled);
    if (match?.[1]) return normalizeNumber(match[1]);
    const bare = BARE_AMOUNT.exec(labelled);
    if (bare?.[1]) return normalizeNumber(bare[1]);
  }

  const headline = extractHeadlineAmount(lines);
  if (headline) return headline;

  const symbolised = [
    ...text.matchAll(new RegExp(CURRENCY_STRICT.source, 'gi')),
    ...text.matchAll(new RegExp(CURRENCY_LOOSE.source, 'g')),
  ]
    .map((match) => toNumber(match[1] ?? ''))
    .filter((value) => Number.isFinite(value));
  if (symbolised.length > 0) return String(Math.max(...symbolised));

  // A two-decimal figure is distinctive enough to be treated as an amount even
  // when the currency glyph was lost entirely.
  const decimals = [...text.matchAll(BARE_DECIMAL)]
    .map((match) => toNumber(match[1] ?? ''))
    .filter((value) => Number.isFinite(value));

  return decimals.length > 0 ? String(Math.max(...decimals)) : null;
}

/**
 * Drops digits that the currency glyph contributed to the front of the figure.
 *
 * Read from the page, a ₹2,000 total came back as "32,000": the sign was read as a
 * "3" and glued onto the digits. Read again from the total's own crop the same
 * pixels give "2,000", which is exactly the page figure minus its leading digit.
 *
 * So the re-read is accepted only when it is the page figure's own trailing
 * digits, trimmed. Anything else is ignored:
 *
 * - a different figure, so the two readings are not describing the same total;
 * - a lone digit, which on a receipt is far likelier to be an ordinal or a
 *   fragment of surrounding text than a payment;
 * - digits appearing only in the re-read, which would let it invent an amount;
 * - a result beginning with a zero, which is a cropped fragment rather than a
 *   total.
 */
function trimCurrencyArtefact(page: string | null, headline?: string | null): string | null {
  if (!page || !headline) return null;

  const fromCrop = coerceAmount(headline);
  if (!fromCrop || fromCrop === page) return null;
  if (fromCrop.length < 2 || /^0\d/.test(fromCrop)) return null;

  // A lone digit is not a payment total but a fragment of one: OCR split "2,000"
  // into spaced single digits on a real receipt, and the largest-token rule kept
  // only one of them. The crop is a re-read of the total's own text at a scale
  // where OCR keeps the figure together, so it settles the question. The two-digit
  // minimum above is what stops "up to 3 working days" from being taken for one.
  if (page.length === 1) return fromCrop;

  if (fromCrop.length >= page.length || !page.endsWith(fromCrop)) return null;
  // A currency sign is one glyph wide; more than two extra digits means the two
  // readings are different figures rather than one figure plus debris.
  if (page.length - fromCrop.length > 2) return null;

  return fromCrop;
}

/**
 * Reads the amount off the largest glyph run in the image, which on a payment
 * receipt is always the headline total. This is the only strategy that survives
 * the rupee sign being misread, and it cannot latch onto a 12-digit reference
 * number set in ordinary body text.
 *
 * The body is used as the reference rather than the tallest line, because OCR
 * routinely invents tall junk: on a real Google Pay receipt the rupee glyph came
 * back as a lone "2," on its own line, 81px tall, above a 72px total. Ranking
 * lines against each other would call that the headline, whereas measuring
 * against ordinary body text isolates the total.
 *
 * On that receipt the total sits at 4x the body size. Requiring 2.5x keeps the
 * real headline while leaving out the 2x-tall account line and the date.
 */
/**
 * Sizes a receipt's total is set at, as a multiple of its body text.
 *
 * 2.5x is the usual case. The looser tier catches receipts whose fonts OCR
 * measures more tightly, where the total lands near the boundary instead of
 * clear of it: a total of three digits on one of those was being skipped
 * entirely, leaving the amount column empty. Neither tier can settle on the
 * wrong line, because a line only qualifies if it actually carries a number and
 * the tall junk OCR invents contains none.
 */
function extractHeadlineAmount(lines: OcrLine[]): string | null {
  const heights = lines
    .map(lineHeight)
    .filter((size) => size > 0)
    .sort((a, b) => a - b);
  if (heights.length < 3) return null;

  const median = heights[Math.floor(heights.length / 2)]!;
  const candidates: number[] = [];

  for (const line of lines) {
    for (const match of line.text.matchAll(new RegExp(NUMBER_TOKEN.source, 'g'))) {
      const token = match[1] ?? '';
      // Long digit runs are references, not totals.
      if (token.replace(/\D/g, '').length > 9) continue;
      const value = toNumber(token);
      if (Number.isFinite(value)) candidates.push(value);
    }
  }

  if (candidates.length === 0) return null;

  for (const ratio of [HEADLINE_RATIO, HEADLINE_RATIO_LOOSE]) {
    const found = lines
      .filter((line) => lineHeight(line) >= median * ratio)
      .flatMap((line) =>
        [...line.text.matchAll(new RegExp(NUMBER_TOKEN.source, 'g'))]
          .map((match) => match[1] ?? '')
          .filter((token) => token.replace(/\D/g, '').length <= 9)
          .map(toNumber)
          .filter((value) => Number.isFinite(value)),
      );

    if (found.length > 0) return String(Math.max(...found));
  }

  return null;
}

/** Median glyph height, which is more stable than the line box. */
function lineHeight(line: OcrLine): number {
  if (line.words.length > 0) {
    const heights = line.words
      .map((word) => word.bbox.y1 - word.bbox.y0)
      .filter((height) => height > 0)
      .sort((a, b) => a - b);
    if (heights.length > 0) return heights[Math.floor(heights.length / 2)]!;
  }
  return line.bbox.y1 - line.bbox.y0;
}

/**
 * Where the fixed boilerplate that closes a payment receipt begins.
 *
 * Every one of these apps ends the screen with the same settlement disclaimer
 * and the UPI network wordmark. OCR wraps that sentence across several lines, so
 * a stray fragment such as a lone "account" ends up on a line of its own and is
 * indistinguishable from a field heading. Reading past it is how an "Account"
 * column holding the value "POWERED BY" gets invented.
 */
const FOOTER_START =
  /payments?\s+may\s+take|working\s+days|reflected\s+in\s+your|powered\s+by|no\s+cheque|terms\s+and\s+conditions/i;

/**
 * Truncates a receipt at its boilerplate footer.
 *
 * Provider detection still runs against the full text, since the app wordmark
 * that identifies it sits inside the footer.
 */
export function withoutFooter(lines: OcrLine[]): OcrLine[] {
  const cut = lines.findIndex((line) => FOOTER_START.test(normalizeText(line.text)));
  return cut === -1 ? lines : lines.slice(0, cut);
}

/**
 * Finds the debit bank, which these apps print without any label.
 *
 * These screens print the bank twice: once as a card heading above the
 * transaction details, and once parenthetically inside the recipient block
 * ("From: LOKESH S (ICICI Bank)"). The heading is the account that was actually
 * debited, so an unparenthesised "X Bank" line wins wherever it appears.
 *
 * A known vendor name is preferred over a generic one, but OCR often wrecks the
 * first letters — a real receipt came back as "£1) Hore Bank 7625" — so the
 * vendor list is treated as a strong hint rather than a requirement.
 */
export function extractBank(lines: OcrLine[]): string | null {
  const named = (line: OcrLine) => BANK_ANYWHERE.exec(line.text)?.[0] ?? '';
  const generic = (line: OcrLine) => BANK_GENERIC.exec(line.text)?.[0] ?? '';
  const isHeading = (line: OcrLine) => !BANK_IN_BRACKETS.test(line.text);

  for (const line of lines) {
    if (!isHeading(line)) continue;
    const match = named(line);
    if (match) return cleanValue(match) || null;
  }

  for (const line of lines) {
    if (!isHeading(line)) continue;
    const match = generic(line);
    if (match) return cleanValue(match) || null;
  }

  for (const line of lines) {
    const match = named(line);
    if (match) return cleanValue(match) || null;
  }

  return null;
}

export function extractStatus(lines: OcrLine[]): string | null {
  const haystack = lines.map((line) => normalizeText(line.text)).join(' ');
  for (const [pattern, value] of STATUS_WORDS) {
    if (pattern.test(haystack)) return value;
  }
  return null;
}

export function extractUpiIds(lines: OcrLine[]): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    for (const match of line.text.matchAll(new RegExp(UPI_ID.source, 'gi'))) {
      const value = match[0].toLowerCase();
      if (seen.has(value)) continue;
      seen.add(value);
      found.push(value);
    }
  }
  return found;
}

/**
 * Parses the first date it can find, preferring dates that sit on a line with a
 * date-ish label. Returns ISO `YYYY-MM-DD` and 24-hour `HH:MM` so Excel sorts
 * and filters correctly.
 */
export function extractDateTime(lines: OcrLine[]): ParsedDateTime {
  const seen = new Set<OcrLine>();
  const ordered: OcrLine[] = [];
  for (const line of [...findLinesMatching(lines, /\b(date|time)\b/), ...lines]) {
    if (seen.has(line)) continue;
    seen.add(line);
    ordered.push(line);
  }

  // Date and time are tracked separately because OCR often splits a single
  // "12 Aug 2026, 03:45 pm" stamp across two lines, and stopping at the first
  // line that yields either half would drop the other.
  let date: string | null = null;
  let time: string | null = null;

  for (const line of ordered) {
    if (!time) time = parseTime(line.text);
    if (!date) date = parseDate(line.text);
    if (date && time) break;
  }

  return { date, time };
}

export function parseDate(raw: string): string | null {
  const text = raw.trim();

  let match = /(\d{4})[\-\/.](\d{1,2})[\-\/.](\d{1,2})/.exec(text);
  if (match) {
    return toIso(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  match = /(\d{1,2})[\s\-/.]*([a-z]{3,9})[\s\-/.,]*(\d{2,4})/i.exec(text);
  if (match) {
    const month = MONTHS[(match[2] ?? '').toLowerCase()];
    if (month) {
      return toIso(expandYear(Number(match[3])), month, Number(match[1]));
    }
  }

  match = /(\d{1,2})[\-\/.](\d{1,2})[\-\/.](\d{2,4})/.exec(text);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    // India writes day-first. A first part above 12 confirms it; a second part
    // above 12 rules it out and means the value is month-first.
    const day = second > 12 ? second : first;
    const month = second > 12 ? first : second;
    return toIso(expandYear(Number(match[3])), month, day);
  }

  return null;
}

export function parseTime(raw: string): string | null {
  const match = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])\.?m\.?/i.exec(raw);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[4]?.toLowerCase();

  if (meridiem === 'p' && hour < 12) hour += 12;
  if (meridiem === 'a' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;

  return `${pad(hour)}:${pad(minute)}`;
}

function expandYear(year: number): number {
  if (year >= 1000) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

function toIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1990 || year > 2100) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

export function coerceAmount(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = /([0-9][0-9,]*(?:\.[0-9]{1,2})?)/.exec(raw);
  return match?.[1] ? normalizeNumber(match[1]) : null;
}

function normalizeNumber(value: string): string {
  const numeric = toNumber(value);
  if (!Number.isFinite(numeric)) return cleanValue(value);
  return String(numeric);
}

function toNumber(value: string): number {
  const cleaned = value.replace(/,/g, '');
  const numeric = Number.parseFloat(cleaned);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function findLinesMatching(lines: OcrLine[], pattern: RegExp): OcrLine[] {
  return lines.filter((line) => pattern.test(normalizeText(line.text)));
}

function findLineMatching(lines: OcrLine[], pattern: RegExp): string | null {
  const found = findLinesMatching(lines, pattern);
  return found.length > 0 ? found[0]!.text : null;
}
