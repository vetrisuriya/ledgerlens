import * as React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ToastMessage {
  text: string;
  tone: 'default' | 'error';
}

/**
 * Single-slot toast. One message at a time is enough here and avoids pulling in
 * a queueing library for what is a confirmation of a copy or export.
 */
export function Toast({ toast, onDismiss }: { toast: ToastMessage; onDismiss: () => void }) {
  React.useEffect(() => {
    const timer = setTimeout(onDismiss, 3800);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const isError = toast.tone === 'error';
  const Icon = isError ? AlertCircle : CheckCircle2;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4">
      <div
        role="status"
        className={cn(
          'pointer-events-auto flex animate-fade-in items-center gap-2.5 rounded-lg px-4 py-2.5 text-sm shadow-lg',
          isError
            ? 'bg-destructive text-destructive-foreground'
            : 'bg-foreground text-background',
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="max-w-[60ch]">{toast.text}</span>
      </div>
    </div>
  );
}
