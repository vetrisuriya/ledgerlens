# LedgerLens

Turns batches of Google Pay, PhonePe and other UPI payment screenshots into a
table you can copy or export. Everything runs in the browser — screenshots are
never uploaded, never written to disk, and never sent anywhere.

Built for reconciling freelance payments against a client's screenshots, so every
row keeps the filename it came from and every cell can be traced back to the text
OCR actually read.

## The problem

Getting paid over UPI means getting paid by screenshot. A client sends a folder of
payment confirmations, a shop's cashier keeps receipts on their phone, a
bookkeeper's client refuses to export their transaction history. The data exists,
but only as images, and retyping it is pure avoidable work.

LedgerLens reads those images and hands back a spreadsheet.

## Who it is for

- **Freelancers and agencies** closing out a milestone against a folder of
  screenshots.
- **Small shops and local businesses** turning a day's receipts into a day book.
- **Bookkeepers and accountants** who need UTR numbers and dates, not screenshots.
- **Social media and event pages** collecting fees through a payment QR and
  needing to know what arrived.

## How it works

1. **Reference image** — drop one transaction screenshot. The field headings on
   that image become your table columns, in the order they appear.
2. **Batch screen** — drop as many screenshots as you like. Each one is read and
   appended to the table as it finishes. No page reload, no fixed limit.
3. **Copy or export** — CSV, tab-separated (for pasting into Sheets), `.xlsx`,
   Markdown, PDF, HTML, or JSON.

There is no login, no signup and no upload limit. Open the page and start.

## What it reads

Extraction is **label-first**: it looks for the heading a receipt prints
(`UPI transaction ID`, `To:`, `Amount`, `From:`) and takes the value beside or
beneath it, rather than matching a fixed screen layout. That pairing survives OCR
noise far better than whole-page pattern matching, and it is why the columns come
from your own screenshot instead of a hardcoded template.

| Field | Notes |
| --- | --- |
| Amount | Bare number, no `₹`, so spreadsheets treat it as numeric and can sum it |
| Sender name and bank | The trailing account digits are reliable, the bank name less so |
| Sender and receiver UPI ID | Both sides of the transfer |
| UPI reference number (UTR) | What a bank needs to trace a payment |
| Transaction ID | The app-level reference, e.g. a Google transaction ID |
| Date | Normalised to `YYYY-MM-DD`, so it sorts correctly everywhere |
| Note | Usually the invoice reference you typed |
| Source file | The screenshot filename each row came from |

Supported out of the box: **Google Pay**, **PhonePe**, **Paytm** and **BHIM** UPI
receipts. Because the parser matches headings rather than one template, other UPI
apps often work too — at the cost of checking the first row.

## Export formats

The format changes how the spreadsheet or document on the other end treats the
data, not the data itself.

| Format | Best for |
| --- | --- |
| `.xlsx` | Excel, Numbers, LibreOffice — a real workbook with numeric cells |
| CSV | Anything that imports delimited text; smallest file, widest support |
| TSV | Pasting straight into Google Sheets so columns land in separate cells |
| PDF | Sending the table to someone who should read it, not edit it |
| Markdown | Notion, Obsidian, Slack, a GitHub issue |
| HTML | An email or a document that keeps tables |
| JSON | Feeding another tool or your own script |

Every row also keeps the raw text OCR read for each cell, so a doubtful value can
be checked against its screenshot in one click.

## Privacy

The privacy claim is load-bearing for this tool, so the design follows from it:

- No backend. There is no server to receive your images.
- No `localStorage`, `sessionStorage`, or IndexedDB writes for image or row data.
- Each image is handed to the OCR engine and dropped from the queue as soon as it
  is processed, so a 2000-image batch never holds 2000 decoded images in memory.
- No analytics, no cookies, no advertising or cross-site tracking scripts.
- Exports are generated in your browser and saved directly to your downloads.
- The one thing cached in the browser is the Tesseract English language model
  (~15 MB), which contains no user data.

Closing the tab discards everything, so export before you do.

## Search and sharing

Because the tool is one page, the site around it is a set of static pages that
answer the searches people actually make — "google pay screenshot to excel",
"phonepe screenshot to csv", "upi screenshots to excel" — rather than a wall of
keyword text.

Each page carries its own canonical URL, Open Graph and Twitter tags, structured
data (`WebPage`, `BreadcrumbList` and, where questions are answered,
`FAQPage`), and links to the pages next to it. The app page itself ships
structured data for the tool, a canonical URL, and a generated 1200×630 share
card, so a link posted anywhere shows the tool rather than a blank box. A sitemap
lists every page and `robots.txt` points at it. Crawlers with JavaScript disabled
still get the rendered app markup.

## How it's built

| Concern | Choice |
| --- | --- |
| Build | Vite 5, `base: './'` so it works on any Pages path |
| UI | React 18 + TypeScript + Tailwind |
| OCR | Tesseract.js 5 (runs in its own worker, on the user's device) |
| Spreadsheet | ExcelJS |
| PDF | jsPDF + jspdf-autotable |
| Tests | Vitest, plus Playwright for the browser-level checks |
| SEO | Generated content pages, prerendered app HTML, JSON-LD, sitemap |

## Known limits

- OCR accuracy depends on screenshot quality. Images are conditioned
  automatically (upscale + greyscale, and a contrast stretch only when the image
  is genuinely flat), but very small or heavily compressed images will lose
  digits.
- **Transaction IDs are the weakest field.** They are long mixed-case
  alphanumeric strings at small type sizes, and OCR confuses characters that
  differ by a stroke (`t`/`O`, `b`/`6`). UPI reference numbers read reliably;
  Google transaction IDs did not on the reference screenshots. Check them against
  the app before relying on them.
- **Bank names can come back mangled** for the same reason: the vendor name in a
  card header is small, and OCR read `HDFC Bank 7625` as `prcBank 7625`.
- A cell is left empty rather than guessed when a figure cannot be read with any
  confidence. An empty amount is a visible prompt to re-check the screenshot; a
  plausible wrong number is not.
- If a payment app redesigns its receipt wording, the app needs the new heading
  phrases rather than relying on the regexes to keep up.

---

Made with love by [vetrisuriya.in](https://vetrisuriya.in)