import {
  DEFAULT_COLUMNS,
  FIELDS,
  FIELD_BY_KEY,
  PROVIDER_LABEL,
  type FieldKey,
  type ProviderId,
  type TransactionRow,
} from '../../types';
import type { OcrLine, OcrResult } from '../engine';
import { appearsAsLabel, cleanValue, indexOfPhrase, isMeaningful, looksLikeLabel, normalizeText, normalizeWithMap } from './text';
import {
  coerceAmount,
  extractAmount,
  extractBank,
  extractDateTime,
  extractStatus,
  extractUpiIds,
  parseDate,
  parseTime,
  withoutFooter,
} from './values';

const PROVIDER_SIGNATURES: Array<[ProviderId, RegExp]> = [
  ['phonepe', /\bphone\s?pe\b|\bphonepe\b/i],
  ['gpay', /\bgoogle\s?pay\b|\bgpay\b|\bg\s?pay\b/i],
];

const MAX_COLUMNS = 12;
const MIN_SCHEMA_FIELDS = 3;

export function detectProvider(text: string): ProviderId {
  for (const [provider, pattern] of PROVIDER_SIGNATURES) {
    if (pattern.test(text)) return provider;
  }
  return 'generic';
}

/**
 * Turns one recognised screenshot into a single table row.
 *
 * Strategy is label-first: receipt UIs put a heading and its value either side
 * by side or on consecutive lines, and that pairing is far more dependable than
 * pattern matching the whole page. Regex extraction is kept as a fallback for
 * every field so a partial OCR still yields a usable row.
 */
export function extractTransaction(
  ocr: OcrResult,
  sourceFile: string,
  id: string,
): TransactionRow {
  const lines = ocr.lines;
  const text = ocr.text.trim() || lines.map((line) => line.text).join('\n');
  const provider = detectProvider(text);
  const values: Partial<Record<FieldKey, string | null>> = {};

  // Field data lives above the settlement disclaimer, so it is the only part of
  // the screen that headings are read from. The full text is still used for
  // provider detection, since the app wordmark sits in the footer.
  const body = withoutFooter(lines);
  const bodyText = body.map((line) => line.text).join('\n');

  values.provider = PROVIDER_LABEL[provider];
  values.status = extractStatus(body);
  values.amount =
    coerceAmount(findByLabel(body, FIELD_BY_KEY.amount.aliases)) ??
    extractAmount(body, ocr.headline);

  const upiIds = extractUpiIds(body);
  const rawPayee = findByLabel(body, FIELD_BY_KEY.payee.aliases);

  if (rawPayee && looksLikeUpiId(rawPayee)) {
    // "Paid to ravi@ybl" — the handle is the value, so file it accordingly.
    values.payeeUpiId = rawPayee.toLowerCase();
    values.payee = null;
  } else {
    values.payee = rawPayee ?? undefined;
  }

  values.payerName =
    findByLabel(body, FIELD_BY_KEY.payerName.aliases, { exclude: /\(/ }) ??
    findByLabel(body, FIELD_BY_KEY.payerName.aliases) ??
    undefined;
  values.payerBank =
    findByLabel(body, FIELD_BY_KEY.payerBank.aliases, { exclude: /\(/ }) ??
    extractBank(body) ??
    undefined;
  values.payerAccount = findByLabel(body, FIELD_BY_KEY.payerAccount.aliases) ?? undefined;

  const payeeUpi = upiIds.find((id_) => id_ !== values.payeeUpiId);
  values.payeeUpiId = values.payeeUpiId ?? payeeUpi ?? undefined;
  values.payerUpiId = upiIds.find((id_) => id_ !== values.payeeUpiId) ?? undefined;

  // Transaction ID and UPI reference are both 12-digit numbers on some apps, so
  // a label is the only reliable way to tell them apart. Google Pay prints both
  // a "UPI transaction ID" and a "Google transaction ID", so the generic
  // heading is barred from matching lines that name a more specific scope.
  values.upiRefNo = findByLabel(body, FIELD_BY_KEY.upiRefNo.aliases) ?? null;
  values.transactionId =
    findByLabel(body, FIELD_BY_KEY.transactionId.aliases, { exclude: /\bupi\b/i }) ?? null;

  const claimed = new Set(
    [values.transactionId, values.upiRefNo].filter((value): value is string => Boolean(value)),
  );
  const leftover = [...bodyText.matchAll(/\b\d{12,24}\b/g)]
    .map((match) => match[0])
    .find((value) => !claimed.has(value));

  if (leftover) {
    if (!values.upiRefNo && !values.transactionId) {
      if (/google\s?pay|\bgpay\b/i.test(text)) values.upiRefNo = leftover;
      else values.transactionId = leftover;
    } else if (!values.transactionId) {
      values.transactionId = leftover;
    } else if (!values.upiRefNo) {
      values.upiRefNo = leftover;
    }
  }

  const dateLabel = findByLabel(body, FIELD_BY_KEY.date.aliases);
  const fallback = extractDateTime(body);
  values.date = (dateLabel ? parseDate(dateLabel) : null) ?? fallback.date ?? undefined;
  values.time = (dateLabel ? parseTime(dateLabel) : null) ?? fallback.time ?? undefined;

  values.method = findByLabel(body, FIELD_BY_KEY.method.aliases) ?? undefined;
  values.note = findByLabel(body, FIELD_BY_KEY.note.aliases) ?? undefined;
  values.orderId = findByLabel(body, ['order id', 'orderid', 'order number']) ?? undefined;

  const row: TransactionRow = {
    id,
    sourceFile,
    provider,
    values: prune(values),
    rawText: text,
    psm: ocr.psm,
  };

  if (Object.keys(row.values).length <= 1) {
    row.error = 'No transaction fields could be read from this image';
  }
  if (ocr.confidence > 0) row.confidence = Math.round(ocr.confidence);

  return row;
}

/**
 * Derives the table schema from the reference image by reading which field
 * headings actually appear on it, keeping the order they appear in.
 */
export function deriveColumns(ocr: OcrResult): FieldKey[] {
  const ordered: FieldKey[] = [];
  const seen = new Set<FieldKey>();

  // A wrapped line of settlement boilerplate can look exactly like a heading, so
  // the footer is dropped before any heading is read.
  const body = withoutFooter(ocr.lines);

  for (const line of body) {
    const normalized = normalizeText(line.text);
    if (!normalized) continue;

    // A line can satisfy several fields ("Paid to" reads as both a status word
    // and a recipient heading), so the longest matching alias wins rather than
    // whichever field happens to be declared first.
    let best: { key: FieldKey; length: number } | null = null;

    for (const field of FIELDS) {
      if (seen.has(field.key)) continue;
      for (const alias of field.aliases) {
        if (!appearsAsLabel(normalized, alias)) continue;
        if (!best || alias.length > best.length) best = { key: field.key, length: alias.length };
      }
    }

    if (best) {
      seen.add(best.key);
      ordered.push(best.key);
    }
    if (ordered.length >= MAX_COLUMNS) break;
  }

  const bodyText = body.map((line) => line.text).join('\n');

  // Several fields on a payment receipt are printed as a value with no heading
  // above them: the amount, the timestamp, both UPI handles, the debit bank and
  // the status are all unlabelled. Those are detected by shape instead, and
  // slotted in at the position a reader expects them.
  const handles = extractUpiIds(body);
  const shaped: Array<[FieldKey, boolean, number]> = [
    ['amount', extractAmount(body, ocr.headline) !== null, RANK_OF.amount!],
    ['payeeUpiId', handles.length > 0, RANK_OF.payeeUpiId!],
    ['payerUpiId', handles.length > 1, RANK_OF.payerUpiId!],
    ['payerBank', extractBank(body) !== null, RANK_OF.payerBank!],
    ['date', parseDate(bodyText) !== null, RANK_OF.date!],
    ['status', extractStatus(body) !== null, RANK_OF.status!],
  ];

  for (const [key, present, rank] of shaped) {
    if (!present || seen.has(key)) continue;
    seen.add(key);
    insertRanked(ordered, key, rank);
  }

  return ordered.length >= MIN_SCHEMA_FIELDS ? ordered.slice(0, MAX_COLUMNS) : DEFAULT_COLUMNS;
}

/** Places a value-only column next to its sibling, else in rank order. */
function insertRanked(ordered: FieldKey[], key: FieldKey, rank: number): void {
  const anchors: Partial<Record<FieldKey, FieldKey>> = {
    payeeUpiId: 'payee',
    payerUpiId: 'payerName',
    payerBank: 'payerName',
    date: 'status',
  };

  const anchor = anchors[key];
  const after = anchor ? ordered.indexOf(anchor) : -1;
  if (after !== -1) {
    ordered.splice(after + 1, 0, key);
    return;
  }

  let at = 0;
  while (at < ordered.length && rank > (RANK_OF[ordered[at]!] ?? 99)) at++;
  ordered.splice(at, 0, key);
}

/** Rough reading position, used to keep value-only columns in a sensible order. */
const RANK_OF: Partial<Record<FieldKey, number>> = {
  amount: 0,
  payee: 1,
  payeeUpiId: 1,
  payerName: 2,
  payerBank: 3,
  payerUpiId: 3,
  transactionId: 4,
  upiRefNo: 4,
  date: 5,
  time: 5,
  status: 6,
  provider: 7,
};

/**
 * Finds the value belonging to a field heading.
 *
 * Receipts render either `Heading value` on one line or `Heading` followed by
 * `value` on the next, so both layouts are handled. A value that is itself a
 * heading is treated as a miss to avoid bleeding one field into the next.
 */
/**
 * Finds the value belonging to a field heading.
 *
 * Receipts render either `Heading value` on one line or `Heading` followed by
 * `value` on the next, so both layouts are handled. Matching is anchored to the
 * start of a line first, since that is unambiguous, then falls back to a
 * word-boundary search for headings that OCR glued onto a preceding line.
 */
function findByLabel(
  lines: OcrLine[],
  aliases: string[],
  options: { exclude?: RegExp } = {},
): string | null {
  const sortedAliases = [...aliases].sort((a, b) => b.length - a.length);
  return (
    scanLines(lines, sortedAliases, 'anchored', options.exclude) ??
    scanLines(lines, sortedAliases, 'anywhere', options.exclude)
  );
}

function scanLines(
  lines: OcrLine[],
  aliases: string[],
  mode: 'anchored' | 'anywhere',
  exclude?: RegExp,
): string | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const { text: normalized, map } = normalizeWithMap(line.text);
    if (!normalized) continue;
    if (exclude?.test(line.text)) continue;

    // Longest match wins so "paid to" is preferred over a stray "paid".
    let best: { alias: string; index: number } | null = null;
    for (const alias of aliases) {
      let index = -1;
      if (mode === 'anchored') {
        if (appearsAsLabel(normalized, alias)) index = 0;
      } else if (alias.includes(' ')) {
        // Only multi-word headings are safe to hunt for mid-line. A bare "bank"
        // inside "HDFC Bank 7625" would otherwise report the account digits as
        // the bank name.
        index = indexOfPhrase(normalized, alias);
      }
      if (index === -1) continue;
      if (!best || alias.length > best.alias.length) best = { alias, index };
    }
    if (!best) continue;

    const afterAlias = normalized.slice(best.index + best.alias.length);
    const stripped = afterAlias.replace(/^[\s:.>»|,:*\-–—_]+/, '');
    const inline = stripped.trim();

    if (inline.length > 0) {
      // The match turned out to be a different heading, so keep looking rather
      // than reporting an empty value for this field.
      if (isMeaningful(inline) && !looksLikeLabel(inline)) {
        return cleanValue(originalSlice(line.text, map, normalized, stripped, inline));
      }
      continue;
    }

    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
      const candidate = cleanValue(lines[j]!.text);
      if (!isMeaningful(candidate)) continue;
      if (looksLikeLabel(candidate)) break;
      return candidate;
    }
  }
  return null;
}

/**
 * Recovers the value from the untouched line so casing and inner punctuation
 * survive the round trip through the lower-cased comparison form.
 */
function originalSlice(
  line: string,
  map: number[],
  normalized: string,
  stripped: string,
  inline: string,
): string {
  const from = normalized.length - stripped.length + (stripped.length - stripped.trimStart().length);
  const to = from + inline.length;

  const start = map[from] ?? 0;
  const end = (map[to - 1] ?? start) + 1;
  return line.slice(start, end);
}

function looksLikeUpiId(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{1,60}@[a-z][a-z0-9]{1,30}$/i.test(value.trim());
}

function prune(
  values: Partial<Record<FieldKey, string | null>>,
): Partial<Record<FieldKey, string>> {
  const output: Partial<Record<FieldKey, string>> = {};
  for (const [key, value] of Object.entries(values)) {
    if (isMeaningful(value)) output[key as FieldKey] = value;
  }
  return output;
}
