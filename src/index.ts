import { createProcessPayment } from './payment';
import { createGenerateReceipt } from './receipt';
import type { BillingDeps } from './types';

// ids and the clock are injected so tests stay deterministic, while the exports below use real ones
export function createBilling(deps: BillingDeps) {
  return { processPayment: createProcessPayment(deps), generateReceipt: createGenerateReceipt(deps) };
}

const billing = createBilling({ now: () => new Date(), generateId: () => crypto.randomUUID() });

export const processPayment = billing.processPayment;
export const generateReceipt = billing.generateReceipt;

export { calculateInvoiceTotal, createInvoice, createInvoiceItem } from './invoice';
export { getUnappliedAmount } from './receipt';
export { BillingError } from './errors';
export type { BillingErrorCode } from './errors';
export { GST_RATE, MAX_AMOUNT } from './money';
export type * from './types';
