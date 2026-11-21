import { describe, expect, it } from 'vitest';
import { createBilling, processPayment as defaultProcessPayment } from '../src/index';
import { deepFreeze, FIXED_DATE, fixedDeps, invoiceOf, scenario1Invoice, scenario2Invoice, succeeded, thrown } from './fixtures';

function newProcessPayment() {
  return createBilling(fixedDeps()).processPayment;
}

describe('processPayment amounts', () => {
  it('lets scenario 2 go from 1000 to 700 to -50', () => {
    const processPayment = newProcessPayment();
    const first = succeeded(processPayment(scenario2Invoice(), 300, 'cash'));
    expect(first.invoice.outstandingAmount).toBe(700);
    expect(first.invoice.status).toBe('partially_paid');

    const second = succeeded(processPayment(first.invoice, 750, 'bank_transfer'));
    expect(second.invoice.outstandingAmount).toBe(-50);
    expect(second.invoice.status).toBe('overpaid');
  });

  it('marks the invoice paid on an exact payment', () => {
    const result = succeeded(newProcessPayment()(scenario2Invoice(), 1000, 'cash'));
    expect(result.invoice.outstandingAmount).toBe(0);
    expect(result.invoice.status).toBe('paid');
  });

  it('adds up partial payments without drift', () => {
    const processPayment = newProcessPayment();
    const first = succeeded(processPayment(scenario2Invoice(), 100, 'cash'));
    const second = succeeded(processPayment(first.invoice, 200.5, 'bank_transfer'));
    const third = succeeded(processPayment(second.invoice, 699.5, 'cash'));
    expect([first, second, third].map((r) => r.invoice.outstandingAmount)).toEqual([900, 699.5, 0]);
    expect(third.invoice.status).toBe('paid');
  });

  it('applies two identical payments separately', () => {
    const processPayment = newProcessPayment();
    const first = succeeded(processPayment(scenario2Invoice(), 100, 'cash'));
    const second = succeeded(processPayment(first.invoice, 100, 'cash'));
    expect(first.payment.id).not.toBe(second.payment.id);
    expect([first.invoice.outstandingAmount, second.invoice.outstandingAmount]).toEqual([900, 800]);
  });

  it('records the method on the payment', () => {
    const result = succeeded(newProcessPayment()(scenario2Invoice(), 10, 'bank_transfer'));
    expect(result.payment).toMatchObject({ paymentMethod: 'bank_transfer', amount: 10, invoiceId: 'inv-1', status: 'completed' });
  });
});

describe('processPayment rejections', () => {
  it('fails payments into a settled invoice and leaves it unchanged', () => {
    const processPayment = newProcessPayment();
    const overpaid = succeeded(processPayment(scenario2Invoice(), 1050, 'cash')).invoice;
    const paid = succeeded(processPayment(scenario2Invoice(), 1000, 'cash')).invoice;
    for (const settled of [overpaid, paid]) {
      const result = processPayment(settled, 10, 'cash');
      expect(result).toMatchObject({ success: false, error: { code: 'INVOICE_ALREADY_SETTLED' }, payment: { status: 'failed' } });
      expect(result.invoice).toBe(settled);
    }
  });

  it('fails any payment into a zero-total invoice', () => {
    const zero = invoiceOf([{ id: 'free', description: 'Free trial', quantity: 1, unitPrice: 0 }]);
    expect(newProcessPayment()(zero, 10, 'cash')).toMatchObject({ success: false, error: { code: 'INVOICE_ALREADY_SETTLED' } });
  });

  it.each([0, -50])('fails a payment of %s without touching the balance', (amount) => {
    const result = newProcessPayment()(scenario2Invoice(), amount, 'cash');
    expect(result).toMatchObject({ success: false, error: { code: 'NON_POSITIVE_PAYMENT' } });
    expect(result.invoice.outstandingAmount).toBe(1000);
  });

  it('fails more than 2 decimals and amounts above the cap', () => {
    const processPayment = newProcessPayment();
    expect(processPayment(scenario2Invoice(), 10.005, 'cash')).toMatchObject({ success: false, error: { code: 'INVALID_PRECISION' } });
    expect(processPayment(scenario2Invoice(), 1_000_000_000.01, 'cash')).toMatchObject({
      success: false,
      error: { code: 'AMOUNT_OUT_OF_RANGE' },
    });
  });

  it('puts the amount in the failure message', () => {
    const result = newProcessPayment()(scenario2Invoice(), -50, 'cash');
    expect(result).toMatchObject({ error: { message: 'paymentAmount must be greater than 0, got -50' } });
  });

  it('throws on NaN and infinite amounts', () => {
    const processPayment = newProcessPayment();
    for (const amount of [NaN, Infinity, -Infinity]) {
      expect(thrown(() => processPayment(scenario2Invoice(), amount, 'cash')).code).toBe('INVALID_AMOUNT');
    }
  });

  it('throws on an unknown payment method', () => {
    // @ts-expect-error credit_card is not a PaymentMethod
    expect(thrown(() => newProcessPayment()(scenario2Invoice(), 100, 'credit_card')).code).toBe('UNSUPPORTED_PAYMENT_METHOD');
  });
});

describe('processPayment invoice checks', () => {
  const processPayment = newProcessPayment();

  it('rejects stored figures that contradict each other', () => {
    const partial = succeeded(processPayment(scenario2Invoice(), 300, 'cash')).invoice;
    expect(thrown(() => processPayment({ ...partial, status: 'paid' }, 10, 'cash')).code).toBe('INCONSISTENT_INVOICE');
    expect(thrown(() => processPayment({ ...partial, outstandingAmount: 1000.01 }, 10, 'cash')).code).toBe('INCONSISTENT_INVOICE');
    expect(thrown(() => processPayment({ ...partial, totalAmount: 999 }, 10, 'cash')).code).toBe('INCONSISTENT_INVOICE');
  });

  it('reports a stored lineTotal that does not match its quantity and price', () => {
    const invoice = scenario1Invoice();
    const items = invoice.items.map((item) => (item.id === 'item-2' ? { ...item, lineTotal: 999 } : item));
    const error = thrown(() => processPayment({ ...invoice, items }, 10, 'cash'));
    expect(error.code).toBe('INCONSISTENT_ITEM');
    expect(error.details).toEqual({ itemId: 'item-2', field: 'lineTotal', expected: 51, actual: 999 });
  });

  it('rejects items that carry different tax rates', () => {
    const invoice = scenario1Invoice();
    const items = invoice.items.map((item) => (item.id === 'item-2' ? { ...item, taxRate: 0.08 } : item));
    expect(thrown(() => processPayment({ ...invoice, items }, 10, 'cash')).code).toBe('INCONSISTENT_INVOICE');
  });

  it('rejects duplicate item ids and invalid dates on a stored invoice', () => {
    const invoice = scenario2Invoice();
    const items = invoice.items.map((item) => ({ ...item, id: 'same' }));
    expect(thrown(() => processPayment({ ...invoice, items }, 10, 'cash')).code).toBe('DUPLICATE_ITEM_ID');
    expect(thrown(() => processPayment({ ...invoice, invoiceDate: new Date('x') }, 10, 'cash')).code).toBe('INVALID_DATE');
  });
});

describe('processPayment purity', () => {
  it('does not mutate a frozen invoice and returns fresh objects', () => {
    const frozen = deepFreeze(scenario2Invoice());
    const before = structuredClone(frozen);
    const result = succeeded(newProcessPayment()(frozen, 300, 'cash'));
    expect(frozen).toEqual(before);
    expect(result.invoice).not.toBe(frozen);
    expect(result.invoice.items).not.toBe(frozen.items);
    result.invoice.items.forEach((item, i) => expect(item).not.toBe(frozen.items[i]));
  });

  it('returns the same invoice for every failed payment', () => {
    const invoice = scenario2Invoice();
    const processPayment = newProcessPayment();
    for (const amount of [0, -50, 10.005, 1_000_000_000.01]) {
      const result = processPayment(invoice, amount, 'cash');
      expect(result.success).toBe(false);
      expect(result.invoice).toBe(invoice);
      expect(invoice.outstandingAmount).toBe(1000);
    }
  });

  it('takes ids and time from the injected deps', () => {
    const processPayment = newProcessPayment();
    const first = succeeded(processPayment(scenario2Invoice(), 100, 'cash'));
    const second = succeeded(processPayment(first.invoice, 100, 'cash'));
    expect(first.payment).toMatchObject({ id: 'id-1', referenceNumber: 'PAY-id-1' });
    expect(first.payment.paymentDate).toEqual(FIXED_DATE);
    expect(second.payment).toMatchObject({ id: 'id-2', referenceNumber: 'PAY-id-2' });
  });
});

describe('default exports', () => {
  it('use real ids and dates', () => {
    const first = succeeded(defaultProcessPayment(scenario2Invoice(), 100, 'cash'));
    const second = succeeded(defaultProcessPayment(scenario2Invoice(), 100, 'cash'));
    expect(first.payment.id).not.toBe('');
    expect(first.payment.id).not.toBe(second.payment.id);
    expect(first.payment.paymentDate).toBeInstanceOf(Date);
    expect(Number.isNaN(first.payment.paymentDate.getTime())).toBe(false);
  });
});
