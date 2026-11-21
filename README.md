# invoice-payment

Invoice totals with 7% GST, payment processing and receipt generation in TypeScript. No runtime dependencies.

## Setup

Node 22 and npm.

```
npm ci
npm run typecheck
npm test
npm run example
npm run example:edge
```

`npm run example` walks Scenario 1 and Scenario 2 through payments and receipts. `npm run example:edge` prints how zero, negative, very large and repeated inputs are handled.

## Usage

```ts
import { createInvoice, processPayment, generateReceipt } from './src/index';

const invoice = createInvoice({
  id: 'inv-1',
  invoiceNumber: 'INV-001',
  invoiceDate: new Date(),
  items: [
    { id: 'item-1', description: 'Monthly Fee', quantity: 1, unitPrice: 500 },
    { id: 'item-2', description: 'Activity Fee', quantity: 2, unitPrice: 25.5 },
  ],
});

const result = processPayment(invoice, 300, 'cash');
if (result.success) {
  const receipt = generateReceipt(result.payment, result.invoice);
}
```

The three functions keep the signatures from the spec and are synchronous.

| Function | Returns |
|---|---|
| `calculateInvoiceTotal(items, taxRate)` | `{ subtotal, totalTax, totalAmount }` |
| `processPayment(invoice, paymentAmount, paymentMethod)` | `PaymentResult`, a new invoice on success |
| `generateReceipt(payment, invoice)` | `Receipt` |

Helpers: `createInvoice` and `createInvoiceItem` build valid invoices at 7% GST, and `getUnappliedAmount(receipt)` returns the part of a payment that exceeded the invoice. `createBilling({ now, generateId })` returns `processPayment` and `generateReceipt` with a fixed clock and id source, which is what the tests use. The default exports use `new Date()` and `crypto.randomUUID()`.

## Design decisions

**Money.** Amounts are integer cents held in a `number`. Input is converted with `Math.round(value * 100)` and rejected when it does not round-trip, so 1.005 and `0.1 + 0.2` throw `INVALID_PRECISION` instead of being rounded silently. Every amount is capped at 1,000,000,000.00. At that cap the largest intermediate value is 1e15, below 2^53, so plain integer arithmetic is exact and no decimal library is needed.

**Tax rounding.** Tax is rounded half-up to the cent per line, and `totalTax` is the sum of the line taxes, so the item `taxAmount` values always add up. Three lines of 10.05 give 0.70 tax each, 2.10 in total. Rounding the 30.15 subtotal instead would give 2.11. The rounding uses integer basis points and no `toFixed`: 118.50 * 0.07 = 8.295 must round to 8.30, while `toFixed(2)` returns 8.29.

**What the calculation reads.** `calculateInvoiceTotal` reads only `quantity`, `unitPrice` and the `taxRate` argument. The spec's Scenario 1 passes items without derived fields, and a placeholder `lineTotal` must not change the result. For a stored invoice, the other functions recompute every derived field and total and compare. A mismatch throws `INCONSISTENT_ITEM` or `INCONSISTENT_INVOICE` with the expected and actual values.

**Scenario 2.** The spec's `{ total: 1000, outstanding: 1000 }` is shorthand. The tests use two items of 467.29, each with tax 32.71 and 500.00 tax-inclusive, for a total of 1000.00. Paying 300 leaves 700. Paying 750 more leaves -50.00 and the status `overpaid`.

**Invoice status.** Status is derived from the numbers and never stored independently.

| Outstanding | Status |
|---|---|
| less than 0 | `overpaid` |
| 0 | `paid` |
| equal to the total | `unpaid` |
| otherwise | `partially_paid` |

**Settled invoices reject new payments.** A payment that crosses zero is accepted and the negative balance is kept, as Scenario 2 requires. A payment into an invoice that already has outstanding of 0 or less comes back as `failed` with `INVOICE_ALREADY_SETTLED`. There is nothing left to allocate to, and the likely cause is a duplicate submission. This does not conflict with Scenario 2, where the balance is positive before the second payment.

**Two error channels.** Throwing is for caller bugs: a malformed or inconsistent invoice, an amount that is not a finite number, an unknown payment method. No payment record can be made from those. A `failed` result is for a finite amount that breaks a business rule (zero or negative, more than 2 decimals, above the cap, settled invoice). The failed payment record keeps the real amount for reconciliation, and the invoice is returned unchanged.

**No mutation.** `processPayment` returns a new invoice with copied items. The input can be deep-frozen. Old snapshots stay valid, which receipts depend on.

**Allocation.** Payments fill the invoice items in order, against each item's tax-inclusive amount (`lineTotal + taxAmount`). The amount applied to an item depends only on the total paid so far, and that total is `totalAmount - outstandingAmount`, so no payment history is stored. A proportional split would depend on payment order through rounding and is not used.

For Scenario 1 (Monthly Fee 535.00, Activity Fee 54.57, total 589.57):

| Payment | Monthly Fee | Activity Fee | Unapplied | Outstanding |
|---|---|---|---|---|
| cash 300.00 | 300.00 applied, 235.00 left | 0 | 0 | 289.57 |
| bank 300.00 | 235.00 applied, 0 left | 54.57 applied, 0 left | 10.43 | -10.43 |
| cash 10.00 | rejected with `INVOICE_ALREADY_SETTLED` | | | -10.43 |

**Receipts.** `totalPaid` is the amount of that one payment, not a running total. The running total is `totalAmount - remainingBalance`. Each receipt satisfies

```
sum(items.amountApplied) + max(0, -remainingBalance) = totalPaid
```

Items with nothing applied from this payment are left out of `items`.

`generateReceipt` expects the invoice returned by `processPayment` for that payment and does not subtract the payment again. Check order: invoice validity, payment shape, `INVOICE_MISMATCH`, `PAYMENT_NOT_COMPLETED`, the amount rules for a completed record, then `PAYMENT_NOT_APPLICABLE`. Because status is checked before the amount, every failed payment record gets `PAYMENT_NOT_COMPLETED`.

## Assumptions and limitations

- Amounts have 2 decimals (SGD). `lineTotal` is before tax and `totalAmount` includes tax. One tax rate applies to a whole invoice.
- Quantity must be a whole number of at least 1. Fractional quantities would need a line rounding rule.
- A unit price of 0 is allowed. Negative prices, discounts and credit notes are not.
- A float the caller computed, such as `0.1 * 3`, is rejected rather than guessed at, because it is not a 2-decimal amount.
- A payment with status `completed` means it is recorded against the invoice. It does not mean a bank confirmed it.
- `referenceNumber` is an internal reference (`PAY-<id>`), not a bank reference. The function signature has no place to pass an external one.
- A receipt for an old payment needs the invoice snapshot returned with that payment. A wrong snapshot is only detected when the balance it implies is impossible, that is when `outstandingAmount + payment.amount` is above the total or not positive. For example, on a 1000.00 invoice paid 300 then 200, passing the snapshot from after the 300 payment with the 200 payment implies 900 before the payment, which is plausible, so the receipt comes out wrong without an error.
- Not covered: refunds and reversals, idempotency keys, concurrency, persistence, sequential receipt numbers, several tax rates, rounding rules for cash, bank fees.
