import { createInvoice, generateReceipt, getUnappliedAmount, processPayment } from '../src/index';
import type { Invoice, PaymentMethod } from '../src/index';

const money = (value: number) => value.toFixed(2);

function show(invoice: Invoice) {
  console.log(`invoice ${invoice.invoiceNumber}: total ${money(invoice.totalAmount)} (tax ${money(invoice.totalTax)}), outstanding ${money(invoice.outstandingAmount)} (${invoice.status})`);
}

function pay(label: string, invoice: Invoice, amount: number, method: PaymentMethod): Invoice {
  const result = processPayment(invoice, amount, method);
  if (!result.success) {
    console.log(`${label}: ${method} ${money(amount)} -> failed ${result.error.code}`);
    return invoice;
  }
  console.log(`${label}: ${method} ${money(amount)} -> outstanding ${money(result.invoice.outstandingAmount)} (${result.invoice.status})`);
  const receipt = generateReceipt(result.payment, result.invoice);
  const applied = receipt.items.map((item) => `${item.description} ${money(item.amountApplied)} (left ${money(item.itemBalance)})`);
  console.log(`  receipt: paid ${money(receipt.totalPaid)}, remaining ${money(receipt.remainingBalance)}, unapplied ${money(getUnappliedAmount(receipt))}`);
  console.log(`  applied: ${applied.join(', ')}`);
  return result.invoice;
}

let scenario1 = createInvoice({
  id: 'inv-1',
  invoiceNumber: 'INV-001',
  invoiceDate: new Date('2026-01-10T00:00:00Z'),
  items: [
    { id: 'item-1', description: 'Monthly Fee', quantity: 1, unitPrice: 500 },
    { id: 'item-2', description: 'Activity Fee', quantity: 2, unitPrice: 25.5 },
  ],
});
show(scenario1);
scenario1 = pay('payment 1', scenario1, 300, 'cash');
scenario1 = pay('payment 2', scenario1, 300, 'bank_transfer');
scenario1 = pay('payment 3', scenario1, 10, 'cash');

let scenario2 = createInvoice({
  id: 'inv-2',
  invoiceNumber: 'INV-002',
  invoiceDate: new Date('2026-01-10T00:00:00Z'),
  items: [
    { id: 'item-a', description: 'Item A', quantity: 1, unitPrice: 467.29 },
    { id: 'item-b', description: 'Item B', quantity: 1, unitPrice: 467.29 },
  ],
});
show(scenario2);
scenario2 = pay('payment 1', scenario2, 300, 'cash');
scenario2 = pay('payment 2', scenario2, 750, 'bank_transfer');
