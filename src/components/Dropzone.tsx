import { useCallback, useRef, useState, type DragEvent } from 'react';
import { ImageUp } from 'lucide-react';
import { cn } from '../lib/utils';

interface DropzoneProps {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  title: string;
  hint: string;
  disabled?: boolean;
  className?: string;
}

export function Dropzone({
  onFiles,
  multiple = false,
  title,
  hint,
  disabled = false,
  className,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const emit = useCallback(
    (list: FileList | null) => {
      if (!list || disabled) return;
      const files = Array.from(list);
      if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
    },
    [disabled, multiple, onFiles],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={title}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        depth.current += 1;
        if (!disabled) setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        depth.current -= 1;
        if (depth.current <= 0) setDragging(false);
      }}
      onDrop={(event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        depth.current = 0;
        setDragging(false);
        emit(event.dataTransfer.files);
      }}
      className={cn(
        'group flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        dragging
          ? 'border-primary bg-primary/5 text-primary'
          : 'border-input bg-muted/30 text-muted-foreground hover:border-primary hover:bg-primary/5 hover:text-primary',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <ImageUp
        className={cn('size-6 transition-transform', dragging && 'scale-110')}
        aria-hidden="true"
      />
      <span className="text-sm font-medium text-foreground">{title}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        hidden
        onChange={(event) => {
          emit(event.target.files);
          // Reset so picking the same file twice still fires a change event.
          event.target.value = '';
        }}
      />
    </div>
  );
}
