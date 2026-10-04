/**
 * Receipt images are rendered from HTML through a real browser so they look like
 * genuine phone screenshots, then pushed through the app's own OCR and parsing
 * code. The layouts below are transcribed from real Google Pay and PhonePe
 * transaction receipts, dark theme included.
 *
 * Run with: node scripts/e2e.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(ROOT, '.screenshots');
const FIXTURES = resolve(SHOTS, 'fixtures');
const PORT = 4181;

mkdirSync(FIXTURES, { recursive: true });

const RECEIPTS = [
  {
    name: 'gpay-1.png',
    payer: 'Lokesh Arun',
    payerPhone: '+91 •••• •5131',
    amount: '₹1,500',
    note: 'property pin',
    status: 'Completed',
    timestamp: '22 Aug 2025, 11:20 am',
    bank: 'HDFC Bank 7625',
    rows: [
      ['UPI transaction ID', '523467729727'],
      ['To: VETRISURIYA R', 'Google Pay • ••••ar-1@okhdfcbank'],
      ['From: LOKESH S (ICICI Bank)', 'Google Pay • ••••ns-3@okicici'],
      ['Google transaction ID', 'CICAgKibp-uiHA'],
    ],
    brand: 'G Pay',
    expected: {
      amount: '1500',
      payee: 'VETRISURIYA R',
      payerName: 'Lokesh Arun',
      payerBank: 'HDFC Bank 7625',
      payeeUpiId: 'ar-1@okhdfcbank',
      payerUpiId: 'ns-3@okicici',
      upiRefNo: '523467729727',
      transactionId: 'CICAgKibp-uiHA',
      date: '2025-08-22',
    },
  },
  {
    name: 'gpay-2.png',
    payer: 'Santhosh Kumar',
    payerPhone: '+91 •••• •9583',
    amount: '₹600',
    note: null,
    status: 'Completed',
    timestamp: '12 Mar 2022, 12:29 pm',
    bank: 'HDFC Bank 7625',
    rows: [
      ['UPI transaction ID', '207112544458'],
      ['To: VETRISURIYA R', 'Google Pay • ••••ar-1@okhdfcbank'],
      ['From: SANTHOSH KUMAR R (Citibank)', 'Google Pay • ••••sk98@oksbi'],
      ['Google transaction ID', 'CICAgOD1hMyWZQ'],
    ],
    brand: 'G Pay',
    expected: {
      amount: '600',
      payee: 'VETRISURIYA R',
      payerName: 'Santhosh Kumar',
      payerBank: 'HDFC Bank 7625',
      upiRefNo: '207112544458',
      transactionId: 'CICAgOD1hMyWZQ',
      date: '2022-03-12',
    },
  },
  {
    name: 'phonepe-1.png',
    payer: 'Anita Sharma',
    payerPhone: '+91 •••• •2210',
    amount: '₹2,499.50',
    note: null,
    status: 'Completed',
    timestamp: '09 Feb 2026, 07:31 pm',
    bank: 'HDFC Bank 7625',
    rows: [
      ['UPI transaction ID', '528833104756'],
      ['To: VETRISURIYA R', 'PhonePe • ••••vr18@ybl'],
      ['From: ANITA SHARMA (Axis Bank)', 'PhonePe • ••••ax44@okaxis'],
      ['PhonePe transaction ID', 'PP428819037551'],
    ],
    brand: 'PhonePe',
    light: true,
    expected: {
      amount: '2499.5',
      payee: 'VETRISURIYA R',
      payerName: 'Anita Sharma',
      payerBank: 'HDFC Bank 7625',
      upiRefNo: '528833104756',
      transactionId: 'PP428819037551',
      date: '2026-02-09',
    },
  },
];

// The dev server is used rather than `vite preview` so the checks always run
// against the current source. Previewing a stale build silently invalidates
// every result, which is exactly the trap this script exists to catch.
const server = spawn('npx.cmd', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  shell: true,
  stdio: 'ignore',
});

process.on('exit', () => server.kill());

await waitForServer(PORT);

const browser = await chromium.launch();

// Clipboard access is denied by default in headless Chromium, and the copy
// formats are part of what this tool promises, so it is granted up front.
const context = await browser.newContext({
  viewport: { width: 1440, height: 940 },
  permissions: ['clipboard-read', 'clipboard-write'],
});

// Step 1: render the receipts themselves.
const render = await context.newPage();
for (const receipt of RECEIPTS) {
  await render.setViewportSize({ width: 420, height: 820 });
  await render.setContent(receiptHtml(receipt), { waitUntil: 'load' });
  const buffer = await render.screenshot({ fullPage: true });
  writeFileSync(resolve(FIXTURES, receipt.name), buffer);
  console.log(`fixture  ${receipt.name}  ${(buffer.length / 1024).toFixed(0)} kB`);
}
await render.close();

// Step 2: drive the real app with them.
const page = await context.newPage();
page.on('pageerror', (error) => console.error('PAGE ERROR:', error.message));

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await page.screenshot({ path: resolve(SHOTS, '1-reference.png') });

const fileInput = page.locator('input[type=file]').first();
await fileInput.setInputFiles(resolve(FIXTURES, RECEIPTS[0].name));

await page.getByRole('button', { name: /Detect fields/ }).click();
await page.getByText(/^Found \d+ fields/).waitFor({ timeout: 180_000 });
await page.screenshot({ path: resolve(SHOTS, '2-reference-detected.png') });

await page.getByRole('button', { name: /Continue to batch upload/ }).click();
await page.getByText('Add images').waitFor();

// Step 3: batch-process all three receipts.
const batchInput = page.locator('input[type=file]').first();
await batchInput.setInputFiles(RECEIPTS.map((r) => resolve(FIXTURES, r.name)));

await page.locator('table tbody tr').first().waitFor({ timeout: 240_000 });
await page.waitForFunction(
  () => !document.body.innerText.includes('queued'),
  undefined,
  { timeout: 240_000 },
);
await page.waitForTimeout(1500);

// Step 3: every receipt must come back as a complete, correct row.
const headers = await page
  .locator('table thead th')
  .allInnerTexts()
  .then((cells) =>
    cells
      // Drop the row-number gutter and the actions column so the header list and
      // the cell list line up one to one.
      .slice(1, -1)
      .map((cell) => cell.replace(/\s+/g, ' ').trim()),
  );

console.log('\ncolumns in the table:');
console.log(headers.map((header) => `  - ${header}`).join('\n'));

// Rows are paired to files by the filename the app recorded for each row, not by
// position. The queue finishes images in whatever order OCR completes them, so
// index pairing compares one receipt's numbers against another's expectations and
// reports it as an extraction bug.
const records = [];
const rowCount = await page.locator('table tbody tr').count();

for (let index = 0; index < rowCount; index++) {
  const row = page.locator('table tbody tr').nth(index);
  if ((await row.locator('td').count()) < 2) continue;

  await row.getByRole('button', { name: /Inspect OCR text/ }).click();
  const dialog = page.locator('[role=dialog]');
  await dialog.waitFor({ timeout: 20_000 });
  const source = (await dialog.locator('h2').first().innerText()).trim();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached', timeout: 20_000 });

  const cells = await row
    .locator('td')
    .evaluateAll((tds) => tds.slice(1, -1).map((td) => td.textContent.trim()));

  records.push({ source, cells });
}

console.log('\nrows extracted:');
// JSON.stringify so a mis-encoded character is visible rather than looking like
// a plausible amount.
for (const { source, cells } of records) {
  console.log(`  ${source}`);
  console.log('  ' + cells.map((cell) => JSON.stringify(cell || '—').padEnd(20)).join(''));
}
await page.screenshot({ path: resolve(SHOTS, '3-batch.png') });

/** Mirrors `columnLabel` in src/lib/format.ts, so expectations use field keys. */
const COLUMN_LABEL = {
  amount: 'Amount',
  status: 'Status',
  provider: 'Provider',
  payee: 'Paid To',
  payeeUpiId: 'Payee UPI ID',
  payerName: 'Payer Name',
  payerBank: 'Payer Bank',
  payerUpiId: 'Payer UPI ID',
  payerAccount: 'Account',
  transactionId: 'Transaction ID',
  upiRefNo: 'UPI Ref No',
  date: 'Date',
  time: 'Time',
  method: 'Method',
  note: 'Note',
};

const failures = [];
for (const receipt of RECEIPTS) {
  const record = records.find((r) => r.source === receipt.name);
  if (!record) {
    failures.push(`${receipt.name}: no row was produced`);
    continue;
  }
  const { cells } = record;
  for (const [key, expected] of Object.entries(receipt.expected)) {
    // Headers are uppercased in the stylesheet, so match case-insensitively.
    const column = headers.findIndex((h) => h.toLowerCase() === COLUMN_LABEL[key].toLowerCase());
    if (column === -1) {
      failures.push(`${receipt.name}: no "${COLUMN_LABEL[key]}" column was derived`);
      continue;
    }
    const actual = cells[column] ?? '';
    // Names lose internal spaces to OCR's word segmentation on some renderings
    // ("VETRISURIYA R" -> "VETRISURIYAR"), which says nothing about extraction, so
    // names are compared with whitespace removed.
    const loose = key === 'payee';
    const normalise = (value) =>
      (loose ? value.replace(/\s+/g, '') : value.trim()).toLowerCase();

    if (normalise(actual) !== normalise(expected)) {
      failures.push(
        `${receipt.name}: ${COLUMN_LABEL[key]} = ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
      );
    }
  }
}

// Step 4: exports must actually download.
for (const label of ['Excel (.xlsx)', 'PDF', 'CSV', 'Markdown table']) {
  const download = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: new RegExp(label.replace(/[.()]/g, '\\$&')) }).click();
  const file = await download;
  console.log(`export  ${label.padEnd(18)} -> ${file.suggestedFilename()}`);
}

const copied = await page.evaluate(async () => {
  await navigator.clipboard.writeText('probe');
  return navigator.clipboard.readText();
});
console.log(`clipboard round-trip: ${copied === 'probe' ? 'ok' : 'unavailable (headless)'}`);

await browser.close();
server.kill();

if (failures.length > 0) {
  console.error(`\n${failures.length} assertion(s) failed:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('\nall extraction assertions passed');

function receiptHtml(receipt) {
  const bg = receipt.light ? '#ffffff' : '#1c1c1e';
  const fg = receipt.light ? '#1c1c1e' : '#f5f5f7';
  const muted = receipt.light ? '#6b7280' : '#a1a1a6';
  const card = receipt.light ? '#f5f5f5' : '#2c2c2e';
  const rule = receipt.light ? '#e5e5e7' : '#3a3a3c';

  return `<!doctype html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing:border-box; }
  body { margin:0; width:420px; min-height:820px; font-family:Roboto,Arial,sans-serif;
         background:${bg}; color:${fg}; padding:0 0 24px; }
  .wrap { padding:0 20px; text-align:center; }
  .avatar { width:64px; height:64px; border-radius:50%; background:${card};
            margin:36px auto 14px; }
  .payer { font-size:19px; font-weight:500; }
  .phone { font-size:14px; color:${muted}; margin-top:2px; }
  .amount { font-size:56px; font-weight:400; letter-spacing:-1.5px; margin:26px 0 18px; }
  .note { display:inline-block; background:${card}; color:${fg}; border-radius:8px;
          padding:8px 18px; font-size:14px; margin-bottom:20px; }
  .status { display:inline-flex; align-items:center; gap:7px; font-size:15px; color:${muted}; }
  .tick { width:17px; height:17px; border-radius:50%; background:#34a853; }
  .hr { height:1px; background:${rule}; margin:16px 52px 14px; }
  .ts { font-size:14px; color:${fg}; }
  .card { border:1px solid ${rule}; border-radius:14px; margin:26px 0 0; text-align:left;
          overflow:hidden; }
  .card-head { padding:16px 18px; font-size:15px; font-weight:500; }
  .card-body { border-top:1px solid ${rule}; padding:16px 18px; }
  .row + .row { margin-top:15px; }
  .k { font-size:14px; color:${muted}; }
  .v { font-size:14px; margin-top:2px; }
  .foot { font-size:13px; color:${fg}; line-height:1.5; margin-top:26px; }
  .upi { font-size:9px; color:${muted}; letter-spacing:1px; margin-top:22px; }
  .brand { font-size:20px; font-weight:500; margin-top:22px; }
</style></head>
<body>
  <div class="wrap">
    <div class="avatar"></div>
    <div class="payer">From ${receipt.payer}</div>
    <div class="phone">${receipt.payerPhone}</div>

    <div class="amount">${receipt.amount}</div>
    ${receipt.note ? `<div class="note">${receipt.note}</div>` : ''}

    <div class="status"><span class="tick"></span>${receipt.status}</div>
    <div class="hr"></div>
    <div class="ts">${receipt.timestamp}</div>

    <div class="card">
      <div class="card-head">${receipt.bank}</div>
      <div class="card-body">
        ${receipt.rows
          .map(([k, v]) => `<div class="row"><div class="k">${k}</div><div class="v">${v}</div></div>`)
          .join('')}
      </div>
    </div>

    <div class="foot">Payments may take up to 3 working days to be reflected in your account</div>
    <div class="upi">POWERED BY<br>UPI</div>
    <div class="brand">${receipt.brand}</div>
  </div>
</body></html>`;
}

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
