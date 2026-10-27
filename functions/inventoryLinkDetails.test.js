// Book details in step, and one search (docs/INVENTORY_LINK.md › Book details in step, and one search).
import { describe, test, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fakeDb, fakeStore, resetClock } from "./inventoryLink.fakes.mjs";
const require = createRequire(import.meta.url);
const link = require("./inventoryLink");
const jobs = require("./inventoryLinkJobs");
const { inventoryLinkAdmin } = require("./inventoryLinkAdmin");

let now = new Date("2026-10-27T15:00:00Z");
const deps = (db, store) => ({ db, store, now: () => now, sumNet: async () => 0, adminUrl: "https://shop.example/admin" });
const stateOf = db => db.docs["systemStatus/inventoryLink"].data;
beforeEach(() => { resetClock(); now = new Date("2026-10-27T15:00:00Z"); });

describe("the rule both apps share", () => {
  test("matches docs/link-details-fixture.json (the same file is in the inventory app)", () => {
    const fixture = JSON.parse(readFileSync(new URL("../docs/link-details-fixture.json", import.meta.url), "utf8"));
    expect(link.detailDifferences(fixture.input.linked, fixture.input.appBooks)).toEqual(fixture.expected);
  });
  test("tidies values the same way for every field", () => {
    expect(link.detailValue("title", "  A   B ")).toBe("A B");
    expect(link.detailValue("isbn", "978-1 23")).toBe("978123");
    expect(link.detailValue("isbn", "—")).toBe("");
    expect(link.detailValue("price", 40)).toBe("40.00");
    expect(link.detailValue("price", "0")).toBe("");
  });
});

const BOOKS = [
  { id: "b1", title: "The Hound", subtitle: "Ana Lee", isbn: "1111111111", retailPrice: 65 },
  { id: "b2", title: "Signed set", variants: [{ id: "s", name: "Signed", price: 90, isbn: "2222222222" }, { id: "u", name: "Unsigned", price: 60 }] },
  { id: "b3", title: "Loose", retailPrice: 10 },
];
const LINKS = { b1: { _: "hound" }, b2: { s: "set", u: "set" } };

describe("the website's linked editions", () => {
  test("one row per matched printed edition, with how many share the app book", () => {
    const rows = link.linkedForApp(BOOKS, LINKS);
    expect(rows.map(r => [r.key, r.inventoryBookId, r.sharedWith, r.price])).toEqual([
      ["b2|s", "set", 2, 90], ["b2|u", "set", 2, 60], ["b1|", "hound", 1, 65],
    ]);
    expect(rows[2]).toMatchObject({ title: "The Hound", author: "Ana Lee", isbn: "1111111111" });
  });
  test("the patch Use the app's writes: the right field, on the edition when it has its own", () => {
    expect(link.detailPatch(BOOKS[0], { field: "author", app: "Ana Lee, ill. Bo" })).toEqual({ subtitle: "Ana Lee, ill. Bo" });
    expect(link.detailPatch(BOOKS[0], { field: "price", app: "70.00" })).toEqual({ retailPrice: 70 });
    const isbn = link.detailPatch(BOOKS[1], { field: "isbn", variantId: "s", app: "3333333333" });
    expect(isbn.variants[0]).toMatchObject({ id: "s", isbn: "3333333333", price: 90 });
    expect(link.detailPatch(BOOKS[1], { field: "price", variantId: "u", app: "65.00" }).variants[1].price).toBe(65);
    expect(link.detailPatch(BOOKS[0], { field: "title", app: "" })).toBeNull();
    expect(link.detailPatch(BOOKS[1], { field: "price", variantId: "gone", app: "5.00" })).toBeNull();
  });
  test("the app's books for the admin search", () => {
    expect(link.appBookIndex([{ id: "hound", title: "The Hound", isbn: "—" }, { id: "bad id!", title: "x" }]))
      .toEqual([{ id: "hound", title: "The Hound", author: "", isbn: "" }]);
  });
});

const APP = [
  { id: "hound", title: "The Hound", author: "Ana Lee, ill. Bo", isbn: "1111111111", price: 70, currency: "CAD" },
  { id: "set", title: "Signed set", author: "", isbn: "", price: 75, currency: "CAD" },
];
const seed = extra => fakeDb({
  "systemStatus/inventoryLink": { links: LINKS, connection: { ok: true }, ...extra },
  ...Object.fromEntries(BOOKS.map(({ id, ...b }) => [`books/${id}`, b])),
});

describe("the sweep", () => {
  test("hands the app the linked editions and keeps the differences and the search list", async () => {
    const db = seed();
    const store = fakeStore();
    store.catalog = APP;
    store.appDoc = {};
    await jobs.runSweep(deps(db, store));
    expect(store.shopCatalog.linked.map(r => r.key)).toEqual(["b2|s", "b2|u", "b1|"]);
    expect(stateOf(db).detailDiffs.items.map(d => d.id)).toEqual(["hound|author", "hound|price"]);
    expect(stateOf(db).appBookIndex.items.map(b => b.id)).toEqual(["hound", "set"]);
  });
  test("a detail copied in the admin brings the next check forward", async () => {
    const db = seed({ matchCheckedAt: "2026-10-27T14:50:00Z", detailsDirty: true });
    const store = fakeStore();
    store.catalog = APP;
    store.appDoc = {};
    await jobs.runSweep(deps(db, store));
    expect(store.shopCatalog).not.toBeNull();
    expect(stateOf(db).detailsDirty).toBe(false);
  });
});

describe("admin: details that differ", () => {
  test("Use the app's copies one field after checking the values are still the ones shown", async () => {
    const db = seed();
    const store = fakeStore();
    store.catalog = APP;
    const check = await inventoryLinkAdmin(deps(db, store), { op: "checkDetails" });
    const price = check.body.detailDiffs.items.find(d => d.field === "price");
    expect(price).toMatchObject({ shop: "65.00", app: "70.00", bookId: "b1" });
    const stale = await inventoryLinkAdmin(deps(db, store), { op: "applyDetail", id: price.id, signature: JSON.stringify(["60.00", "70.00"]) });
    expect(stale.status).toBe(409);
    const res = await inventoryLinkAdmin(deps(db, store), { op: "applyDetail", id: price.id, signature: link.detailSignature(price) });
    expect(res.status).toBe(200);
    expect(db.docs["books/b1"].data.retailPrice).toBe(70);
    expect(db.docs["books/b1"].data.subtitle).toBe("Ana Lee");
    expect(stateOf(db).detailDiffs.items.map(d => d.id)).toEqual(["hound|author"]);
    expect(stateOf(db).detailsDirty).toBe(true);
  });
  test("refuses when the app has changed its value meanwhile", async () => {
    const db = seed();
    const store = fakeStore();
    store.catalog = APP;
    const { body } = await inventoryLinkAdmin(deps(db, store), { op: "checkDetails" });
    const author = body.detailDiffs.items.find(d => d.field === "author");
    store.catalog = [{ ...APP[0], author: "Ana Lee" }, APP[1]];
    const res = await inventoryLinkAdmin(deps(db, store), { op: "applyDetail", id: author.id, signature: link.detailSignature(author) });
    expect(res.status).toBe(409);
    expect(db.docs["books/b1"].data.subtitle).toBe("Ana Lee");
  });
  test("Leave as is remembers the pair of values", async () => {
    const db = seed({ detailDiffs: { at: "x", items: [{ id: "hound|author" }, { id: "gone|title" }] }, keptDetails: { "old|price": "[]" } });
    const res = await inventoryLinkAdmin(deps(db, fakeStore()), { op: "keepDetail", id: "hound|author", signature: "[\"a\",\"b\"]" });
    expect(res.status).toBe(200);
    expect(stateOf(db).keptDetails).toEqual({ "hound|author": "[\"a\",\"b\"]" });
  });
});
