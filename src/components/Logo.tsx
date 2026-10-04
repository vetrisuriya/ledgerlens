import { cn } from '../lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn('size-7', className)}
      role="img"
      aria-label="LedgerLens logo"
    >
      <defs>
        <linearGradient id="ll-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1e3a8a" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#ll-logo)" />
      <rect x="29" y="10" width="6" height="19" rx="3" fill="#fff" />
      <path d="M32 40 22.5 28.5h19Z" fill="#fff" />
      <rect x="15" y="45" width="34" height="5.5" rx="2.75" fill="#fff" fillOpacity="0.95" />
      <rect x="15" y="54" width="21" height="5.5" rx="2.75" fill="#fff" fillOpacity="0.7" />
    </svg>
  );
}
