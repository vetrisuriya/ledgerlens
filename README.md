# LedgerLens

Turns batches of Google Pay / PhonePe transaction screenshots into a table you can
copy or export. Everything runs in the browser — screenshots are never uploaded,
never written to disk, and never sent anywhere.

Built for reconciling freelance payments against a client's screenshots, so every
row keeps the filename it came from and every cell can be traced back to the text
OCR actually read.

## How it works

1. **Reference image** — drop one transaction screenshot. The field headings on that
   image become your table columns, in the order they appear.
2. **Batch screen** — drop as many screenshots as you like. Each one is read and
   appended to the table as it finishes. No page reload, no fixed limit.
3. **Copy or export** — CSV, tab-separated (for pasting into Sheets), `.xlsx`,
   Markdown, PDF, HTML, or JSON.

## Privacy

- No backend. There is no server to receive your images.
- No `localStorage`, `sessionStorage`, or IndexedDB writes for image or row data.
- Each `File` is handed to the OCR engine and dropped from the queue as soon as it
  is processed, so a 2000-image batch never holds 2000 decoded images in memory.
- The one thing cached in the browser is the Tesseract English language model
  (~15 MB), which contains no user data. See `src/ocr/engine.ts`.

## Stack

| Concern | Choice |
| --- | --- |
| Build | Vite 5, `base: './'` so it works on any Pages path |
| UI | React 18 + TypeScript + Tailwind |
| OCR | Tesseract.js 5 (runs in its own worker) |
| Spreadsheet | ExcelJS |
| PDF | jsPDF + jspdf-autotable |
| Tests | Vitest, plus Playwright for the browser-level checks |
| SEO | Generated content pages, prerendered app HTML, JSON-LD, sitemap |

## Running locally

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run build      # typecheck + production bundle into dist/ + prerender
npm run typecheck  # tsc --noEmit
npm test           # parser unit tests
npm run og-image   # redraw public/og-image.png, the social share card
npm run icons      # redraw the favicons
```

## Verifying a change

Unit tests cover the parser, but the interesting failures live in the browser, so
there are three checks that drive the real app:

```bash
node scripts/e2e.mjs                      # renders Google Pay / PhonePe receipts,
                                          # runs them through the app, asserts every
                                          # field, downloads all four export formats
                                          # and round-trips the clipboard
node scripts/real-check.mjs               # the same pass over your own screenshots
node scripts/real-check.mjs --raw shot.png   # ...and print the OCR text per row
node scripts/diagnose.mjs gpay-2.png      # one image: columns, raw OCR, parsed values
```

All of them write to `.screenshots/`, which is git-ignored. They start a Vite dev
server rather than serving `dist/`, so a stale build can never make a reading look
better than it is.

Two details worth knowing before trusting a green run: rows are paired to files by
the filename the app recorded, not by position, because the queue finishes images in
its own order; and the amount extractor is checked against the figure OCR produced
twice, since the rupee sign changes shape between a whole-page read and a read of
the total on its own.

## SEO

The app is a single-page React bundle, which is the worst case for a crawler: it
would otherwise ship an empty `<div id="root">`. So search visibility is built
from five parts, all generated rather than hand-maintained per page.

| Part | Where | Notes |
| --- | --- | --- |
| Site metadata | `src/config.ts` | Canonical origin, OG image, author, and the ordered nav list that feeds the header, the footer and the sitemap. |
| App-page meta and JSON-LD | `index.html` | Canonical, Open Graph, Twitter cards, and `WebSite` + `WebApplication` schema. |
| Content pages | `seo/content.ts` | One entry per keyword route: title, description, copy blocks, FAQ. |
| Page rendering | `seo/render.ts` | Emits the HTML, `WebPage`/`BreadcrumbList`/`FAQPage` JSON-LD, `sitemap.xml`, `robots.txt`, the manifest and `seo.css`. |
| Build wiring | `plugins/seo-pages.ts`, `scripts/prerender.mjs` | Emits the above as build assets, serves them in dev, and writes the app's first render into `dist/index.html`. |

**Adding a page** means adding one object to `PAGES` in `seo/content.ts` and one
link to `SITE.nav` in `src/config.ts`. Everything else — nav, footer, sitemap,
breadcrumb, structured data — follows. The page is then served in dev and built
into `dist/<slug>/index.html`, which `vercel.json`'s `cleanUrls` exposes at
`/<slug>`.

**Prerendering** (`scripts/prerender.mjs`) is why the landing page has content in
the served HTML. It runs Chromium once against the built `dist/`, copies the
rendered `#root` into `index.html`, and React mounts over it exactly as before.
If Chromium is not installed the step warns and skips; the app still works, it
just has less for a crawler to read.

**Two hosts, one canonical URL.** The links, canonicals and sitemap are all
root-absolute for `https://ledgerlens.vercel.app`. That means a GitHub Pages
deploy, which lives under a `/<repo>/` subpath, will serve pages whose internal
links point at the Vercel origin. Pick one host, or serve Pages from a custom
domain on the root.

**Analytics** — there are none, deliberately, and `/privacy` says so. The
privacy claim in the header badge is load-bearing for this tool, so a tracking
script would contradict the page it is on.

## Deploying

**Vercel** — import the repo, accept the defaults, deploy. `vercel.json` handles
clean URLs, long-lived caching for hashed assets and the usual security headers.

**GitHub Pages** — push to `main` and the workflow in
`.github/workflows/deploy.yml` publishes `dist/`. Set
*Settings → Pages → Source* to **GitHub Actions** once. See the note above
about root-absolute links.

## Adding a new field or app

Field knowledge lives in two places:

- `src/types.ts` — the `FIELDS` list. Each entry declares the column label and the
  heading phrases that identify it on a receipt.
- `src/ocr/parse/index.ts` — `extractTransaction`, which resolves those headings
  into values, with regex fallbacks per field.

Adding a new app is usually just adding heading phrases to `FIELDS` and a provider
entry in `detectProvider`. Extraction is deliberately label-first: receipt UIs put
a heading and its value either side-by-side or on consecutive lines, and that
pairing survives OCR noise far better than whole-page pattern matching.

## Known limits

- OCR accuracy depends on screenshot quality. Images are conditioned automatically
  (upscale + greyscale, and a contrast stretch only when the image is genuinely
  flat) in `src/ocr/preprocess.ts`, but very small or heavily compressed images
  will lose digits.
- **Transaction IDs are the weakest field.** They are long mixed-case alphanumeric
  strings at small type sizes, and OCR confuses characters that differ by a stroke
  (`t`/`O`, `b`/`6`). On the reference screenshots the UPI reference numbers read
  correctly every time while the Google transaction IDs did not. Check them against
  the app before relying on them.
- **Bank names can come back mangled** for the same reason: the vendor name in a
  card header is small, and OCR read `HDFC Bank 7625` as `prcBank 7625`. The trailing
  account digits are reliable, the vendor name is not.
- A cell is left empty rather than guessed when the figure cannot be read with any
  confidence. An empty amount is a visible prompt to re-check the screenshot; a
  plausible wrong number is not.
- If a payment app redesigns its receipt wording, add the new heading phrases to
  `FIELDS` rather than expecting the regexes to keep up.
- Amounts are stored as bare numbers (no `₹`) so spreadsheet apps treat them as
  numeric and can sum them.
