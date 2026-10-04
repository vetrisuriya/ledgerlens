/**
 * Renders the social share card (public/og-image.png, 1200x630) from an HTML
 * template, so the link preview on WhatsApp, X and LinkedIn shows the tool and
 * not a blank box.
 *
 * Run with: node scripts/generate-og-image.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(ROOT, 'public', 'og-image.png');

const MARK = `<svg viewBox="0 0 64 64" width="76" height="76" aria-hidden="true">
  <rect width="64" height="64" rx="14" fill="rgba(255,255,255,0.16)" />
  <rect x="29" y="10" width="6" height="19" rx="3" fill="#fff" />
  <path d="M32 40 22.5 28.5h19Z" fill="#fff" />
  <rect x="15" y="45" width="34" height="5.5" rx="2.75" fill="#fff" fill-opacity="0.95" />
  <rect x="15" y="54" width="21" height="5.5" rx="2.75" fill="#fff" fill-opacity="0.7" />
</svg>`;

const ROWS = [
  ['Anita Sharma', 'HDFC Bank 7625', '1,500', '22 Aug 2025'],
  ['Lokesh Arun', 'ICICI Bank 0041', '600', '12 Mar 2025'],
  ['Santhosh Kumar', 'Citibank 8812', '12,000', '04 Feb 2025'],
];

const receipt = `<svg viewBox="0 0 40 56" width="72" height="100" aria-hidden="true">
  <rect x="1" y="1" width="38" height="54" rx="6" fill="#fff" fill-opacity="0.92" />
  <rect x="8" y="10" width="24" height="4" rx="2" fill="#1d4ed8" fill-opacity="0.55" />
  <rect x="8" y="19" width="24" height="7" rx="2" fill="#0f172a" fill-opacity="0.75" />
  <rect x="8" y="31" width="11" height="3" rx="1.5" fill="#0f172a" fill-opacity="0.3" />
  <rect x="21" y="31" width="11" height="3" rx="1.5" fill="#0f172a" fill-opacity="0.3" />
  <rect x="8" y="38" width="11" height="3" rx="1.5" fill="#0f172a" fill-opacity="0.3" />
  <rect x="21" y="38" width="11" height="3" rx="1.5" fill="#0f172a" fill-opacity="0.3" />
  <rect x="8" y="45" width="24" height="3" rx="1.5" fill="#2563eb" fill-opacity="0.35" />
</svg>`;

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
      rel="stylesheet"
    />
    <style>
      * { box-sizing: border-box; margin: 0; }
      body {
        width: 1200px;
        height: 630px;
        display: flex;
        font-family: Inter, system-ui, sans-serif;
        color: #fff;
        background:
          radial-gradient(900px 520px at 88% -10%, rgba(96, 165, 250, 0.55), transparent 60%),
          radial-gradient(700px 420px at 6% 108%, rgba(30, 58, 138, 0.9), transparent 62%),
          linear-gradient(128deg, #1d4ed8 0%, #1e3a8a 100%);
      }
      .card {
        width: 100%;
        height: 100%;
        padding: 62px 68px;
        display: flex;
        flex-direction: column;
      }
      .brand { display: flex; align-items: center; gap: 18px; }
      .brand span { font-size: 32px; font-weight: 700; letter-spacing: -0.02em; }
      h1 {
        margin-top: 34px;
        font-size: 62px;
        line-height: 1.08;
        font-weight: 800;
        letter-spacing: -0.03em;
        max-width: 17ch;
      }
      h1 em { font-style: normal; color: #bfdbfe; }
      .sub {
        margin-top: 20px;
        font-size: 25px;
        line-height: 1.45;
        color: rgba(219, 234, 254, 0.92);
        max-width: 30ch;
      }
      .flow { margin-top: auto; display: flex; align-items: center; gap: 20px; }
      .shots { display: flex; }
      .shots > div { margin-left: -18px; }
      .shots > div:first-child { margin-left: 0; }
      .shots > div:nth-child(2) { transform: rotate(2deg); }
      .shots > div:nth-child(3) { transform: rotate(6deg); }
      .arrow { font-size: 30px; color: rgba(219, 234, 254, 0.85); }
      .sheet {
        background: rgba(255, 255, 255, 0.97);
        border-radius: 12px;
        padding: 16px 20px 18px;
        box-shadow: 0 22px 48px rgba(2, 6, 23, 0.34);
      }
      table { border-collapse: collapse; font-size: 17px; color: #0f172a; }
      th {
        text-align: left;
        font-size: 13px;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: #64748b;
        padding: 0 22px 9px 0;
        border-bottom: 1px solid #e2e8f0;
      }
      td { padding: 9px 22px 0 0; font-weight: 500; }
      td.amount { font-variant-numeric: tabular-nums; font-weight: 700; }
      .foot {
        margin-top: 30px;
        display: flex;
        gap: 14px;
        align-items: center;
        font-size: 19px;
        font-weight: 500;
        color: rgba(219, 234, 254, 0.9);
      }
      .foot i {
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: #93c5fd;
        font-style: normal;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="brand">${MARK}<span>LedgerLens</span></div>

      <h1>Payment screenshots to <em>ledger tables</em></h1>
      <p class="sub">
        Google Pay and PhonePe receipts in, an Excel, CSV or PDF sheet out.
      </p>

      <div class="flow">
        <div class="shots">
          <div>${receipt}</div>
          <div>${receipt}</div>
          <div>${receipt}</div>
        </div>
        <div class="arrow">→</div>
        <div class="sheet">
          <table>
            <thead>
              <tr>
                <th>Sender</th>
                <th>Bank</th>
                <th>Amount</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              ${ROWS.map(
                (row) =>
                  `<tr><td>${row[0]}</td><td>${row[1]}</td><td class="amount">₹${row[2]}</td><td>${row[3]}</td></tr>`,
              ).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="foot">
        <i></i>Runs entirely in your browser
        <i></i>Nothing is uploaded
        <i></i>Free, no login
      </div>
    </div>
  </body>
</html>
`;

mkdirSync(dirname(OUTPUT), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'networkidle' });
const buffer = await page.screenshot({ type: 'png' });
await browser.close();

writeFileSync(OUTPUT, buffer);
console.log(
  `og-image.png  1200x630  ${(buffer.length / 1024).toFixed(1)} kB -> public/og-image.png`,
);