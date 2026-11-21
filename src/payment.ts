import { BillingError } from './errors';
import { assertFiniteAmount, fromCents, toCents } from './money';
import { amountProblem, assertValidInvoice, deriveInvoiceStatus, PAYMENT_METHODS } from './validation';
import type { BillingDeps, Invoice, Payment, PaymentMethod, PaymentResult } from './types';

// Never mutates the invoice. Rule violations return a failed result. A malformed invoice, amount type or method throws.
export function createProcessPayment({ now, generateId }: BillingDeps) {
  return function processPayment(invoice: Invoice, paymentAmount: number, paymentMethod: PaymentMethod): PaymentResult {
    const { totalCents, outstandingCents } = assertValidInvoice(invoice);
    assertFiniteAmount(paymentAmount, 'paymentAmount');
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      throw new BillingError('UNSUPPORTED_PAYMENT_METHOD', `unsupported payment method ${String(paymentMethod)}`, { paymentMethod });
    }

    let error = amountProblem(paymentAmount);
    // a settled invoice has nothing left to apply to and a repeat is the likely cause, but a payment that crosses zero is still accepted
    if (!error && outstandingCents <= 0) {
      error = {
        code: 'INVOICE_ALREADY_SETTLED',
        message: `invoice ${invoice.id} has no balance due, outstanding is ${invoice.outstandingAmount}`,
      };
    }

    const id = generateId();
    const payment: Payment = {
      id,
      invoiceId: invoice.id,
      paymentMethod,
      amount: paymentAmount,
      paymentDate: now(),
      referenceNumber: `PAY-${id}`,
      status: error ? 'failed' : 'completed',
    };
    if (error) return { success: false, payment, invoice, error };

    const after = outstandingCents - toCents(paymentAmount, 'paymentAmount');
    return {
      success: true,
      payment,
      invoice: {
        ...invoice,
        items: invoice.items.map((item) => ({ ...item })),
        outstandingAmount: fromCents(after),
        status: deriveInvoiceStatus(totalCents, after),
      },
    };
  };
}
