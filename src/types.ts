export interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  items: InvoiceItem[];
  totalAmount: number;
  totalTax: number;
  outstandingAmount: number;
  status: InvoiceStatus;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  taxRate: number;
  taxAmount: number;
}

export interface Payment {
  id: string;
  invoiceId: string;
  paymentMethod: PaymentMethod;
  amount: number;
  paymentDate: Date;
  referenceNumber: string;
  status: PaymentStatus;
}

export interface Receipt {
  id: string;
  paymentId: string;
  receiptNumber: string;
  receiptDate: Date;
  totalPaid: number;
  remainingBalance: number;
  items: ReceiptItem[];
}

// Everything below is added here because the spec names these types without defining them.

export type InvoiceStatus = 'unpaid' | 'partially_paid' | 'paid' | 'overpaid';
export type PaymentMethod = 'cash' | 'bank_transfer';
export type PaymentStatus = 'completed' | 'failed';

export type PaymentFailureCode =
  | 'NON_POSITIVE_PAYMENT'
  | 'INVALID_PRECISION'
  | 'AMOUNT_OUT_OF_RANGE'
  | 'INVOICE_ALREADY_SETTLED';

export interface InvoiceTotals {
  subtotal: number;
  totalTax: number;
  totalAmount: number;
}

export interface ReceiptItem {
  invoiceItemId: string;
  description: string;
  itemTotal: number;
  amountApplied: number;
  itemBalance: number;
}

export type PaymentResult =
  | { success: true; payment: Payment; invoice: Invoice }
  | {
      success: false;
      payment: Payment;
      invoice: Invoice;
      error: { code: PaymentFailureCode; message: string };
    };

export interface InvoiceItemInput {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface InvoiceInput {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  items: InvoiceItemInput[];
}

export interface BillingDeps {
  now: () => Date;
  generateId: () => string;
}
