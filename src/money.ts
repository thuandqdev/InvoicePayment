import { BillingError } from './errors';

export const GST_RATE = 0.07;
export const MAX_AMOUNT = 1_000_000_000;
// integer cents keep sums exact, and at this cap every intermediate value stays below 2^53
export const MAX_CENTS = MAX_AMOUNT * 100;

export function fromCents(cents: number): number {
  return cents / 100;
}

export function assertFiniteAmount(value: number, field: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BillingError('INVALID_AMOUNT', `${field} must be a finite number, got ${String(value)}`, { field, value });
  }
}

export function hasCentPrecision(value: number): boolean {
  return Math.round(value * 100) / 100 === value;
}

export function toCents(value: number, field: string): number {
  assertFiniteAmount(value, field);
  if (!hasCentPrecision(value)) {
    throw new BillingError('INVALID_PRECISION', `${field} must have at most 2 decimal places, got ${value}`, { field, value });
  }
  const cents = Math.round(value * 100);
  return cents === 0 ? 0 : cents;
}

export function rateToBasisPoints(rate: number): number {
  const basisPoints = Math.round(rate * 10_000);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1 || basisPoints / 10_000 !== rate) {
    throw new BillingError('INVALID_TAX_RATE', `taxRate must be between 0 and 1 with at most 4 decimals, got ${rate}`, { rate });
  }
  return basisPoints;
}

// half-up on integers, because float rounding turns 118.50 * 0.07 = 8.295 into 8.29
export function taxOf(lineCents: number, basisPoints: number): number {
  const scaled = lineCents * basisPoints + 5_000;
  return (scaled - (scaled % 10_000)) / 10_000;
}

function assertWithinCap(cents: number, field: string): void {
  if (cents > MAX_CENTS) {
    throw new BillingError('AMOUNT_OUT_OF_RANGE', `${field} must be at most ${MAX_AMOUNT}, got ${fromCents(cents)}`, { field });
  }
}

export function priceLine(item: { quantity: number; unitPrice: number }, basisPoints: number) {
  const { quantity, unitPrice } = item;
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new BillingError('INVALID_QUANTITY', `quantity must be an integer of at least 1, got ${quantity}`, { quantity });
  }
  const unitCents = toCents(unitPrice, 'unitPrice');
  if (unitCents < 0) {
    throw new BillingError('NEGATIVE_AMOUNT', `unitPrice must not be negative, got ${unitPrice}`, { unitPrice });
  }
  const lineCents = quantity * unitCents;
  assertWithinCap(lineCents, 'lineTotal');
  return { lineCents, taxCents: taxOf(lineCents, basisPoints) };
}

export function priceItems(items: readonly { quantity: number; unitPrice: number }[], basisPoints: number) {
  let subtotal = 0;
  let totalTax = 0;
  for (const item of items) {
    // tax is rounded per line so the item taxAmount values add up to totalTax
    const { lineCents, taxCents } = priceLine(item, basisPoints);
    subtotal += lineCents;
    totalTax += taxCents;
    assertWithinCap(subtotal, 'subtotal');
    assertWithinCap(totalTax, 'totalTax');
  }
  const totalAmount = subtotal + totalTax;
  assertWithinCap(totalAmount, 'totalAmount');
  return { subtotal, totalTax, totalAmount };
}
