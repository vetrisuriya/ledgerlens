import { FIELD_BY_KEY, type FieldKey, type TransactionRow } from '../types';

export type OutputFormat = 'csv' | 'tsv' | 'markdown' | 'html' | 'json' | 'xlsx' | 'pdf';

export const FORMAT_LABEL: Record<OutputFormat, string> = {
  csv: 'CSV',
  tsv: 'Excel (tab separated)',
  markdown: 'Markdown table',
  html: 'HTML',
  json: 'JSON',
  xlsx: 'Excel (.xlsx)',
  pdf: 'PDF',
};

export const FORMAT_EXT: Record<OutputFormat, string> = {
  csv: 'csv',
  tsv: 'txt',
  markdown: 'md',
  html: 'html',
  json: 'json',
  xlsx: 'xlsx',
  pdf: 'pdf',
};

export const FORMAT_MIME: Record<OutputFormat, string> = {
  csv: 'text/csv;charset=utf-8',
  tsv: 'text/tab-separated-values;charset=utf-8',
  markdown: 'text/markdown;charset=utf-8',
  html: 'text/html;charset=utf-8',
  json: 'application/json;charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

export function columnLabel(key: FieldKey): string {
  return FIELD_BY_KEY[key]?.label ?? key;
}

export function cellValue(row: TransactionRow, key: FieldKey): string {
  return row.values[key]?.trim() ?? '';
}

function escapeDelimited(value: string, delimiter: string): string {
  const needsQuotes =
    value.includes(delimiter) || value.includes('"') || /[\r\n]/.test(value);
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

function stripForMarkdown(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
}

export function toDelimited(
  rows: TransactionRow[],
  columns: FieldKey[],
  delimiter: string,
  options: { includeSourceFile?: boolean } = {},
): string {
  const headers = options.includeSourceFile
    ? ['Source File', ...columns.map(columnLabel)]
    : columns.map(columnLabel);

  const lines = [headers.map((h) => escapeDelimited(h, delimiter)).join(delimiter)];

  for (const row of rows) {
    const cells = columns.map((key) => escapeDelimited(cellValue(row, key), delimiter));
    if (options.includeSourceFile) cells.unshift(escapeDelimited(row.sourceFile, delimiter));
    lines.push(cells.join(delimiter));
  }

  // Excel needs a BOM to detect UTF-8, otherwise ₹ and other symbols garble.
  return lines.join('\r\n');
}

export function toCsv(rows: TransactionRow[], columns: FieldKey[]): string {
  return toDelimited(rows, columns, ',');
}

export function toTsv(rows: TransactionRow[], columns: FieldKey[]): string {
  return toDelimited(rows, columns, '\t');
}

export function toMarkdown(rows: TransactionRow[], columns: FieldKey[]): string {
  if (rows.length === 0) return '_No rows yet._';

  const headers = columns.map(columnLabel);
  const separator = headers.map(() => '---');
  const body = rows.map((row) =>
    columns.map((key) => stripForMarkdown(cellValue(row, key))).join(' | '),
  );

  return [
    `| ${headers.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...body.map((line) => `| ${line} |`),
  ].join('\n');
}

export function toJson(rows: TransactionRow[], columns: FieldKey[]): string {
  const records = rows.map((row) => {
    const record: Record<string, string> = { 'Source File': row.sourceFile };
    for (const key of columns) record[columnLabel(key)] = cellValue(row, key);
    return record;
  });
  return JSON.stringify(records, null, 2);
}

export function toHtml(rows: TransactionRow[], columns: FieldKey[]): string {
  const headers = columns.map(columnLabel);
  const body = rows
    .map((row) => {
      const cells = columns
        .map((key) => `<td>${escapeHtml(cellValue(row, key))}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Payment transactions</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 24px; color: #111; }
  h1 { font-size: 18px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { border: 1px solid #d4d4d8; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f4f4f5; position: sticky; top: 0; }
  tbody tr:nth-child(even) { background: #fafafa; }
</style>
</head>
<body>
<h1>Payment transactions (${rows.length})</h1>
<table>
<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
<tbody>
${body}
</tbody>
</table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function serialize(
  format: OutputFormat,
  rows: TransactionRow[],
  columns: FieldKey[],
): string | null {
  switch (format) {
    case 'csv':
      return toCsv(rows, columns);
    case 'tsv':
      return toTsv(rows, columns);
    case 'markdown':
      return toMarkdown(rows, columns);
    case 'html':
      return toHtml(rows, columns);
    case 'json':
      return toJson(rows, columns);
    default:
      return null;
  }
}
