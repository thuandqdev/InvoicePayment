import { allocate } from './allocation';
import { BillingError } from './errors';
import { fromCents, toCents } from './money';
import { assertCompletedAmount, assertPaymentShape, assertValidInvoice } from './validation';
import type { BillingDeps, Invoice, Payment, Receipt } from './types';

// Expects the invoice returned by processPayment for this payment. The payment is not applied again.
export function createGenerateReceipt({ now, generateId }: BillingDeps) {
  return function generateReceipt(payment: Payment, invoice: Invoice): Receipt {
    const { totalCents, outstandingCents } = assertValidInvoice(invoice);
    assertPaymentShape(payment);
    if (payment.invoiceId !== invoice.id) {
      throw new BillingError('INVOICE_MISMATCH', `payment ${payment.id} belongs to invoice ${payment.invoiceId}, not ${invoice.id}`, {
        paymentId: payment.id,
        invoiceId: invoice.id,
      });
    }
    // failed records can carry a bad amount (0, -50, 10.005), so status is checked before the amount rules
    if (payment.status !== 'completed') {
      throw new BillingError('PAYMENT_NOT_COMPLETED', `payment ${payment.id} has status ${payment.status}`, { paymentId: payment.id });
    }
    assertCompletedAmount(payment.amount);

    const amountCents = toCents(payment.amount, 'payment.amount');
    const outstandingBeforeCents = outstandingCents + amountCents;
    if (outstandingBeforeCents <= 0 || outstandingBeforeCents > totalCents) {
      throw new BillingError(
        'PAYMENT_NOT_APPLICABLE',
        `invoice ${invoice.id} is not the snapshot taken right after payment ${payment.id}`,
        { paymentId: payment.id, invoiceId: invoice.id },
      );
    }

    const lines = invoice.items.map((item) => ({
      item,
      gross: toCents(item.lineTotal, 'lineTotal') + toCents(item.taxAmount, 'taxAmount'),
    }));
    const items = allocate(lines, totalCents - outstandingBeforeCents, amountCents)
      .filter((line) => line.applied > 0)
      .map((line) => ({
        invoiceItemId: line.item.id,
        description: line.item.description,
        itemTotal: fromCents(line.gross),
        amountApplied: fromCents(line.applied),
        itemBalance: fromCents(line.balance),
      }));

    const id = generateId();
    return {
      id,
      paymentId: payment.id,
      receiptNumber: `RCT-${id}`,
      receiptDate: now(),
      totalPaid: payment.amount,
      remainingBalance: invoice.outstandingAmount,
      items,
    };
  };
}

// Part of the receipt's payment that exceeded the invoice: max(0, -remainingBalance).
export function getUnappliedAmount(receipt: Receipt): number {
  return fromCents(Math.max(0, -toCents(receipt.remainingBalance, 'remainingBalance')));
}
