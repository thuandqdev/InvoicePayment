import { BillingError } from '../src/errors';
import { createInvoice } from '../src/invoice';
import type { BillingDeps, Invoice, InvoiceItem, InvoiceItemInput, PaymentResult } from '../src/types';

export const FIXED_DATE = new Date('2026-01-15T00:00:00Z');

export function fixedDeps(): BillingDeps {
  let counter = 0;
  return { now: () => FIXED_DATE, generateId: () => `id-${++counter}` };
}

export function deepFreeze<T extends object>(value: T): T {
  for (const child of Object.values(value)) {
    if (typeof child === 'object' && child !== null) deepFreeze(child);
  }
  return Object.freeze(value);
}

export function thrown(fn: () => unknown): BillingError {
  try {
    fn();
  } catch (error) {
    if (error instanceof BillingError) return error;
    throw error;
  }
  throw new Error('expected the call to throw');
}

export function succeeded(result: PaymentResult) {
  if (!result.success) throw new Error(`payment failed with ${result.error.code}`);
  return result;
}

export function rawItem(quantity: number, unitPrice: number): InvoiceItem {
  return { id: 'raw', description: 'Raw', quantity, unitPrice, lineTotal: 0, taxRate: 0.08, taxAmount: 0 };
}

export function invoiceOf(items: InvoiceItemInput[]): Invoice {
  return createInvoice({ id: 'inv-1', invoiceNumber: 'INV-001', invoiceDate: new Date('2026-01-10T00:00:00Z'), items });
}

export function scenario1Invoice(): Invoice {
  return invoiceOf([
    { id: 'item-1', description: 'Monthly Fee', quantity: 1, unitPrice: 500 },
    { id: 'item-2', description: 'Activity Fee', quantity: 2, unitPrice: 25.5 },
  ]);
}

export function scenario2Invoice(): Invoice {
  return invoiceOf([
    { id: 'item-a', description: 'Item A', quantity: 1, unitPrice: 467.29 },
    { id: 'item-b', description: 'Item B', quantity: 1, unitPrice: 467.29 },
  ]);
}
