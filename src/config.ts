export const APP = {
  name: 'LedgerLens',
  tagline: 'Payment screenshots to ledger tables',
  description:
    'Extract Google Pay, PhonePe and other payment transaction details from screenshots into an exportable table. Runs entirely in your browser, nothing is uploaded or stored.',
  shortDescription: 'Extract payment transaction data from screenshots. Runs in your browser.',
  keywords: [
    'google pay screenshot to excel',
    'phonepe screenshot to csv',
    'upi screenshot to excel',
    'payment screenshot to spreadsheet',
    'screenshot to excel tool',
    'bulk screenshots to table',
    'convert upi screenshots to csv',
    'payment receipt screenshot to ledger',
  ],
} as const;

/**
 * Every indexable route besides the app itself, in the order they appear in
 * navigation. `seo/content.ts` holds the copy for each slug, and `seo/render.ts`
 * builds the sitemap and per-page metadata from it, so a page cannot end up in
 * the nav without being in the sitemap.
 */
export const SITE = {
  /** Canonical origin. Change this and the sitemap, canonicals and OG URLs follow. */
  url: 'https://vetrisuriya.github.io/ledgerlens',
  locale: 'en_IN',
  lang: 'en-IN',
  themeColorLight: '#ffffff',
  themeColorDark: '#09090b',
  author: {
    name: 'Vetri Suriya',
    url: 'https://vetrisuriya.in',
  },
  ogImage: {
    path: '/og-image.png',
    width: 1200,
    height: 630,
    alt: 'LedgerLens turning Google Pay and PhonePe payment screenshots into a spreadsheet table',
  },
  nav: [
    { href: '/how-it-works', label: 'How it works' },
    { href: '/use-cases', label: 'Use cases' },
    { href: '/google-pay-screenshot-to-excel', label: 'Google Pay' },
    { href: '/phonepe-screenshot-to-csv', label: 'PhonePe' },
    { href: '/upi-screenshots-to-excel', label: 'All UPI apps' },
    { href: '/export-formats', label: 'Export formats' },
    { href: '/faq', label: 'FAQ' },
    { href: '/privacy', label: 'Privacy' },
    { href: '/about', label: 'About' },
  ],
  /** Routes shown in the content-page header. The rest live in its footer. */
  headerNavCount: 6,
} as const;

/**
 * Absolute URL for a site path, used for canonicals, social tags and the sitemap.
 * The leading slash is dropped before resolving, otherwise a leading-slash path
 * would discard a base path and point at the domain root instead of
 * `/ledgerlens/...`.
 */
export function absoluteUrl(path: string): string {
  return new URL(path.replace(/^\//, ''), `${SITE.url}/`).href;
}

/**
 * Link href relative to the current document, so one build works both at a domain
 * root and under a `/repo/` subpath like GitHub Pages. On `/` this resolves to
 * `/how-it-works`; on `/repo/` it resolves to `/repo/how-it-works`.
 */
export function relativeHref(path: string): string {
  return path.replace(/^\//, '');
}