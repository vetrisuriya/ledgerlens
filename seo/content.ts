export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h2'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'steps'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] };

export interface FaqItem {
  question: string;
  answer: string;
}

export interface Page {
  /** Root-relative route without a trailing slash, e.g. '/how-it-works'. */
  slug: string;
  title: string;
  description: string;
  /** Included in the meta keywords tag, which no major engine reads, but Bing does. */
  keywords?: string[];
  h1: string;
  intro: string;
  blocks: Block[];
  faq?: FaqItem[];
  /** Slugs linked from the "related" strip at the foot of the page. */
  related?: string[];
  /** Sitemap priority, 0.0-1.0. */
  priority: number;
}

const MONEY_NOTE =
  'Amounts are written as bare numbers, so Excel, Google Sheets and LibreOffice treat them as numbers and can sum them straight away.';

export const PAGES: Page[] = [
  {
    slug: '/how-it-works',
    title: 'How LedgerLens turns payment screenshots into a spreadsheet',
    description:
      'How LedgerLens reads Google Pay and PhonePe receipt screenshots with on-device OCR, turns them into table rows and exports Excel, CSV or PDF.',
    keywords: [
      'how to convert payment screenshots to excel',
      'ocr screenshot to spreadsheet',
      'upi screenshot to excel',
    ],
    h1: 'How LedgerLens turns payment screenshots into a spreadsheet',
    intro:
      'A payment app screenshot is a picture of a receipt. Reconciling fifty of them by hand means fifty rounds of squinting, typing and re-checking. LedgerLens reads each screenshot with OCR that runs inside your browser, pulls the labelled values out, and lines them up in a table you can export.',
    blocks: [
      {
        kind: 'steps',
        items: [
          'Add one reference screenshot of a completed transaction. LedgerLens reads the field headings on that image and turns them into your column list, in the order they appear.',
          'Continue to the batch screen and drop in as many screenshots as you like. They queue up, get read one at a time, and appear as rows the moment each one finishes.',
          'Check the table, fix anything OCR read oddly, then copy the whole thing to your clipboard or export it as XLSX, CSV, TSV, PDF, Markdown, HTML or JSON.',
        ],
      },
      {
        kind: 'h2',
        text: 'Why the columns follow your screenshot',
      },
      {
        kind: 'p',
        text: 'The column list comes from your own screenshot rather than a hardcoded template, so the table matches the app you actually use. Screenshots from a Google Pay receipt produce different columns than screenshots from a PhonePe receipt, and each one is read the way its own screen lays them out.',
      },
      {
        kind: 'p',
        text: MONEY_NOTE,
      },
      {
        kind: 'ul',
        items: [
          'OCR runs in a Web Worker, so the page stays responsive while a batch is being read.',
          'Every row keeps the filename it came from, so a value can always be traced back to a specific screenshot.',
          'Every cell can be opened to see the raw text OCR actually read for it, which makes spot-checking fast.',
          'A cell is left empty rather than guessed when a figure cannot be read confidently. An empty amount is a prompt to re-check; a plausible wrong number is not.',
        ],
      },
      {
        kind: 'p',
        text: 'Nothing is uploaded at any point. There is no server to receive your images, and no database behind the app.',
      },
    ],
    related: ['/use-cases', '/export-formats', '/upi-screenshots-to-excel'],
    priority: 0.9,
  },
  {
    slug: '/use-cases',
    title: 'Who uses LedgerLens: freelancers, shops and small teams',
    description:
      'Practical ways freelancers, small shop owners, social media managers and bookkeepers use LedgerLens to turn payment screenshots into a clean spreadsheet.',
    keywords: [
      'reconcile upi payments spreadsheet',
      'freelancer payment tracker',
      'convert payment screenshots for accounting',
    ],
    h1: 'Who LedgerLens is built for',
    intro:
      'LedgerLens exists because most people get paid over UPI but receive proof as a stack of phone screenshots. These are the jobs it removes.',
    blocks: [
      {
        kind: 'h2',
        text: 'Freelancers and agencies',
      },
      {
        kind: 'p',
        text: 'Clients send a folder of payment screenshots after a milestone clears. LedgerLens turns the folder into one spreadsheet with the amount, who sent it, the UTR number and the date, so the invoice can be closed out in a couple of minutes instead of an afternoon.',
      },
      {
        kind: 'h2',
        text: 'Small shops and local businesses',
      },
      {
        kind: 'p',
        text: 'Cashiers keep receipts on their phone. At closing time those screenshots become the day book: what came in, from whom, and which reference number to quote if a payment needs to be traced.',
      },
      {
        kind: 'h2',
        text: 'Bookkeepers and accountants',
      },
      {
        kind: 'p',
        text: 'Clients who refuse to export their UPI history can screenshot the transaction list and hand it over as a spreadsheet. The UTR and UPI reference columns are what a bank query actually needs, and both are extracted.',
      },
      {
        kind: 'h2',
        text: 'Social media and event pages',
      },
      {
        kind: 'p',
        text: 'A page collecting entry fees through a payment QR gets a stream of screenshots. Converting them to a sheet makes it obvious what arrived, what is missing and who still owes.',
      },
      {
        kind: 'table',
        head: ['Job', 'Before', 'With LedgerLens'],
        rows: [
          [
            'Reconcile a month of freelance payments',
            'An hour of copying numbers out of screenshots',
            'One spreadsheet, exported as XLSX',
          ],
          [
            'Hand receipts to an accountant',
            'Forwarding 40 phone images',
            'One CSV with UTR and date columns',
          ],
          [
            'Check a bulk payment dropped correctly',
            'Opening each screenshot one by one',
            'A sortable table you can filter and total',
          ],
        ],
      },
    ],
    related: ['/how-it-works', '/export-formats', '/faq'],
    priority: 0.8,
  },
  {
    slug: '/google-pay-screenshot-to-excel',
    title: 'Google Pay screenshot to Excel: convert UPI receipts in bulk',
    description:
      'Convert Google Pay transaction screenshots into an Excel sheet. Extracts amount, payer, bank, UPI ID, UTR, date and note, then exports XLSX or CSV.',
    keywords: [
      'google pay screenshot to excel',
      'google pay transaction screenshot to csv',
      'gpay screenshot to spreadsheet',
      'bulk google pay receipts excel',
    ],
    h1: 'Google Pay screenshot to Excel',
    intro:
      'Take a screenshot of a completed Google Pay receipt and LedgerLens reads the whole transaction detail screen: who paid, which bank, the UPI ID on each side, the UTR number, the Google transaction ID, the date and any note you were sent. Add a second screenshot and it becomes a second row in the same table.',
    blocks: [
      {
        kind: 'ul',
        items: [
          'Amount and currency as text, not a formula, so nothing gets mangled on export.',
          'Payer name and the bank the payment came from.',
          'The UPI ID of both sender and receiver.',
          'UPI reference number, also called the UTR.',
          'Google transaction ID.',
          'Date and time, normalised to YYYY-MM-DD.',
          'The note or "add a note" message, useful for invoice references.',
        ],
      },
      {
        kind: 'steps',
        items: [
          'Open one Google Pay receipt, tap through to the full transaction details screen, and screenshot that.',
          'Upload it as the reference image so its headings define your columns.',
          'Drop the rest of the screenshots onto the batch screen.',
          'Export as XLSX for Excel or CSV for Google Sheets.',
        ],
      },
      {
        kind: 'p',
        text: 'Transaction IDs are the weakest field. They are long mixed-case alphanumeric strings printed at a small size, and OCR confuses characters that differ by a stroke, so `t` can come back as `O` and `b` as `6`. UPI reference numbers read reliably; check the Google transaction ID against the app before quoting it to anyone.',
      },
    ],
    faq: [
      {
        question: 'How do I convert Google Pay screenshots to Excel?',
        answer:
          'Upload one Google Pay receipt screenshot as the reference image so its headings become your columns, then drop every other screenshot onto the batch screen. Each one is read and added as a row, and the finished table exports as XLSX, CSV, TSV, PDF, HTML, Markdown or JSON.',
      },
      {
        question: 'Does LedgerLens need access to my Google Pay account?',
        answer:
          'No. There is no login and no account linking. LedgerLens reads the screenshot you already have, in your own browser, so it never touches your Google Pay login, your bank account or your transaction history.',
      },
      {
        question: 'Can I convert 100 Google Pay screenshots at once?',
        answer:
          'Yes. Drop all of them in one go. They queue up and are processed one at a time, each row appearing as its image finishes, so there is no fixed batch limit beyond what your device can hold open.',
      },
    ],
    related: ['/phonepe-screenshot-to-csv', '/upi-screenshots-to-excel', '/export-formats'],
    priority: 1.0,
  },
  {
    slug: '/phonepe-screenshot-to-csv',
    title: 'PhonePe screenshot to CSV: batch UPI receipts instantly',
    description:
      'Turn PhonePe transaction screenshots into a CSV or Excel sheet. Extracts amount, payer, UPI ID, UTR number, date and note. Free, no signup.',
    keywords: [
      'phonepe screenshot to csv',
      'phonepe transaction screenshot to excel',
      'phonepe history to excel',
      'phonepe receipt screenshot spreadsheet',
    ],
    h1: 'PhonePe screenshot to CSV',
    intro:
      'PhonePe receipts carry everything an accountant asks for: the amount, the sender name and bank, both UPI handles, the UTR number, the transaction ID, the date and the note. LedgerLens pulls those out of each screenshot and stacks them into a CSV you can open in Excel or Google Sheets.',
    blocks: [
      {
        kind: 'ul',
        items: [
          'Columns follow your screenshot, so the CSV matches the PhonePe layout you are used to reading.',
          'Dates come out as YYYY-MM-DD, which Excel and Sheets both sort correctly without any fixing.',
          'Amounts come out numeric so a SUM column works immediately.',
          'The filename each row came from is kept alongside it, so nothing becomes untraceable.',
        ],
      },
      {
        kind: 'steps',
        items: [
          'Screenshot the PhonePe transaction details screen of one completed payment.',
          'Upload it as the reference image.',
          'Drop the remaining screenshots onto the batch screen.',
          'Choose CSV for a spreadsheet, or TSV if you plan to paste straight into Google Sheets.',
        ],
      },
      {
        kind: 'p',
        text: 'If you only want the numbers, CSV is the smallest export. If you need it to look like a document for someone else, the PDF export lays the table out with a header and page numbers.',
      },
    ],
    faq: [
      {
        question: 'Is there a PhonePe CSV export inside the app?',
        answer:
          'There is no account export. LedgerLens is the route from screenshots to CSV: you screenshot the transactions you need, and it produces the CSV for you. It never asks for your PhonePe login.',
      },
      {
        question: 'Can I paste the result straight into Google Sheets?',
        answer:
          'Yes. Use the tab-separated export, copy it, and paste into a cell in Sheets. The columns land in separate cells instead of one long line.',
      },
    ],
    related: ['/google-pay-screenshot-to-excel', '/upi-screenshots-to-excel', '/export-formats'],
    priority: 1.0,
  },
  {
    slug: '/upi-screenshots-to-excel',
    title: 'UPI screenshots to Excel: Google Pay, PhonePe, Paytm, BHIM',
    description:
      'Turn UPI payment screenshots from any app into one Excel sheet. Reads Google Pay, PhonePe, Paytm and BHIM receipts into a single spreadsheet.',
    keywords: [
      'upi screenshot to excel',
      'upi transaction screenshot to spreadsheet',
      'convert upi screenshots to csv',
      'bulk payment screenshots to table',
      'paytm transaction history to excel',
    ],
    h1: 'UPI screenshots to Excel, whichever app sent them',
    intro:
      'A UPI transfer does not care which app you used, so a month of payments can arrive as a mix of Google Pay, PhonePe, Paytm and BHIM screenshots. LedgerLens reads the receipt layout each app uses and resolves the labelled fields into one consistent set of columns.',
    blocks: [
      {
        kind: 'table',
        head: ['Field', 'What it is used for'],
        rows: [
          ['Amount', 'The figure as a number, ready to total'],
          ['Sender name', 'Who paid you'],
          ['Sender bank / UPI ID', 'Which account it came from'],
          ['UPI reference number (UTR)', 'The number a bank needs to trace a payment'],
          ['Transaction ID', 'The app-level reference, sometimes called the Google transaction ID'],
          ['Date', 'Normalised to YYYY-MM-DD'],
          ['Note', 'Usually the invoice or reference you typed'],
          ['Source file', 'The screenshot filename each row came from'],
        ],
      },
      {
        kind: 'h2',
        text: 'Which apps it reads',
      },
      {
        kind: 'ul',
        items: [
          'Google Pay (GPay), both light and dark transaction screens.',
          'PhonePe transaction details screens.',
          'Paytm and BHIM UPI receipts, where the wording matches.',
          'Any app that lays a heading and its value out side by side, since extraction is label-first rather than tied to one template.',
        ],
      },
      {
        kind: 'p',
        text: 'If an app redesigns its receipt wording, the field headings it looks for are declared in one list in the source, so support for a new label is a small change.',
      },
    ],
    faq: [
      {
        question: 'Which payment apps can LedgerLens read?',
        answer:
          'Google Pay, PhonePe, Paytm and BHIM UPI receipts are supported out of the box. Because the parser matches the headings a receipt prints rather than a fixed screen layout, other UPI apps often work as well, at the cost of checking the first row.',
      },
      {
        question: 'What happens when OCR is unsure about a value?',
        answer:
          'The cell is left empty instead of being guessed. Click any cell to see the raw text OCR read for it. An empty amount is an obvious prompt to re-check the screenshot, whereas a plausible wrong number is not.',
      },
      {
        question: 'Is the OCR accurate on every screenshot?',
        answer:
          'Not every field. Amounts, dates and UPI reference numbers are reliable. Long alphanumeric transaction IDs and small bank name text are the weakest, because OCR confuses characters that differ by a stroke. The app is built so you can check a cell against its screenshot in one click.',
      },
    ],
    related: ['/google-pay-screenshot-to-excel', '/phonepe-screenshot-to-csv', '/use-cases'],
    priority: 0.9,
  },
  {
    slug: '/export-formats',
    title: 'Export formats: XLSX, CSV, TSV, PDF, Markdown, HTML, JSON',
    description:
      'Every LedgerLens export explained: XLSX, CSV, TSV, PDF, Markdown, HTML and JSON, and which to pick for Excel, Sheets or accounting software.',
    keywords: [
      'export table to excel',
      'csv vs xlsx',
      'export spreadsheet to pdf',
      'paste into google sheets',
    ],
    h1: 'Export formats, and which one to pick',
    intro:
      'The table can leave LedgerLens in seven shapes. The format does not change the data, only how the spreadsheet or document on the other end treats it.',
    blocks: [
      {
        kind: 'table',
        head: ['Format', 'Best for'],
        rows: [
          ['XLSX', 'Excel, Numbers and LibreOffice. A real workbook with a sheet, a header row and numeric cells.'],
          ['CSV', 'Anything that imports delimited text. Smallest file, widest support, best for handing to an accountant.'],
          ['TSV (tab-separated)', 'Pasting straight into Google Sheets so the columns land in separate cells.'],
          ['PDF', 'Sending the table to someone who should see it but not edit it. Repeating header row, page numbers.'],
          ['Markdown', 'Pasting into Notion, Obsidian, Slack or a GitHub issue.'],
          ['HTML', 'Dropping into an email or a document that keeps tables.'],
          ['JSON', 'Feeding another tool or your own script. Field names are stable, so it is the one to automate against.'],
        ],
      },
      {
        kind: 'h2',
        text: 'A note on numbers',
      },
      {
        kind: 'p',
        text: `${MONEY_NOTE} Dates are written as YYYY-MM-DD, which is unambiguous and sorts correctly, instead of a locale format that changes meaning between machines.`,
      },
      {
        kind: 'h2',
        text: 'A note on the copy button',
      },
      {
        kind: 'p',
        text: 'The copy action puts tab-separated text on the clipboard. Select a single cell first to copy just that value, which is the quickest way to paste one amount into a message.',
      },
    ],
    related: ['/how-it-works', '/upi-screenshots-to-excel', '/faq'],
    priority: 0.7,
  },
  {
    slug: '/faq',
    title: 'Frequently asked questions about LedgerLens',
    description:
      'Answers about LedgerLens: free with no login, screenshots are never uploaded, which payment apps it reads, and how accurate the OCR is.',
    h1: 'Frequently asked questions',
    intro:
      'The questions people actually ask about a tool that reads payment screenshots.',
    blocks: [
      {
        kind: 'p',
        text: 'The privacy questions come first because they are the ones that decide whether the tool is usable at all. If you only want the mechanics, start with how it works.',
      },
    ],
    faq: [
      {
        question: 'Are my payment screenshots uploaded anywhere?',
        answer:
          'No. LedgerLens has no backend. Images are decoded and read inside your own browser tab, never written to localStorage, sessionStorage or IndexedDB, and dropped from memory as soon as they have been processed. The only thing cached in the browser is the Tesseract English language model of about 15 MB, which contains no user data.',
      },
      {
        question: 'Is LedgerLens free? Do I need an account?',
        answer:
          'It is free, with no login, no signup and no upload limit. Open the page and start using it.',
      },
      {
        question: 'Does it work offline?',
        answer:
          'After the first load, yes. Everything needed to read images and export files is cached by the browser, so you can run a batch with no connection once the page is open.',
      },
      {
        question: 'Which payment apps does it support?',
        answer:
          'Google Pay, PhonePe, Paytm and BHIM UPI receipts. The parser matches the headings a receipt prints rather than one fixed template, so other UPI apps often work too.',
      },
      {
        question: 'How accurate is the OCR?',
        answer:
          'Amounts, dates, UPI IDs and UTR reference numbers are reliable. Transaction IDs and small bank name text are the weakest fields, because OCR confuses characters that differ by a stroke. Every cell can be opened to show the raw text OCR read for it, so a check takes one click.',
      },
      {
        question: 'How many screenshots can I process at once?',
        answer:
          'There is no fixed limit. Images are processed one at a time and each File is released as soon as it is done, so a large batch does not hold every decoded image in memory at once.',
      },
      {
        question: 'Why is a cell empty instead of filled in with something plausible?',
        answer:
          'Because an empty cell is a visible prompt to re-check the screenshot, while a plausible wrong number is not. A missing amount that looks real is the failure mode worth designing against.',
      },
      {
        question: 'Can I get my data back if I close the tab?',
        answer:
          'Nothing is stored, so there is nothing to restore. Export the table before you close the tab. This is deliberate: the app has no server and no database, which is exactly why it can promise your screenshots stay on your device.',
      },
      {
        question: 'Who made LedgerLens?',
        answer:
          'It is a small project by Vetri Suriya. The source is open, and the code is available if you want to check the privacy claims above rather than take them on trust.',
      },
    ],
    related: ['/how-it-works', '/privacy', '/about'],
    priority: 0.8,
  },
  {
    slug: '/privacy',
    title: 'Privacy: no uploads, no storage, no tracking',
    description:
      'LedgerLens privacy policy: payment screenshots are decoded and read in your browser, never uploaded or stored, and no tracking runs on the page.',
    h1: 'Privacy',
    intro:
      'LedgerLens reads payment screenshots. Those are about as sensitive as a screenshot gets, so the design rule was simple: the images never leave the machine they are on.',
    blocks: [
      {
        kind: 'h2',
        text: 'What happens to your images',
      },
      {
        kind: 'ul',
        items: [
          'Each image you select is decoded in your browser and handed to the OCR engine running in a Web Worker on your device.',
          'No image, filename or extracted value is sent over the network. There is no server for them to be sent to.',
          'Nothing is written to localStorage, sessionStorage or IndexedDB. There is no database.',
          'Each File is released from memory as soon as its row has been produced, so a large batch never holds every image at once.',
          'Closing or reloading the tab discards everything.',
        ],
      },
      {
        kind: 'h2',
        text: 'What is stored in the browser',
      },
      {
        kind: 'p',
        text: 'The Tesseract English OCR model, about 15 MB, is cached by the browser so it does not re-download on every visit. It is a language model: it contains no user data. No other payload about you or your files is cached.',
      },
      {
        kind: 'h2',
        text: 'Analytics and cookies',
      },
      {
        kind: 'p',
        text: 'None. There are no analytics, no cookies, no advertising or cross-site tracking scripts on this site. Nothing about your visit is measured or shared with a third party.',
      },
      {
        kind: 'h2',
        text: 'Exports',
      },
      {
        kind: 'p',
        text: 'Exports are generated in your browser and saved directly by your browser to your downloads. They are not uploaded anywhere, and the app keeps no copy.',
      },
      {
        kind: 'h2',
        text: 'Hosting logs',
      },
      {
        kind: 'p',
        text: 'The site is served as static files from a CDN. Like any web host, the CDN keeps short-lived request logs such as IP address, user agent and requested path. Those logs contain no image data, because no image data ever reaches the server.',
      },
    ],
    related: ['/faq', '/about', '/how-it-works'],
    priority: 0.6,
  },
  {
    slug: '/about',
    title: 'About LedgerLens',
    description:
      'LedgerLens is a free, open source browser tool that turns UPI payment screenshots into spreadsheets. Built by Vetri Suriya.',
    keywords: ['ledgerlens about', 'open source ocr tool'],
    h1: 'About LedgerLens',
    intro:
      'LedgerLens started as a way to avoid retyping a month of freelance payments out of phone screenshots, and it stayed deliberately narrow: read payment receipts, produce a table, get out of the way.',
    blocks: [
      {
        kind: 'h2',
        text: 'How it is built',
      },
      {
        kind: 'ul',
        items: [
          'OCR runs on your device with Tesseract.js in a Web Worker. No server, no API key, no account.',
          'The column list comes from your own reference screenshot instead of a hardcoded template, so the output matches the app you use.',
          'Export formats are generated in the browser with ExcelJS, jsPDF and the File API.',
          'The source is open, so the privacy claims on this site can be checked rather than trusted.',
        ],
      },
      {
        kind: 'h2',
        text: 'Honest limits',
      },
      {
        kind: 'p',
        text: 'Transaction IDs and small bank names are the fields OCR is weakest on, because they are long or small mixed-case strings where similar-looking characters get confused. The app leans into that rather than hiding it: click any cell to see the text OCR actually read, and the raw text is kept for the field so you can decide.',
      },
      {
        kind: 'h2',
        text: 'Made by',
      },
      {
        kind: 'p',
        text: 'LedgerLens is built and maintained by Vetri Suriya.',
      },
    ],
    related: ['/faq', '/privacy', '/how-it-works'],
    priority: 0.6,
  },
];

export const PAGES_BY_SLUG = new Map(PAGES.map((page) => [page.slug, page]));