import { describe, test, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { fakeDb, fakeStore, resetClock } from "./inventoryLink.fakes.mjs";
const { inventoryLinkAdmin } = createRequire(import.meta.url)("./inventoryLinkAdmin");

const now = new Date("2026-10-11T15:00:00Z");
const deps = (db, store) => ({ db, store, now: () => now, sumNet: async () => 0 });
const state = db => db.docs["systemStatus/inventoryLink"]?.data || {};
beforeEach(() => resetClock());

describe("inventory link admin actions", () => {
  test("check connection saves the answer, including 'not granted yet'", async () => {
    const db = fakeDb({});
    const store = fakeStore();
    store.connected = false;
    const res = await inventoryLinkAdmin(deps(db, store), { op: "check" });
    expect(res.body.connection).toMatchObject({ ok: false, problem: "not-granted" });
    store.connected = true;
    await inventoryLinkAdmin(deps(db, store), { op: "check" });
    expect(state(db).connection.ok).toBe(true);
  });

  test("links are validated against both catalogs and saved whole", async () => {
    const db = fakeDb({
      "books/b1": { title: "The Hound", format: "Paperback" },
      "books/e": { title: "E", format: "Ebook" },
      "systemStatus/inventoryLink": { links: { old: { _: "altrove" } } },
    });
    const res = await inventoryLinkAdmin(deps(db, fakeStore()), { op: "saveLinks", links: { b1: { _: "hound" }, e: { _: "altrove" } } });
    expect(res.status).toBe(200);
    expect(res.body.links).toEqual({ b1: { _: "hound" } });
    expect(res.body.errors[0].reason).toMatch(/E-books/);
    expect(state(db).links).toEqual({ b1: { _: "hound" } }); // the removed "old" link is gone
  });

  test("matches can always be taken away, even while the inventory app can't be reached", async () => {
    const db = fakeDb({
      "books/b1": { title: "The Hound", format: "Paperback" },
      "systemStatus/inventoryLink": { startDay: "2026-10-01", links: { b1: { _: "hound" } } },
    });
    const store = fakeStore();
    store.readCatalog = async () => { throw new Error("PERMISSION_DENIED"); };
    const res = await inventoryLinkAdmin(deps(db, store), { op: "saveLinks", links: {} });
    expect(res.status).toBe(200);
    expect(state(db).links).toEqual({});
    expect(state(db).relinkPending).toBeUndefined();
    // Adding a match still needs the inventory app's book list.
    expect((await inventoryLinkAdmin(deps(db, store), { op: "saveLinks", links: { b1: { _: "hound" } } })).status).toBe(409);
  });

  test("new matches restart sending orders with unmatched copies from the beginning", async () => {
    const db = fakeDb({ "books/b1": { title: "The Hound", format: "Paperback" }, "systemStatus/inventoryLink": { startDay: "2026-10-01", relinkCursor: "O-9" } });
    await inventoryLinkAdmin(deps(db, fakeStore()), { op: "saveLinks", links: { b1: { _: "hound" } } });
    expect(state(db)).toMatchObject({ relinkPending: true, relinkCursor: null });
  });

  test("sales start once, only after the connection works, never on a future day", async () => {
    const db = fakeDb({});
    const store = fakeStore();
    expect((await inventoryLinkAdmin(deps(db, store), { op: "startSales", startDay: "2026-10-01" })).status).toBe(409);
    await inventoryLinkAdmin(deps(db, store), { op: "check" });
    expect((await inventoryLinkAdmin(deps(db, store), { op: "startSales", startDay: "2026-10-12" })).status).toBe(400);
    const res = await inventoryLinkAdmin(deps(db, store), { op: "startSales", startDay: "2026-10-01" });
    expect(res.status).toBe(200);
    expect(state(db)).toMatchObject({ startDay: "2026-10-01" });
    const again = await inventoryLinkAdmin(deps(db, store), { op: "startSales", startDay: "2026-09-01" });
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/can't change/);
  });

  test("automatic stock needs one confirmed apply first; rehearsal lasts a day", async () => {
    const db = fakeDb({ "systemStatus/inventoryLink": {} });
    expect((await inventoryLinkAdmin(deps(db, fakeStore()), { op: "setOptions", autoSync: true })).status).toBe(409);
    await inventoryLinkAdmin(deps(db, fakeStore()), { op: "setOptions", rehearsal: true });
    expect(state(db).rehearsalUntil).toBe("2026-10-12T15:00:00.000Z");
    db.docs["systemStatus/inventoryLink"].data.firstApplyAt = "x";
    expect((await inventoryLinkAdmin(deps(db, fakeStore()), { op: "setOptions", autoSync: true })).status).toBe(200);
  });

  test("status shows what the panel needs and hides the run lease", async () => {
    const db = fakeDb({
      "systemStatus/inventoryLink": { startDay: "2026-10-01", lease: { until: "2026-10-11T15:02:00Z", runId: "r" } },
      "orders/t": { isTest: true, paymentStatus: "paid", paidAt: "2026-09-01T12:00:00Z" },
      "orders/a": { paymentStatus: "paid", paidAt: "2026-09-03T12:00:00Z" },
      "inventoryPushes/a": { delivered: false, unlinkedCount: 1 },
    });
    const res = await inventoryLinkAdmin(deps(db, fakeStore()), { op: "status" });
    expect(res.body).toMatchObject({ earliestPaidDay: "2026-09-03", busy: true, undelivered: 1, unlinkedOrders: 1, today: "2026-10-11" });
    expect(res.body.state.lease).toBeUndefined();
    expect(res.body.serviceAccount).toMatch(/compute@/);
  });

  test("apply needs a preview", async () => {
    expect((await inventoryLinkAdmin(deps(fakeDb({}), fakeStore()), { op: "apply" })).status).toBe(400);
  });
});
