import { ChevronDown, ClipboardCopy, Download } from 'lucide-react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { FORMAT_LABEL, type OutputFormat } from '../lib/format';
import type { FieldKey, TransactionRow } from '../types';

const ALL_FORMATS: OutputFormat[] = ['csv', 'tsv', 'xlsx', 'markdown', 'pdf', 'html', 'json'];

/** The clipboard API only accepts a few MIME types, and none of these. */
const CLIPBOARD_UNSAFE: OutputFormat[] = ['xlsx', 'pdf'];

const HINTS: Record<OutputFormat, string> = {
  csv: '.csv',
  tsv: 'paste into Sheets',
  xlsx: 'styled .xlsx',
  markdown: '.md',
  pdf: '.pdf',
  html: '.html',
  json: '.json',
};

interface ExportMenuProps {
  mode: 'copy' | 'export';
  disabled: boolean;
  columns: FieldKey[];
  rows: TransactionRow[];
  onCopy: (format: OutputFormat) => void;
  onExport: (format: OutputFormat) => void;
}

export function ExportMenu({
  mode,
  disabled,
  columns,
  rows,
  onCopy,
  onExport,
}: ExportMenuProps) {
  const run = (format: OutputFormat) => {
    if (mode === 'copy') onCopy(format);
    else onExport(format);
  };

  const Icon = mode === 'copy' ? ClipboardCopy : Download;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={mode === 'export' ? 'default' : 'outline'} disabled={disabled}>
          <Icon aria-hidden="true" />
          {mode === 'copy' ? 'Copy as' : 'Export'}
          <ChevronDown className="opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent>
        <DropdownMenuLabel>
          {rows.length} row{rows.length === 1 ? '' : 's'} · {columns.length} columns
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {ALL_FORMATS.map((format) => {
          const blocked = mode === 'copy' && CLIPBOARD_UNSAFE.includes(format);
          return (
            <DropdownMenuItem
              key={format}
              disabled={blocked}
              title={
                blocked
                  ? `${FORMAT_LABEL[format]} cannot be written to the clipboard`
                  : undefined
              }
              onClick={() => run(format)}
            >
              <span>{FORMAT_LABEL[format]}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {blocked ? 'export only' : HINTS[format]}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
