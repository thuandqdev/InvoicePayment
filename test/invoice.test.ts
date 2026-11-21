import { describe, expect, it } from 'vitest';
import { calculateInvoiceTotal, createInvoice, createInvoiceItem } from '../src/invoice';
import { invoiceOf, rawItem, scenario1Invoice, thrown } from './fixtures';

describe('calculateInvoiceTotal', () => {
  it('computes scenario 1', () => {
    const items = [rawItem(1, 500), rawItem(2, 25.5)];
    expect(calculateInvoiceTotal(items, 0.07)).toEqual({ subtotal: 551, totalTax: 38.57, totalAmount: 589.57 });
  });

  it('ignores derived fields and item taxRate', () => {
    const items = [rawItem(1, 500), rawItem(2, 25.5)];
    expect(calculateInvoiceTotal(items, 0.07).totalAmount).toBe(589.57);
    expect(items[0]).toEqual({ id: 'raw', description: 'Raw', quantity: 1, unitPrice: 500, lineTotal: 0, taxRate: 0.08, taxAmount: 0 });
  });

  it('rounds tax per line, not on the total', () => {
    expect(calculateInvoiceTotal([rawItem(1, 10.05), rawItem(1, 10.05), rawItem(1, 10.05)], 0.07)).toEqual({
      subtotal: 30.15,
      totalTax: 2.1,
      totalAmount: 32.25,
    });
  });

  it('rounds half-up at the cent boundary', () => {
    expect(calculateInvoiceTotal([rawItem(1, 1.5)], 0.07).totalTax).toBe(0.11);
  });

  it('does not lose the cent that toFixed drops', () => {
    expect(calculateInvoiceTotal([rawItem(1, 118.5)], 0.07).totalTax).toBe(8.3);
  });

  it('adds 0.10 three times without float drift', () => {
    expect(calculateInvoiceTotal([rawItem(1, 0.1), rawItem(1, 0.1), rawItem(1, 0.1)], 0.07)).toEqual({ subtotal: 0.3, totalTax: 0.03, totalAmount: 0.33 });
  });

  it('returns zeros for no items', () => {
    expect(calculateInvoiceTotal([], 0.07)).toEqual({ subtotal: 0, totalTax: 0, totalAmount: 0 });
  });

  it('stays exact on large amounts', () => {
    expect(calculateInvoiceTotal([rawItem(1, 123456789.01)], 0.07)).toEqual({
      subtotal: 123456789.01,
      totalTax: 8641975.23,
      totalAmount: 132098764.24,
    });
  });

  it('accepts a total of exactly 1,000,000,000.00 and rejects one cent more', () => {
    expect(calculateInvoiceTotal([rawItem(1, 934579439.25)], 0.07).totalAmount).toBe(1000000000);
    expect(thrown(() => calculateInvoiceTotal([rawItem(1, 934579439.26)], 0.07)).code).toBe('AMOUNT_OUT_OF_RANGE');
  });

  it('rejects an intermediate product beyond the cap', () => {
    expect(thrown(() => calculateInvoiceTotal([rawItem(1_000_000, 1_000_000_000)], 0.07)).code).toBe('AMOUNT_OUT_OF_RANGE');
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects quantity %s', (quantity) => {
    expect(thrown(() => calculateInvoiceTotal([rawItem(quantity, 10)], 0.07)).code).toBe('INVALID_QUANTITY');
  });

  it('rejects bad unit prices with distinct codes', () => {
    expect(thrown(() => calculateInvoiceTotal([rawItem(1, -1)], 0.07)).code).toBe('NEGATIVE_AMOUNT');
    expect(thrown(() => calculateInvoiceTotal([rawItem(1, 0.333)], 0.07)).code).toBe('INVALID_PRECISION');
    for (const price of [NaN, Infinity, -Infinity]) {
      expect(thrown(() => calculateInvoiceTotal([rawItem(1, price)], 0.07)).code).toBe('INVALID_AMOUNT');
    }
  });

  it.each([-0.01, 1.5, NaN, 0.07001])('rejects tax rate %s', (taxRate) => {
    expect(thrown(() => calculateInvoiceTotal([rawItem(1, 10)], taxRate)).code).toBe('INVALID_TAX_RATE');
  });
});

describe('createInvoiceItem', () => {
  it('keeps lineTotal before tax', () => {
    expect(createInvoiceItem({ id: 'x', description: 'Activity Fee', quantity: 2, unitPrice: 25.5 })).toEqual({
      id: 'x',
      description: 'Activity Fee',
      quantity: 2,
      unitPrice: 25.5,
      lineTotal: 51,
      taxRate: 0.07,
      taxAmount: 3.57,
    });
  });
});

describe('createInvoice', () => {
  it('builds an unpaid invoice from scenario 1', () => {
    const invoice = scenario1Invoice();
    expect(invoice.totalAmount).toBe(589.57);
    expect(invoice.totalTax).toBe(38.57);
    expect(invoice.outstandingAmount).toBe(589.57);
    expect(invoice.status).toBe('unpaid');
  });

  it('marks a zero-total invoice paid with nothing outstanding', () => {
    const invoice = invoiceOf([{ id: 'free', description: 'Free trial', quantity: 1, unitPrice: 0 }]);
    expect(invoice.totalAmount).toBe(0);
    expect(invoice.outstandingAmount).toBe(0);
    expect(invoice.status).toBe('paid');
  });

  it('rejects an invoice without items', () => {
    expect(thrown(() => invoiceOf([])).code).toBe('EMPTY_INVOICE');
  });

  it('rejects duplicate item ids', () => {
    const item = { id: 'same', description: 'Fee', quantity: 1, unitPrice: 10 };
    expect(thrown(() => invoiceOf([item, item])).code).toBe('DUPLICATE_ITEM_ID');
  });

  it('rejects an invalid invoice date', () => {
    const input = { id: 'inv-1', invoiceNumber: 'INV-001', invoiceDate: new Date('x'), items: [] };
    expect(thrown(() => createInvoice(input)).code).toBe('INVALID_DATE');
  });

  it('rejects an empty item id', () => {
    expect(thrown(() => invoiceOf([{ id: '', description: 'Fee', quantity: 1, unitPrice: 10 }])).code).toBe('INVALID_ITEM');
  });
});
