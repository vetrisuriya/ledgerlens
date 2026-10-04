export type FieldKey =
  | 'provider'
  | 'status'
  | 'amount'
  | 'payee'
  | 'payeeUpiId'
  | 'payerName'
  | 'payerBank'
  | 'payerUpiId'
  | 'payerAccount'
  | 'transactionId'
  | 'upiRefNo'
  | 'date'
  | 'time'
  | 'method'
  | 'note'
  | 'orderId';

export interface FieldDef {
  key: FieldKey;
  label: string;
  /** Lower-case phrases that identify this field in a receipt screenshot. */
  aliases: string[];
  /** Aliases that are too generic and only count when nothing stronger matched. */
  weak?: boolean;
}

export const FIELDS: FieldDef[] = [
  {
    key: 'provider',
    label: 'Provider',
    aliases: ['google pay', 'gpay', 'phonepe', 'phone pe', 'paytm', 'amazon pay', 'bhim'],
  },
  {
    key: 'status',
    label: 'Status',
    aliases: ['status', 'completed', 'successful', 'success', 'paid', 'failed', 'pending', 'declined'],
  },
  {
    key: 'amount',
    label: 'Amount',
    aliases: ['amount', 'amount paid', 'total amount', 'transaction amount', 'amt'],
  },
  {
    key: 'payee',
    label: 'Paid To',
    aliases: ['paid to', 'paidto', 'to', 'recipient', 'payee', 'beneficiary', 'sent to'],
  },
  {
    key: 'payeeUpiId',
    label: 'Payee UPI ID',
    aliases: ['upi id', 'upihandle', 'upi handle', 'to upi', 'vpa', 'payee upi'],
  },
  {
    key: 'payerName',
    label: 'Payer Name',
    aliases: ['from', 'paid from', 'payer', 'sender', 'debited from', 'paid by', 'sender name'],
  },
  {
    key: 'payerBank',
    label: 'Payer Bank',
    aliases: ['bank', 'via bank', 'paid via', 'source bank', 'from bank', 'bank name'],
  },
  {
    key: 'payerUpiId',
    label: 'Payer UPI ID',
    aliases: ['from upi', 'payer upi', 'your upi', 'sender upi', 'vpa'],
  },
  {
    key: 'payerAccount',
    label: 'Account',
    aliases: ['account no', 'account number', 'a/c', 'account', 'ac no', 'acct'],
  },
  {
    key: 'transactionId',
    label: 'Transaction ID',
    aliases: [
      'google transaction id',
      'transaction id',
      'transactionid',
      'txn id',
      'txnid',
      'transaction reference',
      'ref no',
      'reference no',
      'reference number',
      'order id',
      'orderid',
      'utr',
      'utr no',
      'utr number',
    ],
  },
  {
    key: 'upiRefNo',
    label: 'UPI Ref No',
    aliases: [
      'upi transaction id',
      'upi transaction no',
      'upi ref',
      'upi ref no',
      'upi reference',
      'upi reference number',
      'upi rrn',
      'rrn',
    ],
  },
  {
    key: 'date',
    label: 'Date',
    aliases: ['date', 'date and time', 'date & time', 'transaction date'],
  },
  {
    key: 'time',
    label: 'Time',
    aliases: ['time', 'timestamp', 'transaction time'],
  },
  {
    key: 'method',
    label: 'Method',
    aliases: ['method', 'payment method', 'paid via', 'mode of payment', 'instrument'],
  },
  {
    key: 'note',
    label: 'Note',
    aliases: ['note', 'notes', 'add a note', 'message', 'remarks', 'comment'],
  },
];

export const FIELD_BY_KEY: Record<FieldKey, FieldDef> = FIELDS.reduce(
  (acc, f) => {
    acc[f.key] = f;
    return acc;
  },
  {} as Record<FieldKey, FieldDef>,
);

/** Column order used when the reference image yields no usable labels. */
export const DEFAULT_COLUMNS: FieldKey[] = [
  'provider',
  'status',
  'amount',
  'payee',
  'payeeUpiId',
  'payerName',
  'payerBank',
  'payerUpiId',
  'transactionId',
  'upiRefNo',
  'date',
  'time',
  'note',
];

export interface TransactionRow {
  /** Stable id for React keys and duplicate detection. */
  id: string;
  /** Original filename, for traceability back to the auditor's source image. */
  sourceFile: string;
  provider: ProviderId;
  values: Partial<Record<FieldKey, string>>;
  /** Populated when extraction produced nothing usable. */
  error?: string;
  confidence?: number;
  /** What OCR actually read, kept so a bad row can be diagnosed. */
  rawText?: string;
  /** Page segmentation mode that produced rawText. */
  psm?: string;
}

export type ProviderId = 'gpay' | 'phonepe' | 'generic';

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  gpay: 'Google Pay',
  phonepe: 'PhonePe',
  generic: 'Unknown',
};

export type JobStatus = 'queued' | 'processing' | 'done' | 'error';

export interface QueueItem {
  id: string;
  /** Nulled once processed so the decoded image is eligible for collection. */
  file: File | null;
  name: string;
  status: JobStatus;
  progress: number;
  error?: string;
}
