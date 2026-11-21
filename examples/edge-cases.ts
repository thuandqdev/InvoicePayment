import { BillingError, calculateInvoiceTotal, createInvoice, generateReceipt, processPayment } from '../src/index';
import type { Invoice, InvoiceItem } from '../src/index';

const date = new Date('2026-01-10T00:00:00Z');
const money = (value: number) => value.toFixed(2);

function attempt(label: string, run: () => string) {
  try {
    console.log(`${label}: ${run()}`);
  } catch (error) {
    if (!(error instanceof BillingError)) throw error;
    console.log(`${label}: threw ${error.code} (${error.message})`);
  }
}

function invoiceOf(unitPrice: number, quantity = 1): Invoice {
  return createInvoice({ id: 'inv', invoiceNumber: 'INV-E', invoiceDate: date, items: [{ id: 'item', description: 'Fee', quantity, unitPrice }] });
}

function line(quantity: number, unitPrice: number): InvoiceItem {
  return { id: 'x', description: 'Fee', quantity, unitPrice, lineTotal: 0, taxRate: 0.07, taxAmount: 0 };
}

function outcome(invoice: Invoice, amount: number) {
  const result = processPayment(invoice, amount, 'cash');
  return result.success ? `completed, outstanding ${money(result.invoice.outstandingAmount)}` : `failed ${result.error.code}`;
}

attempt('zero-total invoice', () => {
  const invoice = invoiceOf(0);
  return `status ${invoice.status}, paying 10 -> ${outcome(invoice, 10)}`;
});
attempt('empty invoice', () => String(createInvoice({ id: 'inv', invoiceNumber: 'INV-E', invoiceDate: date, items: [] })));
attempt('negative unit price', () => String(invoiceOf(-5)));
attempt('quantity 1.5', () => String(invoiceOf(10, 1.5)));
attempt('3 lines of 10.05', () => `tax ${money(calculateInvoiceTotal([line(1, 10.05), line(1, 10.05), line(1, 10.05)], 0.07).totalTax)}`);
attempt('118.50 line', () => `tax ${money(calculateInvoiceTotal([line(1, 118.5)], 0.07).totalTax)}`);
attempt('0.1 * 3 computed by the caller', () => String(invoiceOf(0.1 * 3)));
attempt('large invoice', () => `total ${money(invoiceOf(123456789.01).totalAmount)}`);
attempt('invoice at the cap', () => `total ${money(invoiceOf(934579439.25).totalAmount)}`);
attempt('invoice one cent over the cap', () => `total ${money(invoiceOf(934579439.26).totalAmount)}`);

attempt('payment of 0', () => outcome(invoiceOf(100), 0));
attempt('payment of -50', () => outcome(invoiceOf(100), -50));
attempt('payment of 10.005', () => outcome(invoiceOf(100), 10.005));
attempt('payment above the cap', () => outcome(invoiceOf(100), 1_000_000_000.01));
attempt('payment of NaN', () => outcome(invoiceOf(100), NaN));
attempt('overpayment', () => outcome(invoiceOf(100), 200));

attempt('payment into a settled invoice', () => {
  const first = processPayment(invoiceOf(100), 200, 'cash');
  return outcome(first.invoice, 10);
});

attempt('receipt with the pre-payment snapshot', () => {
  const before = invoiceOf(100);
  const result = processPayment(before, 50, 'cash');
  return String(generateReceipt(result.payment, before));
});
attempt('receipt for a failed payment', () => {
  const invoice = invoiceOf(100);
  const result = processPayment(invoice, -50, 'cash');
  return String(generateReceipt(result.payment, result.invoice));
});
