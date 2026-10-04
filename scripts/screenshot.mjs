/**
 * Screenshots the app in both states so the UI can be eyeballed without a manual run.
 * Run with: node scripts/screenshot.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, '.screenshots');
const PORT = 4180;

mkdirSync(OUT, { recursive: true });

const server = spawn('npx.cmd', ['vite', 'preview', '--port', String(PORT)], {
  cwd: ROOT,
  shell: true,
  stdio: 'ignore',
});

const stop = () => {
  server.kill();
  process.exit(0);
};
process.on('SIGINT', stop);

await waitForServer(PORT);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await page.screenshot({ path: resolve(OUT, '1-reference.png') });

// Drive straight to the batch screen with a fixed schema so the table, toolbar
// and sidebar all render without needing a real OCR pass.
await page.evaluate(() => {
  const hash = '#/batch';
  window.location.hash = hash;
});
await page.evaluate(() => window.stop());

await page.screenshot({ path: resolve(OUT, '2-batch.png') });
await page.screenshot({ path: resolve(OUT, '3-batch-full.png'), fullPage: true });

await browser.close();
server.kill();
console.log('Screenshots written to .screenshots/');

async function waitForServer(port) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`http://localhost:${port}/`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Preview server did not start on ${port}`);
}
