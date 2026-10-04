import { type FieldKey, type TransactionRow } from '../types';
import {
  FORMAT_EXT,
  FORMAT_MIME,
  columnLabel,
  cellValue,
  serialize,
  type OutputFormat,
} from './format';

const NUMERIC_FIELDS = new Set<FieldKey>(['amount']);

/** Minimal shape of the jspdf-autotable plugin, which ships loose typings. */
type ApplyAutoTable = (doc: unknown, options: Record<string, unknown>) => void;

export async function copyAs(
  format: OutputFormat,
  rows: TransactionRow[],
  columns: FieldKey[],
): Promise<{ ok: boolean; message: string }> {
  if (rows.length === 0) return { ok: false, message: 'Nothing to copy yet' };

  if (format === 'xlsx' || format === 'pdf') {
    return {
      ok: false,
      message: `Browsers cannot put ${format.toUpperCase()} files on the clipboard — use Export instead`,
    };
  }

  const text = serialize(format, rows, columns);
  if (text === null) return { ok: false, message: 'Unsupported format' };

  try {
    await navigator.clipboard.writeText(text);
    return { ok: true, message: `Copied as ${format.toUpperCase()}` };
  } catch {
    return { ok: false, message: 'Clipboard blocked by the browser' };
  }
}

export async function exportAs(
  format: OutputFormat,
  rows: TransactionRow[],
  columns: FieldKey[],
): Promise<{ ok: boolean; message: string }> {
  if (rows.length === 0) return { ok: false, message: 'Nothing to export yet' };

  const name = buildFilename(format);

  try {
    if (format === 'xlsx') {
      await downloadXlsx(rows, columns, name);
    } else if (format === 'pdf') {
      await downloadPdf(rows, columns, name);
    } else {
      const text = serialize(format, rows, columns);
      if (text === null) return { ok: false, message: 'Unsupported format' };
      downloadBlob(new Blob([text], { type: FORMAT_MIME[format] }), name);
    }
    return { ok: true, message: `Exported ${name}` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Export failed',
    };
  }
}

function buildFilename(format: OutputFormat): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('');
  return `transactions-${stamp}.${FORMAT_EXT[format]}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a beat to start the download before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadXlsx(
  rows: TransactionRow[],
  columns: FieldKey[],
  filename: string,
): Promise<void> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Screenshot to Table';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Transactions', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Source File', key: 'source', width: 28 },
    ...columns.map((key) => ({
      header: columnLabel(key),
      key,
      width: Math.max(14, Math.min(32, columnLabel(key).length + 8)),
    })),
  ];

  for (const row of rows) {
    const record: Record<string, string | number> = { source: row.sourceFile };
    for (const key of columns) {
      record[key] = NUMERIC_FIELDS.has(key)
        ? Number(cellValue(row, key)) || 0
        : cellValue(row, key);
    }
    sheet.addRow(record);
  }

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F1F3' },
  };
  header.alignment = { vertical: 'middle' };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length + 1 } };

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: FORMAT_MIME.xlsx }),
    filename,
  );
}

async function loadExcelJs() {
  const module = await import('exceljs');
  return module.default ?? module;
}

async function downloadPdf(
  rows: TransactionRow[],
  columns: FieldKey[],
  filename: string,
): Promise<void> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  // jspdf-autotable moved from a default export to a named one across majors.
  const resolved = autoTableModule as {
    default?: ApplyAutoTable;
    autoTable?: ApplyAutoTable;
  };
  const autoTable = resolved.default ?? resolved.autoTable;
  if (typeof autoTable !== 'function') throw new Error('Table plugin failed to load');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 28;
  const headers = ['Source File', ...columns.map(columnLabel)];
  const body = rows.map((row) => [
    row.sourceFile,
    ...columns.map((key) => cellValue(row, key)),
  ]);

  // A plain title band above the grid. Without it the first table row lands at
  // the very top of the page and reads as a stray header rather than a heading.
  doc.setFillColor(30, 58, 138);
  doc.rect(0, 0, pageWidth, 54, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Payment transactions', margin, 25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    `${rows.length} row${rows.length === 1 ? '' : 's'} · ${columns.length} columns · exported ${formatTimestamp()}`,
    margin,
    40,
  );

  autoTable(doc, {
    startY: 68,
    margin: { left: margin, right: margin, top: 68, bottom: 40 },
    head: [headers],
    body,
    // Repeats the header block on every page, which is the whole point of a
    // multi-page ledger export.
    showHead: 'everyPage',
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak', lineWidth: 0.25 },
    headStyles: {
      fillColor: [226, 232, 240],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'left',
      valign: 'middle',
    },
    bodyStyles: { textColor: [15, 23, 42], valign: 'top' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 92, fontSize: 6.5, textColor: [100, 116, 139] },
    },
    didDrawPage: (data: { pageNumber: number; pageCount: number }) => {
      const height = doc.internal.pageSize.getHeight();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Page ${data.pageNumber} of ${data.pageCount}`,
        pageWidth - margin,
        height - 18,
        { align: 'right' },
      );
    },
  });

  doc.save(filename);
}

function formatTimestamp(): string {
  const now = new Date();
  return `${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}
