import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScanSearch, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Dialog } from './ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { cn } from '../lib/utils';
import { cellValue, columnLabel } from '../lib/format';
import type { FieldKey, TransactionRow } from '../types';

const ROW_HEIGHT = 34;
const OVERSCAN = 8;

interface DataTableProps {
  columns: FieldKey[];
  rows: TransactionRow[];
  onRemove?: (id: string) => void;
}

/**
 * Scrollable grid with row windowing.
 *
 * At the 2000+ image volumes this tool targets, rendering every cell up front
 * costs tens of thousands of DOM nodes. Only the visible slice plus a small
 * overscan is mounted; spacer rows keep the scrollbar honest.
 */
export function DataTable({ columns, rows, onRemove }: DataTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(480);
  const [inspect, setInspect] = useState<TransactionRow | null>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeight(entry.contentRect.height);
    });
    observer.observe(element);
    setHeight(element.clientHeight);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const onScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const top = event.currentTarget.scrollTop;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      setScrollTop(top);
      frameRef.current = null;
    });
  }, []);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(
    rows.length,
    Math.ceil((scrollTop + height) / ROW_HEIGHT) + OVERSCAN,
  );

  const visible = rows.slice(start, end);
  const topPad = start * ROW_HEIGHT;
  const bottomPad = Math.max(0, (rows.length - end) * ROW_HEIGHT);

  const total = useMemo(
    () =>
      rows.reduce(
        (sum, row) => sum + Number(cellValue(row, 'amount').replace(/,/g, '')),
        0,
      ),
    [rows],
  );

  return (
    <>
      <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <h2 className="text-sm font-semibold tracking-tight">Extracted data</h2>
          <div className="flex-1" />
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              <b className="font-semibold text-foreground">{rows.length}</b> rows
            </span>
            {Number.isFinite(total) && total > 0 && (
              <span>
                total{' '}
                <b className="font-semibold tabular-nums text-foreground">
                  ₹{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </b>
              </span>
            )}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <strong className="text-sm font-medium text-foreground">No rows yet</strong>
            <span className="max-w-sm text-sm text-muted-foreground">
              Drop payment screenshots on the left. Each image is read and appended here as it
              finishes — no page reload, no batch limit.
            </span>
          </div>
        ) : (
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="max-h-[calc(100vh-13rem)] overflow-auto"
          >
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 bg-card font-mono text-[11px] normal-case">
                    #
                  </TableHead>
                  {columns.map((key) => (
                    <TableHead key={key}>{columnLabel(key)}</TableHead>
                  ))}
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {topPad > 0 && <SpacerRow height={topPad} />}

                {visible.map((row, offset) => {
                  const index = start + offset;
                  return (
                    <TableRow key={row.id} className="group">
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {index + 1}
                      </TableCell>

                      {columns.map((key) => {
                        const value = cellValue(row, key);
                        return (
                          <TableCell
                            key={key}
                            className={cn(
                              'grid-row-height max-w-[16rem] truncate',
                              key === 'amount' && 'text-right tabular-nums',
                            )}
                            title={value || 'Not detected'}
                          >
                            {value || <span className="text-muted-foreground/60">—</span>}
                          </TableCell>
                        );
                      })}

                      <TableCell className="grid-row-height text-right">
                        <div className="flex justify-end gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="View the text OCR read from this image"
                            aria-label={`Inspect OCR text for row ${index + 1}`}
                            onClick={() => setInspect(row)}
                          >
                            <ScanSearch />
                          </Button>
                          {onRemove && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-destructive hover:bg-destructive/10"
                              title="Remove this row"
                              aria-label={`Remove row ${index + 1}`}
                              onClick={() => onRemove(row.id)}
                            >
                              <Trash2 />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {bottomPad > 0 && <SpacerRow height={bottomPad} />}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <OcrInspector row={inspect} onClose={() => setInspect(null)} />
    </>
  );
}

function SpacerRow({ height }: { height: number }) {
  return (
    <TableRow aria-hidden="true" className="hover:bg-transparent">
      <TableCell colSpan={99} style={{ height, padding: 0, border: 0 }} />
    </TableRow>
  );
}

/**
 * Shows the raw OCR output behind a row.
 *
 * Extraction is rule based, so when a field comes out empty the fastest way to
 * fix it is to see exactly what Tesseract read for that screenshot.
 */
function OcrInspector({
  row,
  onClose,
}: {
  row: TransactionRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={row !== null}
      onClose={onClose}
      title={row?.sourceFile ?? ''}
      description="Raw text recognised in this image"
    >
      {row && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Detected: {row.provider}</Badge>
            {typeof row.confidence === 'number' && row.confidence > 0 && (
              <Badge variant="secondary">{row.confidence}% confidence</Badge>
            )}
            {row.psm && <Badge variant="muted">segmentation PSM {row.psm}</Badge>}
            {row.error && <Badge variant="destructive">{row.error}</Badge>}
          </div>

          <pre className="ocr-text max-h-[45vh] overflow-auto rounded-md border bg-muted/40 p-3">
            {row.rawText?.trim() || 'No text was recognised in this image.'}
          </pre>

          <p className="text-xs text-muted-foreground">
            Missing a field? The headings recognised here are the words the parser matches on.
            Adding the app&rsquo;s wording to the field list in <code>src/types.ts</code> is all it
            takes to pick it up.
          </p>
        </div>
      )}
    </Dialog>
  );
}
