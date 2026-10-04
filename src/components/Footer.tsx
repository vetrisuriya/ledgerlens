import { Heart } from 'lucide-react';
import { SITE, relativeHref } from '../config';

export function Footer() {
  return (
    <footer className="mt-auto border-t px-5 py-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <nav aria-label="LedgerLens guides" className="max-w-lg">
          <ul className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs sm:grid-cols-3">
            {SITE.nav.map((item) => (
              <li key={item.href}>
                <a
                  className="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  href={`${relativeHref(item.href)}/`}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="text-xs text-muted-foreground sm:text-right">
          <p className="max-w-xs sm:ml-auto">
            Screenshots are decoded, read and discarded in this tab. Nothing is uploaded, written to
            disk, or sent to a server.
          </p>
          <p className="mt-3 flex items-center justify-center gap-1.5 sm:justify-end">
            <span>Made with</span>
            <Heart className="size-3.5 fill-rose-500 text-rose-500" aria-hidden />
            <span className="sr-only">love</span>
            <span>by</span>
            <a
              className="font-medium text-foreground underline-offset-4 hover:underline"
              href={SITE.author.url}
              rel="noopener"
            >
              {SITE.author.url.replace(/^https:\/\//, '')}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}