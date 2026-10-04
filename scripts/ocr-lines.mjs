/**
 * Prints the per-line geometry the parser actually sees.
 *
 * The amount extractor keys off glyph height, so "why was the amount missed"
 * can only be answered with real numbers rather than guesses. This runs the
 * same Tesseract configuration as the app, outside the browser, and reports
 * each line's text next to the median glyph height the parser measures.
 *
 * Run with: node scripts/ocr-lines.mjs [fixtureName | absolutePath]
 */
import { createWorker, PSM } from 'tesseract.js';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = resolve(ROOT, '.screenshots', 'fixtures');

/** Accepts a fixture name from .screenshots/fixtures, or any path on disk. */
function resolveInput(input) {
  if (isAbsolute(input) && existsSync(input)) return resolve(input);
  const candidate = resolve(FIXTURES, input);
  if (existsSync(candidate)) return candidate;
  return null;
}

const requested = process.argv[2];
const file = requested
  ? resolveInput(requested)
  : resolveInput(readdirSync(FIXTURES).find((f) => /\.(png|jpe?g)$/i.test(f)) ?? '');

if (!file) {
  console.error('No image found. Run: node scripts/e2e.mjs, or pass a path.');
  process.exit(1);
}

const worker = await createWorker('eng');
await worker.setParameters({
  tessedit_pageseg_mode: PSM.SPARSE_TEXT,
  preserve_interword_spaces: '1',
});

const { data } = await worker.recognize(file, {}, { blocks: true, text: true });
await worker.terminate();

const lines = Array.isArray(data.lines) ? data.lines : [];
const heights = lines.map(medianWordHeight).filter((h) => h > 0).sort((a, b) => a - b);

console.log(`image: ${file}`);
console.log(`(${statSync(file).size} bytes)`);
console.log(`lines: ${lines.length}   confidence: ${data.confidence}\n`);

const median = heights[Math.floor(heights.length / 2)] ?? 0;
const largest = heights[heights.length - 1] ?? 0;
console.log(`median glyph height: ${median}`);
console.log(`largest glyph height: ${largest}`);
console.log(`headline outlier test: largest >= runner-up * 1.5\n`);

for (const [index, line] of lines.entries()) {
  const text = line.text.replace(/\s+/g, ' ').trim();
  if (!text) continue;
  const height = medianWordHeight(line);
  const isHeadline = height >= median * 1.25;
  console.log(
    `${String(index).padStart(3)}  h=${String(Math.round(height)).padStart(4)}  ` +
      `${isHeadline ? 'HEAD' : '    '}  ${text}`,
  );
}

function medianWordHeight(line) {
  const words = Array.isArray(line.words) ? line.words : [];
  const source = words.length > 0 ? words : [line];
  const sizes = source
    .map((word) => word.bbox.y1 - word.bbox.y0)
    .filter((size) => size > 0)
    .sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)] ?? 0;
}
