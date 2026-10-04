import { FIELDS } from '../../types';
/** Lower-cases, strips decorative punctuation and collapses whitespace. */
export function normalizeText(input: string): string {
  return normalizeWithMap(input).text;
}

/**
 * Same transform as `normalizeText`, but also returns the source index for every
 * output character. Callers need this to lift a matched value back out of the
 * original line, which is the only way to keep the casing OCR actually read.
 */
export function normalizeWithMap(input: string): { text: string; map: number[] } {
  let out = '';
  const map: number[] = [];

  for (let i = 0; i < input.length; i++) {
    let char = input[i]!;
    if (char === '\u2018' || char === '\u2019') char = "'";
    else if (char === '\u201c' || char === '\u201d') char = '"';
    else if (char === '\u00a0') char = ' ';

    if (/\s/.test(char)) {
      if (out.length > 0 && !out.endsWith(' ')) {
        out += ' ';
        map.push(i);
      }
      continue;
    }

    out += char.toLowerCase();
    map.push(i);
  }

  let start = 0;
  let end = out.length;
  while (start < end && isSeparator(out[start]!)) start++;
  while (end > start && isSeparator(out[end - 1]!)) end--;

  return { text: out.slice(start, end), map: map.slice(start, end) };
}

/**
 * True for anything that is not a letter or a digit.
 *
 * Payment apps print decorative glyphs directly before a heading — a tick read as
 * "@" or "©", a masked phone number, a rupee sign — and OCR turns them into
 * whatever shape it saw. Treating every such character as a separator at the
 * edges of a line keeps those artefacts from hiding the heading behind them.
 * Mid-string characters are untouched, so UPI handles stay one token.
 */
function isSeparator(char: string): boolean {
  return /[^\p{L}\p{N}]/u.test(char);
}

const LEADING_SEPARATORS = /^[^\p{L}\p{N}]+/u;
const TRAILING_SEPARATORS = /[^\p{L}\p{N}]+$/u;

export function cleanValue(input: string): string {
  return input
    .replace(/[‘’]/g, "'")
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(LEADING_SEPARATORS, '')
    .replace(TRAILING_SEPARATORS, '')
    .trim();
}

/**
 * Finds `phrase` inside `haystack` only at word boundaries, so "to" does not
 * match inside "total" or "transaction".
 */
export function indexOfPhrase(haystack: string, phrase: string): number {
  if (!phrase) return -1;
  let from = 0;

  while (from <= haystack.length - phrase.length) {
    const index = haystack.indexOf(phrase, from);
    if (index === -1) return -1;

    const before = index === 0 ? ' ' : haystack[index - 1]!;
    const after = haystack[index + phrase.length] ?? ' ';
    const boundaryBefore = !/[a-z0-9]/.test(before);
    const boundaryAfter = !/[a-z0-9]/.test(after);

    if (boundaryBefore && boundaryAfter) return index;
    from = index + 1;
  }
  return -1;
}

const ALL_ALIASES: string[] = FIELDS.flatMap((field) => field.aliases).sort(
  (a, b) => b.length - a.length,
);

const PLACEHOLDERS = new Set([
  '',
  '-',
  '--',
  'na',
  'n a',
  'nil',
  'none',
  'no note',
  'no notes added',
  'not available',
  'not added',
  'add a note',
  'optional',
  'yes',
  'no',
]);

export function isMeaningful(value: string | null | undefined): value is string {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) return false;
  if (PLACEHOLDERS.has(normalized)) return false;
  return true;
}

/** True when the text is itself a field heading rather than a value. */
export function looksLikeLabel(value: string): boolean {
  const normalized = normalizeText(value);
  if (!normalized) return true;
  return ALL_ALIASES.some((alias) => appearsAsLabel(normalized, alias));
}

/**
 * A label is a heading that starts the line, optionally followed by its value.
 * Requiring the alias to lead the line keeps short aliases like "to" from
 * matching arbitrary prose further down the receipt.
 */
export function appearsAsLabel(normalizedLine: string, alias: string): boolean {
  if (!normalizedLine.startsWith(alias)) return false;
  const rest = normalizedLine.slice(alias.length);
  if (rest.length === 0) return true;
  return /^[\s:.>»|,*\-–—_]/.test(rest) || rest.startsWith(' ');
}
