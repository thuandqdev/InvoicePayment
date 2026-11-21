import type { PaymentFailureCode } from './types';

export type BillingErrorCode =
  | PaymentFailureCode
  | 'INVALID_AMOUNT'
  | 'NEGATIVE_AMOUNT'
  | 'INVALID_QUANTITY'
  | 'INVALID_TAX_RATE'
  | 'INVALID_DATE'
  | 'INVALID_INVOICE'
  | 'INVALID_ITEM'
  | 'INVALID_PAYMENT'
  | 'EMPTY_INVOICE'
  | 'DUPLICATE_ITEM_ID'
  | 'INCONSISTENT_ITEM'
  | 'INCONSISTENT_INVOICE'
  | 'UNSUPPORTED_PAYMENT_METHOD'
  | 'INVOICE_MISMATCH'
  | 'PAYMENT_NOT_COMPLETED'
  | 'PAYMENT_NOT_APPLICABLE';

export class BillingError extends Error {
  constructor(
    readonly code: BillingErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'BillingError';
  }
}
