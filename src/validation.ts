import { BillingError } from './errors';
import type { BillingErrorCode } from './errors';
import {
  assertFiniteAmount,
  fromCents,
  hasCentPrecision,
  MAX_AMOUNT,
  MAX_CENTS,
  priceItems,
  priceLine,
  rateToBasisPoints,
  toCents,
} from './money';
import type { Invoice, InvoiceItem, InvoiceStatus, Payment, PaymentFailureCode, PaymentMethod } from './types';

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['cash', 'bank_transfer'];

export function deriveInvoiceStatus(totalCents: number, outstandingCents: number): InvoiceStatus {
  // a zero-total invoice has outstanding 0 and must read paid, not unpaid
  if (outstandingCents < 0) return 'overpaid';
  if (outstandingCents === 0) return 'paid';
  if (outstandingCents === totalCents) return 'unpaid';
  return 'partially_paid';
}

function assertNonEmpty(value: string, field: string, code: BillingErrorCode): void {
  if (typeof value !== 'string' || value === '') {
    throw new BillingError(code, `${field} must be a non-empty string`, { field });
  }
}

function assertValidDate(date: Date, field: string): void {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new BillingError('INVALID_DATE', `${field} must be a valid Date`, { field });
  }
}

function assertItemField(item: InvoiceItem, field: 'lineTotal' | 'taxAmount', expected: number): void {
  const actual = item[field];
  if (actual !== expected) {
    throw new BillingError('INCONSISTENT_ITEM', `item ${item.id} ${field} is ${actual}, expected ${expected}`, {
      itemId: item.id,
      field,
      expected,
      actual,
    });
  }
}

function assertInvoiceField(invoice: Invoice, field: 'totalTax' | 'totalAmount' | 'status', expected: number | string): void {
  const actual = invoice[field];
  if (actual !== expected) {
    throw new BillingError('INCONSISTENT_INVOICE', `invoice ${invoice.id} ${field} is ${actual}, expected ${expected}`, {
      invoiceId: invoice.id,
      field,
      expected,
      actual,
    });
  }
}

// Throws BillingError unless every stored figure matches a recomputation. Returns the totals in cents.
export function assertValidInvoice(invoice: Invoice): { totalCents: number; outstandingCents: number } {
  assertNonEmpty(invoice.id, 'invoice.id', 'INVALID_INVOICE');
  assertNonEmpty(invoice.invoiceNumber, 'invoice.invoiceNumber', 'INVALID_INVOICE');
  assertValidDate(invoice.invoiceDate, 'invoice.invoiceDate');

  const [first] = invoice.items;
  if (!first) {
    throw new BillingError('EMPTY_INVOICE', `invoice ${invoice.id} has no items`, { invoiceId: invoice.id });
  }

  const seenIds = new Set<string>();
  for (const item of invoice.items) {
    assertNonEmpty(item.id, 'item.id', 'INVALID_ITEM');
    assertNonEmpty(item.description, `item ${item.id} description`, 'INVALID_ITEM');
    if (seenIds.has(item.id)) {
      throw new BillingError('DUPLICATE_ITEM_ID', `item id ${item.id} appears more than once`, { itemId: item.id });
    }
    seenIds.add(item.id);
    if (item.taxRate !== first.taxRate) {
      throw new BillingError('INCONSISTENT_INVOICE', `item ${item.id} taxRate is ${item.taxRate}, other items use ${first.taxRate}`, {
        itemId: item.id,
      });
    }
  }

  const basisPoints = rateToBasisPoints(first.taxRate);
  for (const item of invoice.items) {
    const { lineCents, taxCents } = priceLine(item, basisPoints);
    assertItemField(item, 'lineTotal', fromCents(lineCents));
    assertItemField(item, 'taxAmount', fromCents(taxCents));
  }

  const totals = priceItems(invoice.items, basisPoints);
  assertInvoiceField(invoice, 'totalTax', fromCents(totals.totalTax));
  assertInvoiceField(invoice, 'totalAmount', fromCents(totals.totalAmount));

  const outstandingCents = toCents(invoice.outstandingAmount, 'outstandingAmount');
  if (outstandingCents > totals.totalAmount || outstandingCents < -MAX_CENTS) {
    throw new BillingError(
      'INCONSISTENT_INVOICE',
      `invoice ${invoice.id} outstandingAmount ${invoice.outstandingAmount} is outside -${MAX_AMOUNT}..${invoice.totalAmount}`,
      { invoiceId: invoice.id, field: 'outstandingAmount', actual: invoice.outstandingAmount },
    );
  }
  assertInvoiceField(invoice, 'status', deriveInvoiceStatus(totals.totalAmount, outstandingCents));

  return { totalCents: totals.totalAmount, outstandingCents };
}

export function amountProblem(amount: number): { code: PaymentFailureCode; message: string } | null {
  if (amount <= 0) {
    return { code: 'NON_POSITIVE_PAYMENT', message: `paymentAmount must be greater than 0, got ${amount}` };
  }
  if (!hasCentPrecision(amount)) {
    return { code: 'INVALID_PRECISION', message: `paymentAmount must have at most 2 decimal places, got ${amount}` };
  }
  if (amount > MAX_AMOUNT) {
    return { code: 'AMOUNT_OUT_OF_RANGE', message: `paymentAmount must be at most ${MAX_AMOUNT}, got ${amount}` };
  }
  return null;
}

export function assertPaymentShape(payment: Payment): void {
  assertNonEmpty(payment.id, 'payment.id', 'INVALID_PAYMENT');
  assertNonEmpty(payment.invoiceId, 'payment.invoiceId', 'INVALID_PAYMENT');
  assertNonEmpty(payment.referenceNumber, 'payment.referenceNumber', 'INVALID_PAYMENT');
  if (!PAYMENT_METHODS.includes(payment.paymentMethod)) {
    throw new BillingError('UNSUPPORTED_PAYMENT_METHOD', `unsupported payment method ${String(payment.paymentMethod)}`, {
      paymentMethod: payment.paymentMethod,
    });
  }
  assertValidDate(payment.paymentDate, 'payment.paymentDate');
  assertFiniteAmount(payment.amount, 'payment.amount');
  if (payment.status !== 'completed' && payment.status !== 'failed') {
    throw new BillingError('INVALID_PAYMENT', `payment.status must be completed or failed, got ${String(payment.status)}`, {
      status: payment.status,
    });
  }
}

export function assertCompletedAmount(amount: number): void {
  const problem = amountProblem(amount);
  if (problem) throw new BillingError(problem.code, problem.message, { amount });
}
