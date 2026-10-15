// The refund/dispute safety net keeps its timing (every watched order at least every 6 hours, a new
// payment on the next sweep, 40 checks per sweep, oldest first) while reading only new payments and the
// due orders, and without writing to orders.
import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { runReversalChecks, readState, scanPlan, mergeScan, capEntries, dueOrderIds, MAX_TRACKED, SCAN_LIMIT, SCAN_FIELDS } = require("./reversalSchedule.js");

const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const T0 = Date.parse("2026-10-15T12:00:00Z");
const iso = (ms) => new Date(ms).toISOString();
const paid = (id, paidMs, extra = {}) => ({ id, paymentStatus: "paid", stripeMode: "live", stripePaymentIntentId: `pi_${id}`, paidAt: iso(paidMs), createdAt: iso(paidMs - MIN), ...extra });

// A fake shop: orders in memory, the record in memory, Stripe answers through `found`.
// Like the real query, a scan returns only SCAN_FIELDS; like Firestore's getAll, an empty read throws.
const scanCopy = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => k === "id" || SCAN_FIELDS.includes(k)));
function shop(orders = [], { found = () => true } = {}) {
  const db = new Map(orders.map((o) => [o.id, o]));
  const io = {
    record: null, reads: 0, queries: [], fetched: [], tried: [], checked: [], stamped: [], warnings: [],
    failWrite: false, failScan: false, failRead: false,
    readState: async () => { if (io.failRead) throw new Error("unavailable"); return io.record; },
    writeState: async (r) => { if (io.failWrite) throw new Error("write refused"); io.record = JSON.parse(JSON.stringify(r)); },
    queryPaid: async (since, limit) => {
      if (io.failScan) throw new Error("index building");
      io.queries.push({ since, limit });
      const hits = [...db.values()].filter((o) => ["paid", "refund_pending", "refunded"].includes(o.paymentStatus) && o.paidAt && o.paidAt >= since)
        .sort((a, b) => b.paidAt.localeCompare(a.paidAt));
      io.reads += Math.min(hits.length, limit + 1);
      return { orders: hits.slice(0, limit).map(scanCopy), truncated: hits.length > limit };
    },
    getOrders: async (ids) => {
      if (!ids.length) throw new Error("Function \"Firestore.getAll()\" requires at least 1 argument.");
      io.fetched.push(...ids); io.reads += ids.length;
      return ids.map((id) => (db.has(id) ? { ...db.get(id), id } : null));
    },
    check: async (order, onChecked) => {
      io.tried.push(order.id);
      expect(order.stripeMode).toBe("live"); // checks get the whole order, not the scan's few fields
      if (found(order)) { io.checked.push(order.id); onChecked(); }
    },
    stampOrders: async (ids) => { io.stamped.push(...ids); },
    warn: (m) => io.warnings.push(m),
  };
  return { db, io };
}
const run = (io, nowMs, opts = {}) => runReversalChecks(io, { now: () => nowMs, ...opts });

describe("reversal schedule", () => {
  it("first sweep re-reads every paid order, checks the due ones and saves their times without touching orders", async () => {
    const { io } = shop([paid("a", T0 - 2 * DAY), paid("b", T0 - 30 * DAY), paid("old", T0 - 130 * DAY), paid("t", T0 - DAY, { isTest: true }), { id: "u", paymentStatus: "unpaid", stripePaymentIntentId: "pi_u", createdAt: iso(T0) }]);
    const result = await run(io, T0);
    expect(result.reconcile).toBe(true);
    expect(io.checked.sort()).toEqual(["a", "b"]);
    expect(io.stamped).toEqual([]);
    expect(io.record).toMatchObject({ v: 1, scannedFrom: iso(T0), reconciledAt: iso(T0) });
    expect(Object.keys(io.record.orders).sort()).toEqual(["a", "b"]);
    expect(io.record.orders.a).toEqual([T0 - 2 * DAY, T0, T0]);
  });

  it("the next sweeps read only new payments and check nothing until 6 hours have passed", async () => {
    const { io, db } = shop([paid("a", T0 - 2 * DAY), paid("b", T0 - 30 * DAY)]);
    await run(io, T0);
    io.checked = []; io.reads = 0; io.queries = []; io.fetched = [];
    await run(io, T0 + 15 * MIN);
    expect(io.checked).toEqual([]);
    expect(io.queries[0]).toEqual({ since: iso(T0 - 30 * MIN), limit: SCAN_LIMIT });
    expect(io.reads).toBe(0);
    // A payment between sweeps is checked on the very next one (read whole first).
    db.set("c", paid("c", T0 + 20 * MIN));
    await run(io, T0 + 30 * MIN);
    expect(io.checked).toEqual(["c"]);
    expect(io.fetched).toEqual(["c"]);
    // Six hours after the first check the two older orders are due again; that sweep re-reads everything.
    io.checked = [];
    await run(io, T0 + 6 * HOUR);
    expect(io.checked.sort()).toEqual(["a", "b"]);
    // The order paid between sweeps is due 6 hours after its check.
    io.checked = []; io.fetched = [];
    await run(io, T0 + 6 * HOUR + 30 * MIN);
    expect(io.checked).toEqual(["c"]);
    expect(io.fetched).toEqual(["c"]);
  });

  it("an order the admin synced with Stripe recently waits 6 hours from that sync", async () => {
    const { io, db } = shop([paid("a", T0 - 2 * DAY)]);
    await run(io, T0);
    db.get("a").stripeCheckedAt = iso(T0 + 5 * HOUR);
    io.checked = [];
    await run(io, T0 + 6 * HOUR);
    expect(io.checked).toEqual([]);
    expect(io.record.orders.a[1]).toBe(T0 + 5 * HOUR);
    await run(io, T0 + 11 * HOUR);
    expect(io.checked).toEqual(["a"]);
  });

  it("an order Stripe couldn't answer for stays due and is tried again on the next sweep", async () => {
    let answer = false;
    const { io } = shop([paid("a", T0 - DAY)], { found: () => answer });
    await run(io, T0);
    expect(io.record.orders.a[1]).toBe(0);
    answer = true;
    await run(io, T0 + 15 * MIN);
    expect(io.checked).toEqual(["a"]);
  });

  it("reports a backlog bigger than one sweep can check", async () => {
    const orders = Array.from({ length: 60 }, (_, i) => paid(`o${i}`, T0 - DAY - i * MIN, { stripeCheckedAt: iso(T0 - 8 * HOUR) }));
    const { io } = shop(orders);
    const result = await run(io, T0);
    expect(result.due).toBe(60);
    expect(io.warnings.some((w) => /60 orders are due/.test(w))).toBe(true);
  });

  it("checks at most 40 per sweep, oldest check first", async () => {
    const orders = Array.from({ length: 60 }, (_, i) => paid(`o${i}`, T0 - (i + 1) * HOUR));
    const { io } = shop(orders);
    await run(io, T0);
    expect(io.checked).toHaveLength(40);
    io.checked = [];
    await run(io, T0 + 15 * MIN);
    expect(io.checked).toHaveLength(20); // the 20 never checked go next
    io.checked = [];
    await run(io, T0 + 6 * HOUR);
    expect(io.checked).toHaveLength(40);
    expect(io.checked.every((id) => Number(id.slice(1)) < 60)).toBe(true);
  });

  it("drops orders that left: refunded elsewhere, deleted, or past 120 days", async () => {
    const { io, db } = shop([paid("a", T0 - DAY), paid("b", T0 - DAY), paid("c", T0 - 119.8 * DAY)]);
    await run(io, T0);
    db.get("a").paymentStatus = "refunded"; db.get("a").refund = { provider: "paypal" };
    db.delete("b");
    await run(io, T0 + 6 * HOUR + MIN);
    expect(Object.keys(io.record.orders)).toEqual([]);
  });

  it("re-reading everything every 6 hours finds an order put back to paid long after it was paid", async () => {
    const { io, db } = shop([paid("a", T0 - 90 * DAY, { paymentStatus: "refunded", refund: { provider: "stripe" }, refundedAt: iso(T0 - 80 * DAY) })]);
    await run(io, T0);
    expect(io.record.orders).toEqual({});
    db.get("a").paymentStatus = "paid"; // e.g. a failed refund reverted by the webhook
    await run(io, T0 + 15 * MIN);
    expect(io.checked).toEqual([]);
    await run(io, T0 + 6 * HOUR);
    expect(io.checked).toEqual(["a"]);
  });

  it("a short scan that fills its page keeps its start and re-reads everything next time", async () => {
    const { io, db } = shop([]);
    await run(io, T0);
    for (let i = 0; i < SCAN_LIMIT + 5; i++) db.set(`n${i}`, paid(`n${i}`, T0 + MIN + i * 1000));
    await run(io, T0 + 15 * MIN);
    expect(io.record.scannedFrom).toBe(iso(T0));
    expect(io.record.reconciledAt).toBeNull();
    expect(scanPlan(readState(io.record), T0 + 30 * MIN).reconcile).toBe(true);
    await run(io, T0 + 30 * MIN);
    expect(Object.keys(io.record.orders)).toHaveLength(SCAN_LIMIT + 5);
  });

  it("a failed scan still checks the orders on the record and keeps the scan marks", async () => {
    const { io } = shop([paid("a", T0 - DAY)]);
    await run(io, T0);
    io.failScan = true; io.checked = [];
    await run(io, T0 + 6 * HOUR);
    expect(io.checked).toEqual(["a"]);
    expect(io.record).toMatchObject({ scannedFrom: iso(T0), reconciledAt: iso(T0) });
  });

  it("when the record can't be saved, the checked orders are stamped as before", async () => {
    const { io } = shop([paid("a", T0 - DAY)]);
    io.failWrite = true;
    await run(io, T0);
    expect(io.stamped).toEqual(["a"]);
  });

  it("an unreadable or old record means re-reading everything", async () => {
    expect(readState({ v: 0, orders: {} })).toBeNull();
    expect(readState({ v: 1, orders: { a: [T0, T0], b: "x", c: [NaN, 1], d: [T0, null, "x"] } }).orders).toEqual({ a: [T0, T0, 0], d: [T0, 0, 0] });
    const { io } = shop([paid("a", T0 - DAY)]);
    io.record = { v: 99, orders: { a: [1, T0] } };
    expect((await run(io, T0)).reconcile).toBe(true);
    expect(io.checked).toEqual(["a"]);
  });

  it("keeps the record under its size cap, newest payments first", () => {
    const entries = {};
    const scanned = Array.from({ length: MAX_TRACKED + 3 }, (_, i) => paid(`o${i}`, T0 - DAY - i * MIN));
    const merged = mergeScan(entries, scanned, { complete: true, nowMs: T0 });
    expect(capEntries(merged)).toBe(3);
    expect(merged[`o${MAX_TRACKED + 2}`]).toBeUndefined();
    expect(merged.o0).toBeDefined();
    expect(dueOrderIds(merged, T0, 40)).toHaveLength(40);
  });

  it("a record that can't be read skips the checks instead of overwriting it", async () => {
    const { io } = shop([paid("a", T0 - DAY)]);
    await run(io, T0);
    const before = JSON.stringify(io.record);
    io.failRead = true; io.checked = [];
    expect(await run(io, T0 + 6 * HOUR)).toEqual({ skipped: true });
    expect(io.checked).toEqual([]);
    expect(JSON.stringify(io.record)).toBe(before);
  });

  it("orders Stripe can't answer for are retried every sweep, but after the orders that are simply due", async () => {
    const orders = [...Array.from({ length: 40 }, (_, i) => paid(`bad${i}`, T0 - 10 * DAY - i * MIN)), ...Array.from({ length: 30 }, (_, i) => paid(`ok${i}`, T0 - DAY - i * MIN))];
    const { io } = shop(orders, { found: (o) => !o.id.startsWith("bad") });
    await run(io, T0, { limit: 40 });
    await run(io, T0 + 15 * MIN, { limit: 40 });
    await run(io, T0 + 30 * MIN, { limit: 40 });
    // Every healthy order got its check although 40 failing ones sort "oldest" by check time.
    expect(new Set(io.checked).size).toBe(30);
    // With room to spare, the failing ones are still tried on each sweep (as before).
    io.tried = [];
    await run(io, T0 + 45 * MIN, { limit: 40 });
    expect(io.tried.filter((id) => id.startsWith("bad"))).toHaveLength(40);
  });

  it("a check whose refund/dispute update failed is tried again on the next sweep", async () => {
    const { io } = shop([paid("a", T0 - DAY)]);
    io.check = async (order) => { io.tried.push(order.id); throw new Error("transaction contention"); };
    await run(io, T0).catch(() => {});
    expect(io.record.orders.a[1]).toBe(0);
    expect(dueOrderIds(readState(io.record).orders, T0 + 15 * MIN)).toEqual(["a"]);
  });

  it("saves the record by the stop time even when a check is still waiting on Stripe", async () => {
    const { io } = shop([paid("a", T0 - DAY), paid("b", T0 - 2 * DAY)]);
    io.check = async (order, onChecked) => { if (order.id === "a") return new Promise(() => {}); onChecked(); };
    const started = Date.now();
    const result = await runReversalChecks(io, { now: () => T0, stopBy: T0 + 50, batch: 5 });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(result.checked).toBe(1);
    expect(io.record.orders.b[1]).toBe(T0);
    expect(io.record.orders.a[1]).toBe(0);
  });

  it("over three days of sweeps every watched order is checked on time", async () => {
    // Payments arrive at irregular times; some are refunded through the webhook partway.
    const { io, db } = shop(Array.from({ length: 120 }, (_, i) => paid(`p${i}`, T0 - (i * 17 + 3) * HOUR)));
    const lastCheck = new Map();
    const firstSeen = new Map();
    let worstGap = 0, worstFirst = 0;
    for (let t = T0, n = 0; t < T0 + 3 * DAY; t += 15 * MIN, n++) {
      if (n % 7 === 3) db.set(`new${n}`, paid(`new${n}`, t - 4 * MIN));
      if (n === 50) { db.get("p3").paymentStatus = "refunded"; db.get("p3").refund = { provider: "paypal" }; }
      io.checked = [];
      await run(io, t);
      for (const id of io.checked) {
        if (lastCheck.has(id)) worstGap = Math.max(worstGap, t - lastCheck.get(id));
        else firstSeen.set(id, t);
        lastCheck.set(id, t);
      }
    }
    for (const [id, t] of firstSeen) if (id.startsWith("new")) worstFirst = Math.max(worstFirst, t - Date.parse(db.get(id).paidAt));
    expect(worstGap).toBeLessThanOrEqual(6 * HOUR + 15 * MIN);
    expect(worstFirst).toBeLessThanOrEqual(15 * MIN);
    for (const [id, o] of db) if (o.paymentStatus === "paid" && Date.parse(o.paidAt) > T0 - 120 * DAY + 3 * DAY) expect(lastCheck.has(id)).toBe(true);
    expect(io.stamped).toEqual([]);
  });
});
