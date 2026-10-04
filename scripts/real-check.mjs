/**
 * Runs the user's own payment screenshots through the real app.
 *
 * The synthetic fixtures prove the parser works on the shapes they were built
 * from. This proves it works on the actual captures the tool exists for, so it is
 * the check that matters before shipping. Nothing is uploaded anywhere: the files
 * are read from disk, passed to the in-page OCR worker, and discarded.
 *
 * Run with: node scripts/real-check.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4183;

/** Defaults to the user's own captures; pass paths to check other images. */
const DEFAULTS = [
  'D:\\vetrisuriya\\freelance\\WhatsApp Image 2026-09-03 at 5.07.38 PM.jpeg',
  'D:\\vetrisuriya\\freelance\\WhatsApp Image 2026-09-03 at 5.07.52 PM.jpeg',
  'D:\\vetrisuriya\\freelance\\WhatsApp Image 2026-09-03 at 5.08.47 PM.jpeg',
];

const args = process.argv.slice(2);
const showRaw = args.includes('--raw');
const IMAGES = (args.filter((arg) => !arg.startsWith('--')).length > 0 ? args.filter((arg) => !arg.startsWith('--')) : DEFAULTS)
  .map((file) => resolve(process.cwd(), file))
  .filter((file) => existsSync(file));

if (IMAGES.length === 0) {
  console.error('None of the configured images exist. Pass paths as arguments.');
  process.exit(1);
}

const server = spawn('npx.cmd', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  shell: true,
  stdio: 'ignore',
});
process.on('exit', () => server.kill());

await waitForServer(PORT);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await context.newPage();
page.on('pageerror', (error) => console.error('PAGE ERROR:', error.message));

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await page.locator('input[type=file]').first().setInputFiles(IMAGES[0]);
await page.getByRole('button', { name: /Detect fields/ }).click();
await page.getByText(/^Found \d+ fields/).waitFor({ timeout: 300_000 });

await page.getByRole('button', { name: /Continue to batch upload/ }).click();
await page.getByText('Add images').waitFor();
await page.locator('input[type=file]').first().setInputFiles(IMAGES);

await page.locator('table tbody tr').first().waitFor({ timeout: 600_000 });
await page.waitForFunction(() => !document.body.innerText.includes('queued'), undefined, {
  timeout: 600_000,
});
await page.waitForTimeout(2000);

const headers = await page
  .locator('table thead th')
  .allInnerTexts()
  .then((cells) =>
    cells
      .slice(1, -1)
      .map((cell) => cell.replace(/\s+/g, ' ').trim()),
  );

// Rows are read per row rather than in one evaluateAll so each can be paired with
// the filename the app recorded: the queue completes images in its own order.
const records = [];
const rowCount = await page.locator('table tbody tr').count();

for (let index = 0; index < rowCount; index++) {
  const row = page.locator('table tbody tr').nth(index);
  if ((await row.locator('td').count()) < 2) continue;

  let raw = '';
  await row.getByRole('button', { name: /Inspect OCR text/ }).click();
  const dialog = page.locator('[role=dialog]');
  await dialog.waitFor({ timeout: 20_000 });
  const source = (await dialog.locator('h2').first().innerText()).trim();
  if (showRaw) raw = await dialog.locator('pre.ocr-text').innerText();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached', timeout: 20_000 });

  const cells = await row
    .locator('td')
    .evaluateAll((tds) => tds.slice(1, -1).map((td) => td.textContent.trim()));

  records.push({ source, cells, raw });
}

console.log(`\ncolumns: ${headers.length}`);
console.log(`  ${headers.join(' | ')}\n`);

for (const { source, cells, raw } of records) {
  console.log(`--- ${source} ---`);
  for (const [column, header] of headers.entries()) {
    console.log(`  ${header.padEnd(16)} ${cells[column] || '(not detected)'}`);
  }
  if (showRaw) {
    console.log(
      raw
        .split('\n')
        .map((line) => `  | ${line}`)
        .join('\n'),
    );
  }
  console.log();
}

// Nothing is written to disk or sent anywhere, so confirm that directly rather
// than asserting it in prose.
const storage = await page.evaluate(() => ({
  localStorage: Object.keys(localStorage).length,
  sessionStorage: Object.keys(sessionStorage).length,
  cookies: document.cookie.length,
}));
console.log(
  `client storage after run: localStorage=${storage.localStorage} sessionStorage=${storage.sessionStorage} cookies=${storage.cookies}`,
);

await page.screenshot({ path: resolve(ROOT, '.screenshots', 'real-batch.png'), fullPage: true });
await browser.close();
server.kill();

async function waitForServer(port) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(`http://localhost:${port}/`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Dev server did not start on ${port}`);
}