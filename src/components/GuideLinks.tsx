import { relativeHref } from '../config';

const GUIDES = [
  {
    href: '/google-pay-screenshot-to-excel',
    title: 'Google Pay screenshot to Excel',
    detail: 'Amount, payer bank, UPI ID, UTR, Google transaction ID, date and note.',
  },
  {
    href: '/phonepe-screenshot-to-csv',
    title: 'PhonePe screenshot to CSV',
    detail: 'Batch PhonePe receipts into a sheet that opens straight in Sheets or Excel.',
  },
  {
    href: '/upi-screenshots-to-excel',
    title: 'UPI screenshots to one spreadsheet',
    detail: 'Mix Google Pay, PhonePe, Paytm and BHIM screenshots in a single table.',
  },
  {
    href: '/export-formats',
    title: 'XLSX, CSV, TSV, PDF, JSON',
    detail: 'Which export to hand to an accountant, paste into Sheets, or automate with.',
  },
];

export function GuideLinks() {
  return (
    <section aria-labelledby="guides-heading" className="border-t px-5 py-8">
      <div className="mx-auto max-w-5xl">
        <h1 id="guides-heading" className="text-base font-semibold tracking-tight">
          Turn Google Pay, PhonePe and UPI payment screenshots into a spreadsheet
        </h1>
        <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          LedgerLens reads a batch of payment receipt screenshots with OCR running in this tab and
          turns each one into a row, then exports the table as XLSX, CSV, TSV, PDF, Markdown, HTML or
          JSON. Nothing is uploaded, nothing is stored, and there is no login.
        </p>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {GUIDES.map((guide) => (
            <li key={guide.href}>
              <a
                className="block h-full rounded-md border p-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
                href={`${relativeHref(guide.href)}/`}
              >
                <span className="block text-xs font-medium leading-snug">{guide.title}</span>
                <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                  {guide.detail}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}