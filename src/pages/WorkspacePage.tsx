import { useCallback, useEffect, useState } from 'react';
import { Layers, ShieldCheck, Trash2 } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { Dropzone } from '../components/Dropzone';
import { ExportMenu } from '../components/ExportMenu';
import { QueueList } from '../components/QueueList';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Toast, type ToastMessage } from '../components/ui/toast';
import { useOcrQueue } from '../hooks/useOcrQueue';
import { copyAs, exportAs } from '../lib/exporters';
import { columnLabel, type OutputFormat } from '../lib/format';
import type { Reference } from './ReferencePage';

interface WorkspacePageProps {
  reference: Reference;
  onReset: () => void;
}

export function WorkspacePage({ reference, onReset }: WorkspacePageProps) {
  const {
    items,
    rows,
    stats,
    skipDuplicates,
    addFiles,
    removeItem,
    clear,
    clearFinished,
    setSkipDuplicates,
  } = useOcrQueue();

  const [toast, setToast] = useState<ToastMessage | null>(null);
  const notify = useCallback(
    (text: string, tone: ToastMessage['tone'] = 'default') => setToast({ text, tone }),
    [],
  );

  // Screenshots arrive via clipboard on desktop just as often as via drag.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        file.type.startsWith('image/'),
      );
      if (files.length === 0) return;
      event.preventDefault();
      addFiles(files);
      notify(`Added ${files.length} image${files.length === 1 ? '' : 's'} from clipboard`);
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles, notify]);

  const onCopy = async (format: OutputFormat) => {
    const result = await copyAs(format, rows, reference.columns);
    notify(result.message, result.ok ? 'default' : 'error');
  };

  const onExport = async (format: OutputFormat) => {
    const result = await exportAs(format, rows, reference.columns);
    notify(result.message, result.ok ? 'default' : 'error');
  };

  return (
    <>
      <div className="grid flex-1 grid-cols-1 items-start gap-4 px-5 pb-6 lg:grid-cols-[21rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 lg:sticky lg:top-[4.25rem]">
          <Card>
            <CardHeader>
              <CardTitle>Add images</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Dropzone
                onFiles={addFiles}
                multiple
                title="Drop screenshots here"
                hint="Any number at once, or paste with Ctrl+V"
              />

              <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(event) => setSkipDuplicates(event.target.checked)}
                  className="size-3.5 cursor-pointer accent-[hsl(var(--primary))]"
                />
                Skip duplicate transaction IDs
              </label>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={stats.isBusy || items.length === 0}
                  onClick={clear}
                >
                  <Trash2 />
                  Clear all
                </Button>
                <Button variant="ghost" size="sm" disabled={stats.isBusy} onClick={onReset}>
                  Change reference
                </Button>
              </div>

              <Alert variant="success">
                <ShieldCheck />
                <AlertDescription>
                  Columns come from <b>{reference.sourceFile}</b>. Images are read in this tab and
                  released as they finish — nothing is uploaded or stored.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <QueueList items={items} busy={stats.isBusy} onClearFinished={clearFinished} />
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                  <Layers className="size-4 text-muted-foreground" />
                  {reference.columns.length} columns
                </h2>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {reference.columns.map(columnLabel).join(' · ')}
                </p>
              </div>

              <div className="flex-1" />

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="tabular-nums">
                    {stats.completed}/{stats.total}
                  </Badge>
                  done
                </div>
                {stats.pending > 0 && (
                  <Badge variant="muted" className="tabular-nums">
                    {stats.pending} queued
                  </Badge>
                )}
                {stats.failed > 0 && (
                  <Badge variant="destructive" className="tabular-nums">
                    {stats.failed} failed
                  </Badge>
                )}

                <ExportMenu
                  mode="copy"
                  disabled={rows.length === 0}
                  columns={reference.columns}
                  rows={rows}
                  onCopy={onCopy}
                  onExport={onExport}
                />
                <ExportMenu
                  mode="export"
                  disabled={rows.length === 0}
                  columns={reference.columns}
                  rows={rows}
                  onCopy={onCopy}
                  onExport={onExport}
                />
              </div>
            </CardContent>
          </Card>

          <DataTable
            columns={reference.columns}
            rows={rows}
            onRemove={stats.isBusy ? undefined : removeItem}
          />
        </div>
      </div>

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}
