// A PayPal capture never throws on the shop's side: an earlier PayPal checkout of the same order
// (another tab started a new one) settles when its amount matches, and a second capture of an
// already-paid order is recorded for a refund instead of disappearing.
import { expect, test } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { fileURLToPath } from 'node:url';

const realRequire = createRequire(import.meta.url);
const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.js'), 'utf8');

function harness(order, card) {
  const docs = {
    orders: { o1: order },
    books: { book: { status: 'published', stockLevel: 5, trackInventory: true } },
    giftCards: { gc1: card, sold1: { balanceMinor: 2500, enabled: true, history: [] } },
    settings: { website: { payments: {} } },
    analytics: {},
  };
  const ref = (name, id) => ({ name, id,
    async get() { const data = docs[name]?.[id]; return { exists: !!data, data: () => data }; },
    async set(data) { docs[name] ||= {}; docs[name][id] = { ...(docs[name][id] || {}), ...data }; },
    async update(data) { Object.assign(docs[name][id], data); },
  });
  // Firestore update() treats "a.b" as a nested field.
  const apply = (target, data) => { for (const [k, v] of Object.entries(data)) { if (k.includes('.')) { const [a, b] = k.split('.'); target[a] = { ...(target[a] || {}), [b]: v }; } else target[k] = v; } };
  const db = {
    collection(name) { return { doc: (id) => ref(name, id), where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }) }; },
    async runTransaction(fn) {
      return fn({ get: (r) => r.get(), update: (r, data) => { apply(docs[r.name][r.id], data); }, set: (r, data) => { docs[r.name] ||= {}; docs[r.name][r.id] = data; } });
    },
  };
  const admin = { initializeApp() {}, firestore: Object.assign(() => db, { FieldValue: { increment: (n) => ({ inc: n }) } }) };
  const wrap = (...args) => args.at(-1);
  const mockRequire = (name) => {
    if (name === 'firebase-admin') return admin;
    if (name === 'stripe') return class {};
    if (name === 'resend') return { Resend: class {} };
    if (name.startsWith('firebase-functions/v2/')) return new Proxy({}, { get: () => wrap });
    if (name === 'firebase-functions/params') return { defineSecret: () => ({ value: () => 'fake' }) };
    return realRequire(name);
  };
  const module = { exports: {} };
  const exposed = `${source}\nmodule.exports.__test = { markOrderPaidFromPayPal, completeOrderWithoutCard };`;
  vm.runInNewContext(exposed, { module, exports: module.exports, require: mockRequire, process, Buffer, console, setTimeout, clearTimeout, URL, AbortController, fetch: async () => { throw new Error('no network'); } }, { filename: 'index.js' });
  return { docs, ...module.exports.__test };
}

const order = (extra = {}) => ({
  paymentStatus: 'unpaid', status: 'pending_payment', paypalMode: 'test', paypalOrderId: 'P2', total: 20,
  items: [{ id: 'book', quantity: 1, price: 20 }], expectedAmountMinor: 2000, expectedCurrency: 'cad', activity: [], ...extra,
});
const capture = (id, value = '20.00') => ({ id, status: 'COMPLETED', amount: { value, currency_code: 'CAD' } });
const paid = (paypalOrderId, captureId, value) => ({ paypalOrderId, captureId, transactionId: captureId, captureStatus: 'COMPLETED', capture: capture(captureId, value) });

test('an earlier PayPal checkout of the order settles it when the amount matches', async () => {
  const app = harness(order(), { balanceMinor: 0, enabled: true, holds: {}, history: [] });
  expect(await app.markOrderPaidFromPayPal('o1', paid('P1', 'CAP1'))).toBe(true);
  expect(app.docs.orders.o1.paymentStatus).toBe('paid');
  expect(app.docs.orders.o1.paypalOrderId).toBe('P1');
  expect(app.docs.orders.o1.paypalCaptureId).toBe('CAP1');
});

test('an earlier PayPal checkout with another amount is recorded, not thrown', async () => {
  const app = harness(order(), { balanceMinor: 0, enabled: true, holds: {}, history: [] });
  expect(await app.markOrderPaidFromPayPal('o1', paid('P1', 'CAP1', '25.00'))).toBe(false);
  expect(app.docs.orders.o1.paymentStatus).toBe('unpaid');
  expect(app.docs.orders.o1.paymentMismatch).toMatchObject({ provider: 'paypal', captureId: 'CAP1' });
});

test('a second capture of an already-paid order is flagged once for a refund', async () => {
  const app = harness(order({ paymentStatus: 'paid', paypalCaptureId: 'CAP2' }), { balanceMinor: 0, enabled: true, holds: {}, history: [] });
  expect(await app.markOrderPaidFromPayPal('o1', paid('P1', 'CAP1'))).toBe(false);
  expect(app.docs.orders.o1.duplicatePayments).toEqual([expect.objectContaining({ provider: 'paypal', captureId: 'CAP1', amountMinor: 2000 })]);
  expect(app.docs.orders.o1.paypalCaptureId).toBe('CAP2');
  await app.markOrderPaidFromPayPal('o1', paid('P1', 'CAP1'));
  expect(app.docs.orders.o1.duplicatePayments).toHaveLength(1);
  // The same capture again (webhook after the capture call) is simply already paid.
  expect(await app.markOrderPaidFromPayPal('o1', paid('P2', 'CAP2'))).toBe(true);
});

test('a manual or free payment never revives an order cancelled in the meantime', async () => {
  const app = harness(order({ paymentMethod: 'Interac e-Transfer', paypalMode: undefined, status: 'cancelled' }), { balanceMinor: 0, enabled: true, holds: {}, history: [] });
  expect(await app.completeOrderWithoutCard('o1', 'Payment confirmed manually.', { reserve: false })).toBe(false);
  expect(app.docs.orders.o1.paymentStatus).toBe('unpaid');
  expect(app.docs.books.book.stockLevel).toBe(5);
});
