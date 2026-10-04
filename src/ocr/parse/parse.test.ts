import { describe, expect, it } from 'vitest';
import type { OcrLine, OcrResult } from '../engine';
import { deriveColumns, detectProvider, extractTransaction } from './index';

/**
 * Builds the shape `extractTransaction` consumes directly from a block of text,
 * so parser behaviour can be tested without running real OCR.
 *
 * A line prefixed with `!` is given a tall box, mirroring the headline amount on
 * a real receipt. Glyph height is a signal the amount extractor depends on, so
 * the fixtures have to carry it.
 */
function ocr(text: string): OcrResult {
  const lines: OcrLine[] = text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((raw, index) => {
      const headline = raw.startsWith('!');
      const value = headline ? raw.slice(1) : raw;
      const height = headline ? 96 : 26;
      const top = index * 60;

      return {
        text: value,
        confidence: 90,
        bbox: { x0: 20, y0: top, x1: 400, y1: top + height },
        words: [],
      };
    });

  return {
    text: lines.map((line) => line.text).join('\n'),
    lines,
    confidence: 90,
    psm: '11',
  };
}

/** Transcribed from real Google Pay transaction receipts. */
const GPAY = `From Lokesh Arun
+91 •••• •5131
!₹1,500
property pin
Completed
22 Aug 2025, 11:20 am
HDFC Bank 7625
UPI transaction ID
523467729727
To: VETRISURIYA R
Google Pay • ••••ar-1@okhdfcbank
From: LOKESH S (ICICI Bank)
Google Pay • ••••ns-3@okicici
Google transaction ID
CICAgKibp-uiHA
Payments may take up to 3 working days to be reflected in your account
POWERED BY UPI
G Pay`;

/** Same receipt with the rupee sign misread, which Tesseract does routinely. */
const GPAY_NO_RUPEE = GPAY.replace('!₹1,500', '!%1,500');

/**
 * Ground truth: the exact lines and glyph heights Tesseract reported for a real
 * Google Pay receipt, captured with `scripts/ocr-lines.mjs`.
 *
 * These numbers matter. The headline measured 49px while ordinary body lines
 * reached 29px, so an earlier "tallest line wins" rule read the debit account
 * digits instead of the total, and the wrapped settlement disclaimer put a lone
 * "account" on its own line where it looked like a field heading.
 */
const REAL_GPAY_OCR: Array<[string, number]> = [
  ['From Lokesh Arun', 28],
  ['+91', 10],
  ['+ +5131', 10],
  ['1,500', 49],
  ['propertypin @ Completed', 15],
  ['22 Aug 2025,11:20 am', 28],
  ['HDFC Bank 7625', 28],
  ['UPI transaction ID.', 10],
  ['523467729727', 10],
  ['To: VETRISURIYA R', 10],
  ['Google Pay', 14],
  ['-ar-1@okhdfcbank', 14],
  ['From: LOKESH S (ICICI Bank)', 10],
  ['Google Pay - »ns-3@okicici', 14],
  ['Google transaction ID', 10],
  ['CICAgKibp-uiHA', 14],
  ['Payments may take up to 3 working days to be reflected in your', 29],
  ['account', 9],
  ['POWERED BY', 7],
  ['[3', 7],
  ['G Pay', 16],
];

/**
 * Ground truth: the exact lines and glyph heights Tesseract reported for a real
 * phone screenshot of a Google Pay receipt, captured with
 * `scripts/ocr-lines.mjs`.
 *
 * The artefact that shapes this parser is at the top. The rupee glyph did not
 * survive as a character: it came back as a lone "2," on a line of its own,
 * 81px tall, sitting above the 72px total. Ranking lines against each other
 * therefore picks that fragment as the headline and the amount is lost, which is
 * why the body size is the reference instead.
 *
 * Also note "HDFC" read as "Hore", the tick before "Completed" read as "©", and
 * the disclaimer wrapped across two lines so that "account" once looked like a
 * field heading.
 */
const REAL_SCREENSHOT_OCR: Array<[string, number]> = [
  ['2,', 81],
  ['From Lokesh Arun', 18],
  ['+91 eevee «5131', 15],
  ['1,500', 72],
  ['property pin', 21],
  ['© Completed', 21],
  ['22 Aug 2025, 11:20am', 18],
  ['£1) Hore Bank 7625', 18],
  ['UPI transaction ID', 16],
  ['523467729727', 17],
  ['To: VETRISURIYA R', 16],
  ['Google Pay + ++++ar-1@okhdfcbank', 20],
  ['From: LOKESH S (ICICI Bank)', 17],
  ['Google Pay + **++ns-3@okicici', 20],
  ['Google transaction ID', 17],
  ['CICAgKibp-uiHA', 21],
  ['Payments may take up to 3 working days to', 14],
  ['be reflected in your account', 14],
  ['PowErED BY', 6],
  ['Liz', 27],
  ['G Pay', 32],
];

function ocrWithHeights(entries: Array<[string, number]>): OcrResult {
  const lines: OcrLine[] = entries.map(([text, height], index) => ({
    text,
    confidence: 79,
    bbox: { x0: 20, y0: index * 60, x1: 400, y1: index * 60 + height },
    words: [],
  }));

  return {
    text: lines.map((line) => line.text).join('\n'),
    lines,
    confidence: 79,
    psm: '11',
  };
}

/** Transcribed from a real PhonePe transaction receipt. */
const PHONEPE = `Transaction details
Paid successfully
To
SUNITA DEVI
sunita@ybl
!₹500.00
Paid from
ICICI Bank •••• 8765
Transaction ID
412345678901
05 Sep 2026, 09:07 am
PhonePe`;

describe('detectProvider', () => {
  it('recognises Google Pay and PhonePe receipts', () => {
    expect(detectProvider(ocr(GPAY).text)).toBe('gpay');
    expect(detectProvider(ocr(PHONEPE).text)).toBe('phonepe');
  });

  it('falls back to generic for unknown layouts', () => {
    expect(detectProvider('Amount 100 ref 123456789012')).toBe('generic');
  });
});

describe('extractTransaction', () => {
  it('reads every field off a real Google Pay receipt', () => {
    const row = extractTransaction(ocr(GPAY), 'gpay-1.png', 'id-1');

    expect(row.provider).toBe('gpay');
    expect(row.values.status).toBe('Completed');
    expect(row.values.amount).toBe('1500');
    expect(row.values.payee).toBe('VETRISURIYA R');
    expect(row.values.payeeUpiId).toBe('ar-1@okhdfcbank');
    expect(row.values.payerUpiId).toBe('ns-3@okicici');
    expect(row.values.payerName).toBe('Lokesh Arun');
    expect(row.values.payerBank).toBe('HDFC Bank 7625');
    expect(row.values.upiRefNo).toBe('523467729727');
    expect(row.values.transactionId).toBe('CICAgKibp-uiHA');
    expect(row.values.date).toBe('2025-08-22');
    expect(row.values.time).toBe('11:20');
    expect(row.error).toBeUndefined();
  });

  it('keeps the UPI reference and the Google transaction ID apart', () => {
    const row = extractTransaction(ocr(GPAY), 'g.png', 'id');
    expect(row.values.upiRefNo).toBe('523467729727');
    expect(row.values.transactionId).toBe('CICAgKibp-uiHA');
    expect(row.values.transactionId).not.toBe(row.values.upiRefNo);
  });

  it('still finds the amount when the rupee sign is misread', () => {
    expect(extractTransaction(ocr(GPAY_NO_RUPEE), 'g.png', 'id').values.amount).toBe('1500');
  });

  it('does not mistake a 12-digit reference for the headline amount', () => {
    // Same receipt with the headline amount removed: the only large number left
    // is in body text, so nothing should be reported.
    const withoutAmount = GPAY.replace('!₹1,500\n', '');
    expect(extractTransaction(ocr(withoutAmount), 'g.png', 'id').values.amount).toBeUndefined();
  });

  it('reads a real PhonePe receipt', () => {
    const row = extractTransaction(ocr(PHONEPE), 'pp-1.png', 'id-2');

    expect(row.provider).toBe('phonepe');
    expect(row.values.status).toBe('Completed');
    expect(row.values.amount).toBe('500');
    expect(row.values.payee).toBe('SUNITA DEVI');
    expect(row.values.payeeUpiId).toBe('sunita@ybl');
    expect(row.values.transactionId).toBe('412345678901');
    expect(row.values.date).toBe('2026-09-05');
    expect(row.values.time).toBe('09:07');
  });

  it('keeps amount and date separate from the paid-to name', () => {
    const inline = `Paid to RAVI KUMAR
Amount ₹999
UPI Ref No 521123456789
Date & time 05-01-2026 09:07 AM
Google Pay`;

    const row = extractTransaction(ocr(inline), 'inline.png', 'id');

    expect(row.values.payee).toBe('RAVI KUMAR');
    expect(row.values.amount).toBe('999');
    expect(row.values.upiRefNo).toBe('521123456789');
    expect(row.values.date).toBe('2026-01-05');
    expect(row.values.time).toBe('09:07');
  });

  it('files an inline UPI handle under the payee handle column', () => {
    const inline = `Paid to ravi@ybl
!₹250
Google Pay`;

    const row = extractTransaction(ocr(inline), 'inline.png', 'id');
    expect(row.values.payeeUpiId).toBe('ravi@ybl');
    expect(row.values.amount).toBe('250');
  });

  it('recovers an amount when OCR drops the currency symbol entirely', () => {
    const text = `Paid to
RAVI KUMAR
1250.50
UPI Ref No
521123456789
Google Pay`;

    expect(extractTransaction(ocr(text), 'a.png', 'id').values.amount).toBe('1250.5');
  });

  it('keeps a time that OCR split onto its own line', () => {
    const text = `Paid to RAVI KUMAR
Amount 750
Date & time
12 Aug 2026
03:45 PM
UPI Ref No 521123456789
Google Pay`;

    const row = extractTransaction(ocr(text), 'split.png', 'id');
    expect(row.values.date).toBe('2026-08-12');
    expect(row.values.time).toBe('15:45');
  });

  it('finds a heading that OCR glued onto the previous line', () => {
    const glued = `Transaction successful Paid to
RAVI KUMAR
UPI Ref No 521123456789
Google Pay`;

    const row = extractTransaction(ocr(glued), 'glued.png', 'id');
    expect(row.values.payee).toBe('RAVI KUMAR');
    expect(row.values.upiRefNo).toBe('521123456789');
  });

  it('reports a failure when nothing readable was found', () => {
    const row = extractTransaction(ocr('~~~~  ???  ~~~~'), 'blank.png', 'id');
    expect(row.error).toBeTruthy();
  });

  it('keeps the raw OCR text for diagnostics', () => {
    const row = extractTransaction(ocr(GPAY), 'g.png', 'id');
    expect(row.rawText).toContain('VETRISURIYA R');
    expect(row.psm).toBe('11');
  });
});

describe('real phone screenshot', () => {
  const result = () => ocrWithHeights(REAL_SCREENSHOT_OCR);

  it('reads the total even though the rupee glyph became a taller junk line', () => {
    // The "2," fragment is 81px and the total is 72px. Only measuring against
    // body text keeps the 72px total in play.
    expect(extractTransaction(result(), 'real.jpeg', 'id').values.amount).toBe('1500');
  });

  it('extracts every field a payment auditor needs', () => {
    const row = extractTransaction(result(), 'real.jpeg', 'id');

    expect(row.provider).toBe('gpay');
    expect(row.values.amount).toBe('1500');
    expect(row.values.status).toBe('Completed');
    expect(row.values.payerName).toBe('Lokesh Arun');
    expect(row.values.payee).toBe('VETRISURIYA R');
    expect(row.values.payeeUpiId).toBe('ar-1@okhdfcbank');
    expect(row.values.payerUpiId).toBe('ns-3@okicici');
    expect(row.values.upiRefNo).toBe('523467729727');
    expect(row.values.transactionId).toBe('CICAgKibp-uiHA');
    expect(row.values.date).toBe('2025-08-22');
    expect(row.values.time).toBe('11:20');
    expect(row.error).toBeUndefined();
  });

  it('still names the debit bank when OCR mangles the vendor', () => {
    // "HDFC" was read as "Hore", so a fixed vendor list alone would find nothing.
    expect(extractTransaction(result(), 'real.jpeg', 'id').values.payerBank).toBe('Hore Bank 7625');
  });

  it('does not mistake a bracketed bank for the debit account', () => {
    // The card heading is where the money came from; "(ICICI Bank)" inside the
    // recipient block belongs to the other party.
    expect(extractTransaction(result(), 'real.jpeg', 'id').values.payerBank).not.toBe('ICICI Bank');
  });

  it('reads a bank whose name OCR fused with the word Bank', () => {
    const entries: Array<[string, number]> = [
      ['From Santhosh Kumar', 18],
      ['600', 72],
      ['[500. -orcBank 762s', 18],
      ['To: VETRISURIYA R', 17],
      ['12 Mar 2022, 12:29pm', 20],
      ['UPI transaction ID', 16],
      ['207112544458', 17],
      ['G Pay', 32],
    ];

    expect(extractTransaction(ocrWithHeights(entries), 'real3.jpeg', 'id').values.payerBank).toBe(
      'orcBank 762s',
    );
  });

  it('ignores the wrapped disclaimer when deriving columns', () => {
    const columns = deriveColumns(result());

    expect(columns).not.toContain('payerAccount');
    expect(columns).toEqual(
      expect.arrayContaining(['amount', 'payee', 'payerName', 'date', 'status', 'provider']),
    );
  });

  it('trusts the isolated re-read when the currency glyph was glued to the total', () => {
    // This receipt came back as "32,000" for an amount of 2,000: the rupee sign
    // was read as a leading "3". Re-reading the headline on its own fixes it.
    const entries: Array<[string, number]> = [
      ['2,', 81],
      ['From Lokesh Arun', 18],
      ['32,000', 72],
      ['© Completed', 21],
      ['30 Sept 2025, 1:03pm', 20],
      ['5H) +orcBank 762s', 18],
      ['UPI transaction ID', 16],
      ['527392169502', 17],
      ['To: VETRISURIYAR', 17],
      ['Google Pay «+ ++++ar-1@okhdfcbank', 20],
      ['From: LOKESH S$ (ICICI Bank)', 20],
      ['Google Pay + +++ns-3@okicici', 20],
      ['Google transaction ID', 17],
      ['CICAOJEGNbKUQ', 21],
      ['Payments may take up to 3 working days to', 14],
      ['be reflected in your account', 14],
      ['G Pay', 32],
    ];

    const result = ocrWithHeights(entries);
    expect(extractTransaction(result, 'real2.jpeg', 'id').values.amount).toBe('32000');

    // With the engine's isolated re-read available, the real figure wins.
    result.headline = '2,000';
    expect(extractTransaction(result, 'real2.jpeg', 'id').values.amount).toBe('2000');
  });

  it('keeps the page figure when the re-read disagrees', () => {
    // The crop is an independent reading of the same pixels, so it may only trim
    // leading digits, never introduce a figure of its own.
    const result = ocr(GPAY);
    result.headline = '4,750';
    expect(extractTransaction(result, 'g.png', 'id').values.amount).toBe('1500');
  });

  it('ignores a digit picked up from surrounding text', () => {
    // "up to 3 working days" is a disclaimer, not a total. Letting the re-read
    // have the final say turned that 3 into the amount.
    const result = ocr(GPAY);
    result.headline = 'Payments may take upto 3 working days';
    expect(extractTransaction(result, 'g.png', 'id').values.amount).toBe('1500');
  });

  it('finds a total set only slightly larger than the body text', () => {
    // Fonts OCR measures tightly put the total near the size threshold rather
    // than clear of it. This total used to be dropped, leaving the cell empty.
    const entries: Array<[string, number]> = [
      ['From Santhosh Kumar', 20],
      ['+91 s+ +0583', 20],
      ['600', 30],
      ['@ Completed', 20],
      ['12 Mar 2022, 12:29 pm', 20],
      ['HDFC Bank 7625', 20],
      ['UPI transaction ID', 20],
      ['207112544458', 20],
      ['To: VETRISURIYA R', 20],
      ['Google Pay - =-ar-1@okhdfcbank', 20],
      ['G Pay', 30],
    ];

    expect(extractTransaction(ocrWithHeights(entries), 'g.png', 'id').values.amount).toBe('600');
  });

  it('recovers a total that OCR split into spaced single digits', () => {
    // A real receipt came back as "2 9 0 0 0", one digit per token, so the
    // largest-token rule could only keep a single digit. Re-reading the total's
    // own crop puts it back together.
    const entries: Array<[string, number]> = [
      ['2,', 81],
      ['From Lokesh Arun', 18],
      ['2 9 0 0 0', 72],
      ['© Completed', 21],
      ['30 Sept 2025, 1:03pm', 20],
      ['5H) +orcBank 762s', 18],
      ['UPI transaction ID', 16],
      ['527392169502', 17],
      ['To: VETRISURIYA R', 17],
      ['G Pay', 32],
    ];

    const result = ocrWithHeights(entries);
    expect(extractTransaction(result, 'real2.jpeg', 'id').values.amount).toBe('9');

    result.headline = '2,000';
    expect(extractTransaction(result, 'real2.jpeg', 'id').values.amount).toBe('2000');
  });

  it('trims at most one stray digit, not a whole leading group', () => {
    // A currency sign is a single glyph, so at most one or two digits can be its
    // debris. Losing three means the re-read simply misread the figure.
    const entries: Array<[string, number]> = [
      ['32499', 72],
      ['From Lokesh Arun', 18],
      ['30 Sept 2025, 1:03pm', 20],
      ['To: VETRISURIYA R', 17],
      ['12 Mar 2022, 12:29pm', 20],
      ['G Pay', 32],
    ];

    const result = ocrWithHeights(entries);
    result.headline = '99';
    expect(extractTransaction(result, 'x.png', 'id').values.amount).toBe('32499');
  });
});

describe('real Google Pay OCR', () => {
  const result = () => ocrWithHeights(REAL_GPAY_OCR);

  it('reads the total, not the account digits or the year', () => {
    // "HDFC Bank 7625" and "22 Aug 2025" are both large enough to look like a
    // headline; only the total is set far larger than the rest.
    expect(extractTransaction(result(), 'gpay-1.png', 'id').values.amount).toBe('1500');
  });

  it('extracts every ledger field from a real receipt', () => {
    const row = extractTransaction(result(), 'gpay-1.png', 'id');

    expect(row.provider).toBe('gpay');
    expect(row.values.amount).toBe('1500');
    expect(row.values.status).toBe('Completed');
    expect(row.values.payerName).toBe('Lokesh Arun');
    expect(row.values.payerBank).toBe('HDFC Bank 7625');
    expect(row.values.payee).toBe('VETRISURIYA R');
    expect(row.values.payeeUpiId).toBe('ar-1@okhdfcbank');
    expect(row.values.payerUpiId).toBe('ns-3@okicici');
    expect(row.values.upiRefNo).toBe('523467729727');
    expect(row.values.transactionId).toBe('CICAgKibp-uiHA');
    expect(row.values.date).toBe('2025-08-22');
    expect(row.values.time).toBe('11:20');
    expect(row.error).toBeUndefined();
  });

  it('does not invent an Account column from the settlement disclaimer', () => {
    const row = extractTransaction(result(), 'gpay-1.png', 'id');
    expect(row.values.payerAccount).toBeUndefined();
    expect(deriveColumns(result())).not.toContain('payerAccount');
  });

  it('derives a usable ledger schema from a real receipt', () => {
    const columns = deriveColumns(result());

    expect(columns[0]).toBe('amount');
    expect(columns).toEqual(
      expect.arrayContaining([
        'payerName',
        'payerBank',
        'payee',
        'payeeUpiId',
        'payerUpiId',
        'upiRefNo',
        'transactionId',
        'date',
        'status',
        'provider',
      ]),
    );
  });
});

describe('deriveColumns', () => {
  it('derives a full ledger schema from a real Google Pay receipt', () => {
    const columns = deriveColumns(ocr(GPAY));

    expect(columns[0]).toBe('amount');
    expect(columns).toEqual(
      expect.arrayContaining([
        'payee',
        'payeeUpiId',
        'payerName',
        'payerBank',
        'upiRefNo',
        'transactionId',
        'date',
        'status',
      ]),
    );
    // Reading order is preserved from the screenshot: the UPI reference sits
    // above the recipient block, and the Google ID below it.
    expect(columns.indexOf('upiRefNo')).toBeLessThan(columns.indexOf('payee'));
    expect(columns.indexOf('payee')).toBeLessThan(columns.indexOf('transactionId'));
  });

  it('adds an amount column even when the currency glyph was lost', () => {
    expect(deriveColumns(ocr(GPAY_NO_RUPEE))).toContain('amount');
  });

  it('falls back to defaults when no headings are recognised', () => {
    const columns = deriveColumns(ocr('just some random text with no labels'));
    expect(columns.length).toBeGreaterThan(3);
    expect(columns).toContain('amount');
  });
});
