/**
 * Writes the app's first render into dist/index.html so crawlers and link
 * previews see real content instead of an empty <div id="root">.
 *
 * The markup comes from the running React tree, so there is no second copy of
 * the page to keep in sync. React still mounts over it on load, which replaces
 * the server markup with the identical client render.
 *
 * Skips with a warning if Chromium is not installed, because the app works
 * without this step, it just indexes worse.
 *
 * Run with: node scripts/prerender.mjs
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const INDEX = join(DIST, 'index.html');
const PORT = 4182;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.traineddata': 'application/octet-stream',
};

if (!existsSync(INDEX)) {
  console.error('dist/index.html not found. Run the build first.');
  process.exit(1);
}

const { chromium } = await import('playwright').catch(() => ({ chromium: null }));

if (!chromium) {
  console.warn('[prerender] playwright is not installed, skipping. Build output is unchanged.');
  process.exit(0);
}

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const relative = normalize(url).replace(/^([/\\])+/, '');
  let file = join(DIST, relative);

  if (!file.startsWith(DIST)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  if (existsSync(file) && statSync(file).isDirectory()) {
    file = join(file, 'index.html');
  }

  if (!existsSync(file)) {
    res.writeHead(404).end('Not found');
    return;
  }

  res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
  createReadStream(file).pipe(res);
});

await new Promise((done) => server.listen(PORT, '127.0.0.1', done));

let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  server.close();
  console.warn(`[prerender] chromium is unavailable (${error.message}), skipping.`);
  process.exit(0);
}

try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#root header', { timeout: 15000 });

  const rootHtml = await page.evaluate(() => document.getElementById('root')?.innerHTML ?? '');
  const html = readFileSync(INDEX, 'utf8').replace(
    /<div id="root"><\/div>/,
    `<div id="root">${rootHtml}</div>`,
  );

  if (html.includes('<div id="root"></div>')) {
    throw new Error('could not find the empty root element to replace');
  }

  writeFileSync(INDEX, html);
  console.log(
    `[prerender] injected ${(rootHtml.length / 1024).toFixed(1)} kB of markup into dist/index.html`,
  );
} finally {
  await browser.close();
  server.close();
}