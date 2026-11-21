import { fromCents, GST_RATE, priceItems, priceLine, rateToBasisPoints } from './money';
import { assertValidInvoice } from './validation';
import type { Invoice, InvoiceInput, InvoiceItem, InvoiceItemInput, InvoiceTotals } from './types';

// Reads only quantity, unitPrice and taxRate. Derived item fields are ignored and items are not mutated
export function calculateInvoiceTotal(items: InvoiceItem[], taxRate: number): InvoiceTotals {
  const { subtotal, totalTax, totalAmount } = priceItems(items, rateToBasisPoints(taxRate));
  return { subtotal: fromCents(subtotal), totalTax: fromCents(totalTax), totalAmount: fromCents(totalAmount) };
}

export function createInvoiceItem(input: InvoiceItemInput): InvoiceItem {
  const { lineCents, taxCents } = priceLine(input, rateToBasisPoints(GST_RATE));
  return {
    id: input.id,
    description: input.description,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    lineTotal: fromCents(lineCents),
    taxRate: GST_RATE,
    taxAmount: fromCents(taxCents),
  };
}

// Builds an unpaid invoice (or paid, if the total is 0) and validates it before returning
export function createInvoice(input: InvoiceInput): Invoice {
  const items = input.items.map(createInvoiceItem);
  const { totalTax, totalAmount } = calculateInvoiceTotal(items, GST_RATE);
  const invoice: Invoice = {
    id: input.id,
    invoiceNumber: input.invoiceNumber,
    invoiceDate: input.invoiceDate,
    items,
    totalAmount,
    totalTax,
    outstandingAmount: totalAmount,
    status: totalAmount === 0 ? 'paid' : 'unpaid',
  };
  assertValidInvoice(invoice);
  return invoice;
}
