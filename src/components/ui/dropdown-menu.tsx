import * as React from 'react';
import { cn } from '../../lib/utils';

interface DropdownContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DropdownContext = React.createContext<DropdownContextValue | null>(null);

function useDropdown() {
  const context = React.useContext(DropdownContext);
  if (!context) throw new Error('DropdownMenu parts must be used inside <DropdownMenu>');
  return context;
}

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <DropdownContext.Provider value={{ open, setOpen }}>
      <div className="relative" ref={rootRef}>
        {children}
      </div>
    </DropdownContext.Provider>
  );
}

type TriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean };

export function DropdownMenuTrigger({ className, children, asChild, ...props }: TriggerProps) {
  const { open, setOpen } = useDropdown();

  const triggerProps = {
    ...props,
    type: 'button' as const,
    'aria-haspopup': 'menu' as const,
    'aria-expanded': open,
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      props.onClick?.(event);
      setOpen(!open);
    },
  };

  // Shadcn's asChild pattern: let the consumer supply the trigger element so a
  // Button primitive keeps its own styling and ref.
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(
      children as React.ReactElement<Record<string, unknown>>,
      triggerProps,
    );
  }

  return (
    <button className={className} {...triggerProps}>
      {children}
    </button>
  );
}

export function DropdownMenuContent({
  className,
  align = 'end',
  children,
}: {
  className?: string;
  align?: 'start' | 'end';
  children: React.ReactNode;
}) {
  const { open, setOpen } = useDropdown();
  if (!open) return null;

  return (
    <div
      role="menu"
      className={cn(
        'absolute top-[calc(100%+6px)] z-50 min-w-[15rem] animate-fade-in overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg',
        align === 'end' ? 'right-0' : 'left-0',
        className,
      )}
      onClick={() => setOpen(false)}
    >
      {children}
    </div>
  );
}

export function DropdownMenuLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('px-2 py-1.5 text-xs text-muted-foreground', className)}
      {...props}
    />
  );
}

export function DropdownMenuItem({
  className,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator() {
  return <div className="-mx-1 my-1 h-px bg-border" />;
}
