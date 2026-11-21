import { describe, expect, it } from 'vitest';
import { allocate } from '../src/allocation';

const grossLines = [{ gross: 53500 }, { gross: 5457 }];

function split(lines: { gross: number }[], paidBefore: number, amount: number) {
  return allocate(lines, paidBefore, amount).map(({ applied, balance }) => ({ applied, balance }));
}

describe('allocate', () => {
  it('fills the first item before the second', () => {
    expect(split(grossLines, 0, 30000)).toEqual([
      { applied: 30000, balance: 23500 },
      { applied: 0, balance: 5457 },
    ]);
  });

  it('continues where earlier payments stopped', () => {
    expect(split(grossLines, 30000, 25000)).toEqual([
      { applied: 23500, balance: 0 },
      { applied: 1500, balance: 3957 },
    ]);
  });

  it('stops at the first item boundary when the amount matches exactly', () => {
    expect(split(grossLines, 0, 53500)).toEqual([
      { applied: 53500, balance: 0 },
      { applied: 0, balance: 5457 },
    ]);
  });

  it('caps the applied total at the invoice total', () => {
    expect(split(grossLines, 30000, 30000)).toEqual([
      { applied: 23500, balance: 0 },
      { applied: 5457, balance: 0 },
    ]);
  });

  it('skips a zero-gross item without blocking later ones', () => {
    expect(split([{ gross: 10700 }, { gross: 0 }, { gross: 5350 }], 0, 12000)).toEqual([
      { applied: 10700, balance: 0 },
      { applied: 0, balance: 0 },
      { applied: 1300, balance: 4050 },
    ]);
  });

  it('returns the original line fields alongside the allocation', () => {
    expect(allocate([{ gross: 100, id: 'a' }], 0, 40)).toEqual([{ gross: 100, id: 'a', applied: 40, balance: 60 }]);
  });
});
