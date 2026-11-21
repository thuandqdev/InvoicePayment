import { describe, expect, it } from 'vitest';
import { fromCents, rateToBasisPoints, taxOf, toCents } from '../src/money';
import { thrown } from './fixtures';

describe('toCents', () => {
  it.each([
    [19.99, 1999],
    [0.29, 29],
    [25.5, 2550],
    [0, 0],
    [123456789.01, 12345678901],
  ])('converts %s to %s cents', (value, cents) => {
    expect(toCents(value, 'amount')).toBe(cents);
  });

  it('turns negative zero into zero', () => {
    expect(toCents(-0, 'amount')).toBe(0);
  });

  it('rejects more than 2 decimals', () => {
    expect(thrown(() => toCents(1.005, 'amount')).code).toBe('INVALID_PRECISION');
    expect(thrown(() => toCents(0.1 + 0.2, 'amount')).code).toBe('INVALID_PRECISION');
  });

  it('rejects NaN and infinities', () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(thrown(() => toCents(value, 'amount')).code).toBe('INVALID_AMOUNT');
    }
  });

  it('names the field and value in the message', () => {
    expect(thrown(() => toCents(1.005, 'unitPrice')).message).toBe('unitPrice must have at most 2 decimal places, got 1.005');
  });
});

describe('fromCents', () => {
  it('gives the exact decimal double', () => {
    expect(fromCents(58957)).toBe(589.57);
    expect(fromCents(30)).toBe(0.3);
  });
});

describe('rateToBasisPoints', () => {
  it('converts 7 percent to 700', () => {
    expect(rateToBasisPoints(0.07)).toBe(700);
  });

  it.each([-0.01, 1.5, NaN, 0.07001])('rejects %s', (rate) => {
    expect(thrown(() => rateToBasisPoints(rate)).code).toBe('INVALID_TAX_RATE');
  });
});

describe('taxOf', () => {
  it.each([
    [150, 11],
    [11850, 830],
    [1005, 70],
    [0, 0],
  ])('rounds tax on %s cents half-up to %s', (lineCents, tax) => {
    expect(taxOf(lineCents, 700)).toBe(tax);
  });
});
