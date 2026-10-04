import { APP, SITE, absoluteUrl } from '../src/config';
import { PAGES, PAGES_BY_SLUG, type Block, type Page } from './content';

/**
 * Content pages are emitted to `<deployBase>/<slug>/index.html`, so every internal
 * href is written relative to that document. That is what lets one build work at a
 * domain root and under a `/ledgerlens/` subpath like GitHub Pages: `../faq/`
 * resolves correctly in both. Absolute URLs are still used where a crawler needs
 * one — canonicals, Open Graph, the sitemap.
 */
const UP = '../';
const FAVICON = `${UP}favicon.svg`;
const APPLE_ICON = `${UP}apple-touch-icon.png`;
const MANIFEST = `${UP}manifest.webmanifest`;
const STYLES = `${UP}seo.css`;
const HOME = UP;
const OG_IMAGE = absoluteUrl(SITE.ogImage.path);

/** Canonical URL for a route, trailing-slashed the way static hosts serve it. */
function pageUrl(slug: string): string {
  return `${absoluteUrl(slug)}/`;
}

function pageHref(slug: string): string {
  return `${UP}${slug.replace(/^\//, '')}/`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline markup kept deliberately tiny: `code` and **strong** only. */
function inline(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function renderBlock(block: Block): string {
  switch (block.kind) {
    case 'h2':
      return `<h2>${inline(block.text)}</h2>`;
    case 'p':
      return `<p>${inline(block.text)}</p>`;
    case 'ul':
      return `<ul>${block.items.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`;
    case 'ol':
      return `<ol>${block.items.map((item) => `<li>${inline(item)}</li>`).join('')}</ol>`;
    case 'steps':
      return `<ol class="steps">${block.items
        .map((item) => `<li>${inline(item)}</li>`)
        .join('')}</ol>`;
    case 'table':
      return `<div class="table-wrap"><table><thead><tr>${block.head
        .map((cell) => `<th scope="col">${inline(cell)}</th>`)
        .join('')}</tr></thead><tbody>${block.rows
        .map(
          (row) =>
            `<tr>${row
              .map((cell, index) =>
                index === 0
                  ? `<th scope="row">${inline(cell)}</th>`
                  : `<td>${inline(cell)}</td>`,
              )
              .join('')}</tr>`,
        )
        .join('')}</tbody></table></div>`;
  }
}

function breadcrumbSchema(page: Page): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'LedgerLens', item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: labelFor(page.slug), item: pageUrl(page.slug) },
    ],
  };
}

function faqSchema(page: Page): Record<string, unknown> | null {
  if (!page.faq?.length) return null;
  return {
    '@type': 'FAQPage',
    mainEntity: page.faq.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  };
}

function pageSchema(page: Page): unknown {
  const url = pageUrl(page.slug);

  const graph: Record<string, unknown>[] = [
    {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: page.title,
      description: page.description,
      inLanguage: SITE.lang,
      isPartOf: { '@id': `${absoluteUrl('/')}#website` },
      about: { '@id': `${absoluteUrl('/')}#app` },
      breadcrumb: { '@id': `${url}#breadcrumb` },
    },
    { ...breadcrumbSchema(page), '@id': `${url}#breadcrumb` },
  ];

  const faq = faqSchema(page);
  if (faq) graph.push(faq);

  return { '@context': 'https://schema.org', '@graph': graph };
}

/** A JSON-LD block must not be able to close its own script tag. */
function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/<\//g, '<\\/');
}

function navLinks(limit: number): string {
  const items = SITE.nav.slice(0, limit);

  return `<nav aria-label="Site"><ul>${items
    .map((item) => `<li><a href="${pageHref(item.href)}">${escapeHtml(item.label)}</a></li>`)
    .join('')}</ul></nav>`;
}

function labelFor(slug: string): string {
  return SITE.nav.find((item) => item.href === slug)?.label ?? slug;
}

function renderPage(page: Page): string {
  const url = pageUrl(page.slug);
  const related = (page.related ?? [])
    .map((slug) => PAGES_BY_SLUG.get(slug))
    .filter((item): item is Page => Boolean(item));

  return `<!doctype html>
<html lang="${SITE.lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(page.title)}</title>
    <meta name="description" content="${escapeHtml(page.description)}" />
${
  page.keywords
    ? `    <meta name="keywords" content="${escapeHtml(page.keywords.join(', '))}" />\n`
    : ''
}    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
    <meta name="author" content="${escapeHtml(SITE.author.name)}" />
    <meta name="theme-color" content="${SITE.themeColorLight}" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="${SITE.themeColorDark}" media="(prefers-color-scheme: dark)" />
    <link rel="canonical" href="${url}" />

    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="${escapeHtml(APP.name)}" />
    <meta property="og:locale" content="${SITE.locale}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${escapeHtml(page.title)}" />
    <meta property="og:description" content="${escapeHtml(page.description)}" />
    <meta property="og:image" content="${OG_IMAGE}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="${SITE.ogImage.width}" />
    <meta property="og:image:height" content="${SITE.ogImage.height}" />
    <meta property="og:image:alt" content="${escapeHtml(SITE.ogImage.alt)}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(page.title)}" />
    <meta name="twitter:description" content="${escapeHtml(page.description)}" />
    <meta name="twitter:image" content="${OG_IMAGE}" />

    <link rel="icon" type="image/svg+xml" href="${FAVICON}" />
    <link rel="apple-touch-icon" href="${APPLE_ICON}" />
    <link rel="manifest" href="${MANIFEST}" />
    <link rel="stylesheet" href="${STYLES}" />

    <script type="application/ld+json">${jsonLd(pageSchema(page))}</script>
  </head>
  <body>
    <a class="skip" href="#main">Skip to content</a>
    <header class="site-header">
      <a class="brand" href="${HOME}">
        <img src="${FAVICON}" width="28" height="28" alt="" />
        <span>${escapeHtml(APP.name)}</span>
      </a>
      ${navLinks(SITE.headerNavCount)}
    </header>

    <main id="main">
      <article>
        <p class="eyebrow">${escapeHtml(labelFor(page.slug))}</p>
        <h1>${inline(page.h1)}</h1>
        <p class="lead">${inline(page.intro)}</p>
        ${page.blocks.map(renderBlock).join('\n        ')}

${
  page.faq?.length
    ? `        <h2>Frequently asked questions</h2>
        <div class="faq">
${page.faq
  .map(
    (entry) =>
      `          <details open><summary>${inline(entry.question)}</summary><p>${inline(
        entry.answer,
      )}</p></details>`,
  )
  .join('\n')}
        </div>\n`
    : ''
}      </article>

      <aside class="cta">
        <h2>Try it on your own screenshots</h2>
        <p>
          Drop one receipt to set the columns, then add the rest. Everything runs in your browser,
          so nothing is uploaded.
        </p>
        <a class="button" href="${HOME}">Open LedgerLens</a>
      </aside>

${
  related.length
    ? `      <nav class="related" aria-label="Related pages">
        <h2>Related</h2>
        <ul>
${related
  .map(
    (item) =>
      `          <li><a href="${pageHref(item.slug)}">${escapeHtml(
        labelFor(item.slug),
      )}</a><span>${escapeHtml(item.description)}</span></li>`,
  )
  .join('\n')}
        </ul>
      </nav>\n`
    : ''
}    </main>

    <footer class="site-footer">
      <p>
        Screenshots are decoded, read and discarded in this tab. Nothing is uploaded, written to
        disk, or sent to a server.
      </p>
      <p>
${SITE.nav.map((item, index) => {
  const link = `<a href="${pageHref(item.href)}">${escapeHtml(item.label)}</a>`;
  return index === 0 ? `        ${link}` : ` ·\n        ${link}`;
}).join('')}
      </p>
      <p class="credit">
        Made with <span role="img" aria-label="love">♥</span> by
        <a href="${SITE.author.url}" rel="noopener">${escapeHtml(
          SITE.author.url.replace(/^https:\/\//, ''),
        )}</a>
      </p>
    </footer>
  </body>
</html>
`;
}

export function renderSitemap(): string {
  const urls = [
    { loc: absoluteUrl('/'), priority: '1.0', changefreq: 'monthly' },
    ...PAGES.map((page) => ({
      loc: pageUrl(page.slug),
      priority: page.priority.toFixed(1),
      changefreq: 'monthly',
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) =>
      `  <url>\n    <loc>${url.loc}</loc>\n    <changefreq>${url.changefreq}</changefreq>\n    <priority>${url.priority}</priority>\n  </url>`,
  )
  .join('\n')}
</urlset>
`;
}

export function renderRobots(): string {
  return `# LedgerLens — ${SITE.url}
User-agent: *
Allow: /

Sitemap: ${absoluteUrl('/sitemap.xml')}
`;
}

export function renderManifest(): string {
  return `${JSON.stringify(
    {
      name: `${APP.name} — ${APP.tagline}`,
      short_name: APP.name,
      description: APP.shortDescription,
      id: './',
      start_url: './',
      scope: './',
      display: 'standalone',
      orientation: 'portrait-primary',
      background_color: SITE.themeColorLight,
      theme_color: '#2563eb',
      categories: ['business', 'productivity', 'utilities'],
      icons: [
        { src: './favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: './favicon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: './favicon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: './favicon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      shortcuts: [
        { name: 'How it works', url: 'how-it-works/' },
        { name: 'FAQ', url: 'faq/' },
      ],
    },
    null,
    2,
  )}\n`;
}

export const CONTENT_ROUTES = PAGES.map((page) => page.slug);

export function buildContentPages(): Map<string, string> {
  const files = new Map<string, string>();
  for (const page of PAGES) {
    files.set(`${page.slug.slice(1)}/index.html`, renderPage(page));
  }
  files.set('sitemap.xml', renderSitemap());
  files.set('robots.txt', renderRobots());
  files.set('manifest.webmanifest', renderManifest());
  files.set('seo.css', STYLESHEET);
  return files;
}

const STYLESHEET = `:root {
  --bg: #ffffff;
  --fg: #18181b;
  --muted: #52525b;
  --line: #e4e4e7;
  --card: #fafafa;
  --accent: #1d4ed8;
  --accent-fg: #ffffff;
  --radius: 10px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #09090b;
    --fg: #fafafa;
    --muted: #a1a1aa;
    --line: #27272a;
    --card: #18181b;
    --accent: #60a5fa;
    --accent-fg: #09090b;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: Inter, system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 16px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}

a {
  color: var(--accent);
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0.05em 0.35em;
}

.skip {
  position: absolute;
  left: -9999px;
}

.skip:focus {
  left: 1rem;
  top: 1rem;
  z-index: 10;
  background: var(--accent);
  color: var(--accent-fg);
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius);
}

.site-header {
  border-bottom: 1px solid var(--line);
  padding: 0.85rem 1.25rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.5rem;
  align-items: center;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--fg);
  text-decoration: none;
}

.brand img {
  display: block;
  border-radius: 7px;
}

.site-header nav ul {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1rem;
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.875rem;
}

main {
  margin: 0 auto;
  padding: 2.5rem 1.25rem 3.5rem;
  max-width: 46rem;
}

.eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

h1 {
  margin: 0 0 0.75rem;
  font-size: clamp(1.75rem, 4vw, 2.35rem);
  line-height: 1.15;
  letter-spacing: -0.02em;
}

h2 {
  margin: 2.25rem 0 0.6rem;
  font-size: 1.2rem;
  letter-spacing: -0.01em;
}

.lead {
  margin: 0 0 0.5rem;
  font-size: 1.06rem;
  color: var(--muted);
}

p {
  margin: 0 0 1rem;
}

ul,
ol {
  margin: 0 0 1rem;
  padding-left: 1.35rem;
}

li {
  margin-bottom: 0.35rem;
}

ol.steps {
  counter-reset: step;
  list-style: none;
  padding-left: 0;
}

ol.steps li {
  counter-increment: step;
  position: relative;
  padding-left: 2.25rem;
  margin-bottom: 0.85rem;
}

ol.steps li::before {
  content: counter(step);
  position: absolute;
  left: 0;
  top: 0.1rem;
  width: 1.6rem;
  height: 1.6rem;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  font-size: 0.8rem;
  font-weight: 600;
}

.table-wrap {
  overflow-x: auto;
  margin: 0 0 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.92rem;
}

th,
td {
  text-align: left;
  vertical-align: top;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--line);
}

thead th {
  background: var(--card);
  font-weight: 600;
  white-space: nowrap;
}

tbody tr:last-child th,
tbody tr:last-child td {
  border-bottom: 0;
}

.faq details {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 0.75rem 0.9rem;
  margin-bottom: 0.5rem;
  background: var(--card);
}

.faq summary {
  cursor: pointer;
  font-weight: 600;
  font-size: 0.95rem;
}

.faq p {
  margin: 0.6rem 0 0;
  color: var(--muted);
  font-size: 0.94rem;
}

.cta {
  margin-top: 2.75rem;
  padding: 1.5rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--card);
}

.cta h2 {
  margin-top: 0;
}

.cta p {
  color: var(--muted);
}

.button {
  display: inline-block;
  background: var(--accent);
  color: var(--accent-fg);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.95rem;
  padding: 0.6rem 1.1rem;
  border-radius: var(--radius);
}

.related {
  margin-top: 2.75rem;
}

.related ul {
  list-style: none;
  padding-left: 0;
  margin: 0;
}

.related li {
  border-top: 1px solid var(--line);
  padding: 0.7rem 0;
}

.related li a {
  font-weight: 600;
  display: block;
}

.related li span {
  display: block;
  color: var(--muted);
  font-size: 0.88rem;
}

.site-footer {
  border-top: 1px solid var(--line);
  padding: 1.75rem 1.25rem 2.5rem;
  text-align: center;
  color: var(--muted);
  font-size: 0.85rem;
}

.site-footer p {
  margin: 0 0 0.4rem;
}

.site-footer a {
  color: var(--fg);
  text-decoration: none;
}

.site-footer a:hover {
  text-decoration: underline;
}

.site-footer .credit a {
  color: var(--accent);
  font-weight: 600;
}

@media (max-width: 640px) {
  .site-header {
    padding: 0.75rem 1rem;
  }

  main {
    padding: 2rem 1rem 3rem;
  }
}
`;