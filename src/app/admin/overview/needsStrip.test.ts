import { describe, expect, it } from "vitest";
import { tabCountsFor } from "../ordersTable";
import { addressKey, queueOf } from "../fulfillment";
import { lowestInStock, needsAction, needsCalm, needsItems, orderNeeds, type NeedsInput } from "./needsStrip";

const none: NeedsInput = { toPack: 0, toShip: 0, requests: 0, reviews: 0, messages: 0, lowest: null, soldOut: 0 };

describe("Needs you strip", () => {
  it("lists only jobs that are waiting, in working order, with the right words", () => {
    const items = needsItems({ ...none, toPack: 4, toShip: 1, reviews: 2, messages: 3, lowest: { title: "Night Pages", stock: 3 }, soldOut: 1 });
    expect(items.map(i => i.text)).toEqual([
      "4 orders to pack", "1 order to ship", "2 reviews to approve", "3 messages", "Night Pages: 3 left", "1 sold out",
    ]);
    expect(items.find(i => i.id === "pack")!.to).toEqual({ tab: "orders", queue: "Ready to pack" });
    expect(items.filter(i => i.warn).map(i => i.id)).toEqual(["lowest", "soldOut"]);
  });
  it("shows nothing for zero or unknown counts", () => {
    expect(needsItems(none)).toEqual([]);
    expect(needsItems({ ...none, toPack: null, messages: null })).toEqual([]);
  });
  it("offers packing first, then shipping, else no button", () => {
    expect(needsAction({ ...none, toPack: 2, toShip: 5 })?.label).toBe("Start packing");
    expect(needsAction({ ...none, toShip: 5 })).toEqual({ label: "Ship orders", to: { tab: "orders", queue: "Ready to ship" } });
    expect(needsAction(none)).toBeNull();
  });
  it("says counting, failed or calm, never a false calm", () => {
    expect(needsCalm({ ...none, toPack: null })).toBe("Counting…");
    expect(needsCalm({ ...none, messages: null, failed: true })).toBe("Some counts could not be loaded. Refresh to try again.");
    expect(needsCalm(none)).toBe("Nothing needs you right now.");
  });
  it("counts orders by the Orders tabs' own rule: archived and test orders are left out", () => {
    const base = { paymentStatus: "paid", status: "paid", items: [{ id: "b", quantity: 1 }], customer: { address: { street: "1 A St", city: "Toronto", state: "ON", zip: "M5V 1A1", country: "CA" } } };
    const paid = { ...base, operations: { addressReviewed: addressKey(base) } };
    expect(queueOf(paid)).toBe("Ready to pack");
    const orders = [
      { ...paid, id: "a" },
      { ...paid, id: "archived", archivedAt: "2026-11-01T00:00:00Z" },
      { ...paid, id: "test", isTest: true },
      { ...paid, id: "asked", customerRequest: { status: "open" } },
      { ...paid, id: "asked-archived", archivedAt: "2026-11-01T00:00:00Z", customerRequest: { status: "open" } },
    ];
    const n = orderNeeds(orders);
    const tabs = tabCountsFor(orders, { orderType: "production", range: "all", query: "" });
    expect(n.toPack).toBe(1);
    expect(n.toPack).toBe(tabs["Ready to pack"]);
    expect(n.toShip).toBe(tabs["Ready to ship"]);
    expect(n.requests).toBe(1);
    expect(orderNeeds(null)).toEqual({ toPack: null, toShip: null, requests: null });
  });
  it("names the closest title that still has copies, never one at 0", () => {
    expect(lowestInStock([{ title: "Gone", stock: 0 }, { title: "Night Pages", stock: 3 }])).toEqual({ title: "Night Pages", stock: 3 });
    expect(lowestInStock([{ title: "Gone", stock: 0 }])).toBeNull();
  });
});
