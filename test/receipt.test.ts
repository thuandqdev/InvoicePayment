import { describe, expect, it } from 'vitest';
import { createBilling, getUnappliedAmount } from '../src/index';
import { FIXED_DATE, fixedDeps, invoiceOf, scenario1Invoice, scenario2Invoice, succeeded, thrown } from './fixtures';

function newBilling() {
  return createBilling(fixedDeps());
}

describe('receipt for the reconciliation example', () => {
  it('reports only the first payment on the first receipt', () => {
    const { processPayment, generateReceipt } = newBilling();
    const paid = succeeded(processPayment(scenario1Invoice(), 300, 'cash'));
    const receipt = generateReceipt(paid.payment, paid.invoice);
    expect(receipt).toMatchObject({ totalPaid: 300, remainingBalance: 289.57 });
    expect(receipt.items).toEqual([
      { invoiceItemId: 'item-1', description: 'Monthly Fee', itemTotal: 535, amountApplied: 300, itemBalance: 235 },
    ]);
    expect(getUnappliedAmount(receipt)).toBe(0);
  });

  it('reports 300 and not the cumulative 600 on the overpaying receipt', () => {
    const { processPayment, generateReceipt } = newBilling();
    const first = succeeded(processPayment(scenario1Invoice(), 300, 'cash'));
    const second = succeeded(processPayment(first.invoice, 300, 'bank_transfer'));
    expect(second.invoice).toMatchObject({ outstandingAmount: -10.43, status: 'overpaid' });

    const receipt = generateReceipt(second.payment, second.invoice);
    expect(receipt).toMatchObject({ totalPaid: 300, remainingBalance: -10.43 });
    expect(receipt.items).toEqual([
      { invoiceItemId: 'item-1', description: 'Monthly Fee', itemTotal: 535, amountApplied: 235, itemBalance: 0 },
      { invoiceItemId: 'item-2', description: 'Activity Fee', itemTotal: 54.57, amountApplied: 54.57, itemBalance: 0 },
    ]);
    expect(getUnappliedAmount(receipt)).toBe(10.43);

    const third = processPayment(second.invoice, 10, 'cash');
    expect(third).toMatchObject({ success: false, error: { code: 'INVOICE_ALREADY_SETTLED' } });
  });

  it('does not repeat allocation across payments on scenario 2', () => {
    const { processPayment, generateReceipt } = newBilling();
    const first = succeeded(processPayment(scenario2Invoice(), 300, 'cash'));
    const second = succeeded(processPayment(first.invoice, 750, 'bank_transfer'));

    const receipt1 = generateReceipt(first.payment, first.invoice);
    expect(receipt1.remainingBalance).toBe(700);
    expect(receipt1.items).toEqual([
      { invoiceItemId: 'item-a', description: 'Item A', itemTotal: 500, amountApplied: 300, itemBalance: 200 },
    ]);

    const receipt2 = generateReceipt(second.payment, second.invoice);
    expect(receipt2.remainingBalance).toBe(-50);
    expect(receipt2.items).toEqual([
      { invoiceItemId: 'item-a', description: 'Item A', itemTotal: 500, amountApplied: 200, itemBalance: 0 },
      { invoiceItemId: 'item-b', description: 'Item B', itemTotal: 500, amountApplied: 500, itemBalance: 0 },
    ]);
    expect(getUnappliedAmount(receipt2)).toBe(50);
  });
});

describe('generateReceipt snapshot handling', () => {
  it('takes remainingBalance from the snapshot without subtracting again', () => {
    const { processPayment, generateReceipt } = newBilling();
    const paid = succeeded(processPayment(scenario2Invoice(), 300, 'cash'));
    expect(generateReceipt(paid.payment, paid.invoice).remainingBalance).toBe(paid.invoice.outstandingAmount);
  });

  it('rejects the invoice from before the payment', () => {
    const { processPayment, generateReceipt } = newBilling();
    const paid = succeeded(processPayment(scenario2Invoice(), 300, 'cash'));
    expect(thrown(() => generateReceipt(paid.payment, scenario2Invoice())).code).toBe('PAYMENT_NOT_APPLICABLE');
  });

  it('rebuilds an old receipt from the snapshot that was kept', () => {
    const { processPayment, generateReceipt } = newBilling();
    const first = succeeded(processPayment(scenario1Invoice(), 300, 'cash'));
    const original = generateReceipt(first.payment, first.invoice);
    succeeded(processPayment(first.invoice, 300, 'bank_transfer'));

    const again = generateReceipt(first.payment, first.invoice);
    expect(again.items).toEqual(original.items);
    expect(again.remainingBalance).toBe(original.remainingBalance);
  });

  it('is deterministic with the injected deps', () => {
    const { processPayment, generateReceipt } = newBilling();
    const paid = succeeded(processPayment(scenario2Invoice(), 300, 'cash'));
    const receipt = generateReceipt(paid.payment, paid.invoice);
    expect(receipt).toMatchObject({ id: 'id-2', receiptNumber: 'RCT-id-2', paymentId: 'id-1' });
    expect(receipt.receiptDate).toEqual(FIXED_DATE);
  });
});

describe('generateReceipt rejections', () => {
  it('rejects a payment that belongs to another invoice', () => {
    const { processPayment, generateReceipt } = newBilling();
    const paid = succeeded(processPayment(scenario2Invoice(), 300, 'cash'));
    const foreign = { ...paid.payment, invoiceId: 'inv-other' };
    expect(thrown(() => generateReceipt(foreign, paid.invoice)).code).toBe('INVOICE_MISMATCH');
  });

  it.each([0, -50, 10.005, 1_000_000_000.01])('reports a failed payment of %s as not completed', (amount) => {
    const { processPayment, generateReceipt } = newBilling();
    const failed = processPayment(scenario2Invoice(), amount, 'cash');
    expect(thrown(() => generateReceipt(failed.payment, failed.invoice)).code).toBe('PAYMENT_NOT_COMPLETED');
  });

  it('reports a payment into a settled invoice as not completed', () => {
    const { processPayment, generateReceipt } = newBilling();
    const overpaid = succeeded(processPayment(scenario2Invoice(), 1050, 'cash'));
    const failed = processPayment(overpaid.invoice, 10, 'cash');
    expect(thrown(() => generateReceipt(failed.payment, failed.invoice)).code).toBe('PAYMENT_NOT_COMPLETED');
  });

  it('rejects a completed record with a corrupt amount', () => {
    const { processPayment, generateReceipt } = newBilling();
    const paid = succeeded(processPayment(scenario2Invoice(), 300, 'cash'));
    const corrupt = { ...paid.payment, amount: -1 };
    expect(thrown(() => generateReceipt(corrupt, paid.invoice)).code).toBe('NON_POSITIVE_PAYMENT');
  });
});

describe('receipt allocation', () => {
  it('leaves out a zero-price item and still reaches the next one', () => {
    const { processPayment, generateReceipt } = newBilling();
    const invoice = invoiceOf([
      { id: 'a', description: 'Plan', quantity: 1, unitPrice: 100 },
      { id: 'free', description: 'Free add-on', quantity: 1, unitPrice: 0 },
      { id: 'c', description: 'Support', quantity: 1, unitPrice: 50 },
    ]);
    const paid = succeeded(processPayment(invoice, 120, 'cash'));
    expect(generateReceipt(paid.payment, paid.invoice).items).toEqual([
      { invoiceItemId: 'a', description: 'Plan', itemTotal: 107, amountApplied: 107, itemBalance: 0 },
      { invoiceItemId: 'c', description: 'Support', itemTotal: 53.5, amountApplied: 13, itemBalance: 40.5 },
    ]);
  });

  it('stops at the item boundary on an exact payment', () => {
    const { processPayment, generateReceipt } = newBilling();
    const paid = succeeded(processPayment(scenario1Invoice(), 535, 'cash'));
    const receipt = generateReceipt(paid.payment, paid.invoice);
    expect(receipt.items.map((item) => item.invoiceItemId)).toEqual(['item-1']);
    expect(receipt.remainingBalance).toBe(54.57);
  });

  const sequences = [
    [300, 300, 50],
    [0.01, 589.56],
    [535, 54.57],
    [100, 200, 300, 50],
    [589.57],
    [1, 1, 1, 1, 585.57],
  ];

  it.each(sequences)('conserves money over payment sequence %#', (...amounts) => {
    const { processPayment, generateReceipt } = newBilling();
    const cents = (value: number) => Math.round(value * 100);
    const grossByItem = { 'item-1': 53500, 'item-2': 5457 };
    const appliedByItem = { 'item-1': 0, 'item-2': 0 };
    let invoice = scenario1Invoice();

    for (const amount of amounts) {
      const result = processPayment(invoice, amount, 'cash');
      if (!result.success) continue;
      const receipt = generateReceipt(result.payment, result.invoice);
      let appliedTotal = 0;
      for (const item of receipt.items) {
        const id = item.invoiceItemId === 'item-1' ? 'item-1' : 'item-2';
        expect(item.amountApplied).toBeGreaterThan(0);
        appliedByItem[id] += cents(item.amountApplied);
        appliedTotal += cents(item.amountApplied);
        expect(appliedByItem[id]).toBeLessThanOrEqual(grossByItem[id]);
      }
      expect(appliedTotal + cents(getUnappliedAmount(receipt))).toBe(cents(amount));
      invoice = result.invoice;
    }

    if (invoice.outstandingAmount <= 0) expect(appliedByItem).toEqual(grossByItem);
  });
});
