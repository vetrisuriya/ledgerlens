/**
 * Fast diagnostic loop for extraction quality.
 *
 * Pushes one receipt through the real app and prints the raw OCR text next to
 * the parsed fields, so a failure can be attributed to recognition or to parsing
 * rather than guessed at. Kept to a single image and no export step so a cycle
 * takes seconds.
 *
 * Run with: node scripts/diagnose.mjs [fixtureName]
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = resolve(ROOT, '.screenshots', 'fixtures');
const PORT = 4182;

const available = readdirSync(FIXTURES).filter((f) => f.endsWith('.png'));
if (available.length === 0) {
  console.error('No fixtures found. Run: node scripts/e2e.mjs');
  process.exit(1);
}

const fixture = process.argv[2] ?? available[0];
if (!available.includes(fixture)) {
  console.error(`Unknown fixture "${fixture}". Available: ${available.join(', ')}`);
  process.exit(1);
}

mkdirSync(FIXTURES, { recursive: true });

// Dev server, not `vite preview`: a stale build would make every reading below
// a lie.
const server = spawn('npx.cmd', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  shell: true,
  stdio: 'ignore',
});
process.on('exit', () => server.kill());

await waitForServer(PORT);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
page.on('pageerror', (error) => console.error('PAGE ERROR:', error.message));
page.on('console', (message) => {
  if (message.type() === 'error') console.error('CONSOLE:', message.text());
});

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

// Reference pass: which columns get derived. The table header is the only place
// the real column set is rendered, so it is read directly rather than guessed
// from the field chips.
await page.locator('input[type=file]').first().setInputFiles(resolve(FIXTURES, fixture));
await page.getByRole('button', { name: /Detect fields/ }).click();
await page.getByText(/^Found \d+ fields/).waitFor({ timeout: 180_000 });

console.log(`fixture: ${fixture}`);

// Batch pass: what the parser made of the same image.
await page.getByRole('button', { name: /Continue to batch upload/ }).click();
await page.getByText('Add images').waitFor();
await page.locator('input[type=file]').first().setInputFiles(resolve(FIXTURES, fixture));
await page.locator('table tbody tr').first().waitFor({ timeout: 180_000 });
await page.waitForTimeout(1200);

const headers = await page
  .locator('table thead th')
  .allInnerTexts()
  // Same slice as the row cells below: the row number and the actions cell are
  // chrome, and leaving one in shifts every label onto its neighbour's value.
  .then((cells) =>
    cells.slice(1, -1).map((cell) => cell.replace(/\s+/g, ' ').trim()).filter(Boolean),
  );

console.log('\ncolumns derived:');
for (const header of headers) console.log(`  - ${header}`);

// The inspector shows exactly what Tesseract read for the image.
await page.getByRole('button', { name: /Inspect OCR text/ }).first().click();
await page.locator('pre.ocr-text').waitFor({ timeout: 20_000 });

const raw = await page.locator('pre.ocr-text').innerText();
const badges = await page.locator('[role=dialog] span').allInnerTexts();

console.log('\nrow badges:', badges.map((b) => b.replace(/\s+/g, ' ').trim()).join(' | '));
console.log('\nraw OCR text:');
console.log(
  raw
    .split('\n')
    .map((line) => `  | ${line}`)
    .join('\n'),
);

const rows = await page.locator('table tbody tr').evaluateAll((trs) =>
  trs
    .filter((tr) => tr.querySelectorAll('td').length > 1)
    .map((tr) =>
      Array.from(tr.querySelectorAll('td'))
        .slice(1, -1)
        .map((td) => td.textContent.trim()),
    ),
);

console.log('\nparsed values:');
for (const cells of rows) {
  for (const [index, header] of headers.entries()) {
    const value = cells[index] || '—';
    if (value !== '—') console.log(`  ${header.padEnd(16)} ${value}`);
  }
  console.log('  ' + '-'.repeat(40));
}

await browser.close();
server.kill();

async function waitForServer(port) {
  for (let attempt = 0; attempt < 80; attempt++) {
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
