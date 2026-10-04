import { Check, Clock, Loader2, X } from 'lucide-react';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { cn } from '../lib/utils';
import type { QueueItem } from '../types';

interface QueueListProps {
  items: QueueItem[];
  busy: boolean;
  onClearFinished: () => void;
}

export function QueueList({ items, busy, onClearFinished }: QueueListProps) {
  if (items.length === 0) return null;

  const finished = items.filter((item) => item.status === 'done' || item.status === 'error');

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h3 className="text-sm font-semibold tracking-tight">Queue</h3>
        <Badge count={items.length} />
        <div className="flex-1" />
        {finished.length > 0 && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClearFinished}>
            Clear finished
          </Button>
        )}
      </div>

      <ul className="max-h-72 divide-y overflow-auto">
        {items.map((item) => (
          <li key={item.id} className="px-4 py-2">
            <div className="flex items-center gap-2">
              <StatusIcon status={item.status} />
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                {item.name}
              </span>
              <span
                className={cn(
                  'shrink-0 text-[11px] tabular-nums text-muted-foreground',
                  item.status === 'error' && 'text-destructive',
                )}
              >
                {describe(item)}
              </span>
            </div>

            {item.status === 'processing' && (
              <Progress value={item.progress} className="mt-1.5" />
            )}
            {item.status === 'error' && item.error && (
              <p className="mt-1 truncate text-[11px] text-destructive">{item.error}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Badge({ count }: { count: number }) {
  return (
    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
      {count}
    </span>
  );
}

function StatusIcon({ status }: { status: QueueItem['status'] }) {
  const className = 'size-3.5 shrink-0';

  switch (status) {
    case 'processing':
      return <Loader2 className={cn(className, 'animate-spin text-primary')} />;
    case 'done':
      return <Check className={cn(className, 'text-success')} />;
    case 'error':
      return <X className={cn(className, 'text-destructive')} />;
    case 'queued':
      return <Clock className={cn(className, 'text-muted-foreground/60')} />;
    default:
      return null;
  }
}

function describe(item: QueueItem): string {
  switch (item.status) {
    case 'processing':
      return `${Math.round(item.progress * 100)}%`;
    case 'done':
      return item.error ? 'skipped' : 'done';
    case 'error':
      return 'failed';
    default:
      return 'waiting';
  }
}
