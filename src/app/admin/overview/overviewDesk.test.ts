import { describe, expect, it } from "vitest";
import {
  axisDays, biggestOrder, chartScale, dayLabel, deskNeeds, deskOrderPill, initials, plainPhrase, revenueLine, revenuePill,
  revenueSteps, tileDelta, wholeMoney,
} from "./overviewDesk";
import { totals } from "./overviewInsights";
import { money } from "./OverviewParts";
import { addressKey, packingKey } from "../fulfillment";
import type { Range } from "./overviewRange";

const range: Range = { preset: "7d", compare: "previous", startKey: "2026-11-05", endKey: "2026-11-11", prevStartKey: "2026-10-29", prevEndKey: "2026-11-04", days: 7, phrase: "the last 7 days", before: "the 7 days before" };
const order = (id: string, day: string, total: number, extra: Record<string, unknown> = {}) => ({
  id, orderId: `#${id}`, createdAt: `${day}T17:00:00.000Z`, paymentStatus: "paid", total, items: [{ id: "b", title: "Book", quantity: 2 }],
  customer: { name: "Mara Ellison", address: { street: "1 Main", city: "Toronto", state: "ON", zip: "M6G3H1", country: "Canada" } }, ...extra,
}) as any;

describe("Daily desk: revenue tile", () => {
  it("adds revenue up day by day for the period and the one before", () => {
    const s = revenueSteps([order("1", "2026-11-06", 60), order("2", "2026-11-10", 360), order("0", "2026-10-31", 160)], range);
    expect(s.days).toHaveLength(7);
    expect(s.now).toEqual([0, 60, 60, 60, 60, 420, 420]);
    expect(s.before.at(-1)).toBe(160);
  });
  it("rounds the chart's top up to four even steps", () => {
    expect(chartScale(420)).toEqual({ top: 480, ticks: [0, 120, 240, 360, 480] });
    expect(chartScale(0).top).toBe(100);
  });
  it("labels four days across the period", () => {
    const days = Array.from({ length: 30 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
    expect(axisDays(days).map(d => d.label)).toEqual(["1 Oct", "11 Oct", "20 Oct", "30 Oct"]);
    expect(dayLabel("2026-11-10")).toBe("10 Nov");
  });
  it("puts the biggest order on a sticker", () => {
    const days = revenueSteps([], range).days;
    expect(biggestOrder([order("1001", "2026-11-06", 60), order("1002", "2026-11-10", 360)], days)).toEqual({ id: "1002", index: 5, label: "#1002 · CA$360 · 10 Nov" });
    expect(biggestOrder([], days)).toBeNull();
  });
  it("says what moved revenue, by the factor that moved the same way", () => {
    const cur = totals([order("a", "2026-11-06", 210), order("b", "2026-11-07", 210)]);
    const prev = totals([order("c", "2026-10-30", 160), order("d", "2026-10-31", 160)]);
    expect(revenueLine(cur, prev, "the last 7 days", "the 7 days before", money)).toBe("Up from CA$320.00, thanks to bigger baskets: CA$210.00 an order, up from CA$160.00.");
    // More orders but much smaller baskets: the fall is explained by the baskets, never "more orders".
    const down = totals([order("e", "2026-11-06", 20), order("f", "2026-11-07", 20), order("g", "2026-11-08", 20)]);
    expect(revenueLine(down, prev, "the last 7 days", "the 7 days before", money)).toMatch(/^Down from CA\$320\.00, with smaller baskets/);
    expect(revenueLine(totals([]), totals([]), "the last 7 days", "the 7 days before", money)).toBe("Revenue shows here as soon as a customer pays.");
  });
  it("shows the change as a pill, New when nothing came before", () => {
    expect(revenuePill(420, 320)).toEqual({ dir: "up", text: "31%" });
    expect(revenuePill(300, 320)).toEqual({ dir: "down", text: "6%" });
    expect(revenuePill(420, 0)).toEqual({ dir: "up", text: "New" });
  });
});

describe("Daily desk: tiles and words", () => {
  it("formats big tile money in whole dollars", () => {
    expect(wholeMoney(210)).toBe("CA$210");
    expect(wholeMoney(1240.6)).toBe("CA$1,241");
    expect(plainPhrase("the last 30 days")).toBe("last 30 days");
  });
  it("describes a tile's move", () => {
    expect(tileDelta(2, 1, "count", money)).toEqual({ dir: "up", text: "1 more" });
    expect(tileDelta(1, 3, "count", money)).toEqual({ dir: "down", text: "2 fewer" });
    expect(tileDelta(210, 160, "money", money)).toEqual({ dir: "up", text: "CA$50.00" });
    expect(tileDelta(5, 5, "count", money).dir).toBe("same");
  });
  it("turns names into initials", () => {
    expect(initials("Mara Ellison")).toBe("ME");
    expect(initials("jon@example.com")).toBe("JO");
    expect(initials("")).toBe("?");
  });
});

describe("Daily desk: Needs you", () => {
  const base = { toPack: 2, toShip: 1, requests: 1, reviews: 1, messages: 0, lowest: { title: "Tidal Notes", stock: 3 }, soldOut: 0 };
  it("puts packing in Next up and lists the other jobs; the low-stock line isn't a job", () => {
    const d = deskNeeds(base);
    expect(d.next).toMatchObject({ id: "pack", text: "2 orders to pack", action: "Start packing" });
    expect(d.rows.map(r => r.id)).toEqual(["ship", "requests", "reviews", "lowest"]);
    expect(d.rows.find(r => r.id === "lowest")).toMatchObject({ text: "Tidal Notes: 3 left", action: "Reprint", warn: true });
    expect(d.open).toBe(5);
  });
  it("falls back to shipping, then to no Next up", () => {
    expect(deskNeeds({ ...base, toPack: 0 }).next?.id).toBe("ship");
    expect(deskNeeds({ ...base, toPack: 0, toShip: 0 }).next).toBeNull();
  });
  it("says nothing is open only once every count is in", () => {
    expect(deskNeeds({ toPack: null, toShip: null, requests: null, reviews: null, messages: null, lowest: null, soldOut: null }).open).toBeNull();
    expect(deskNeeds({ toPack: 0, toShip: 0, requests: 0, reviews: 0, messages: 0, lowest: null, soldOut: 0 }).open).toBe(0);
  });
});

describe("Daily desk: newest orders", () => {
  it("names the next step by the Orders queues", () => {
    const o = order("1", "2026-11-10", 50);
    o.operations = { addressReviewed: addressKey(o) };
    expect(deskOrderPill(o)).toEqual({ tone: "warn", text: "Ready to pack" });
    o.operations.packed = packingKey(o);
    expect(deskOrderPill(o)).toEqual({ tone: "info", text: "Ready to ship" });
    expect(deskOrderPill({ ...o, fulfillmentStatus: "shipped" })).toEqual({ tone: "neutral", text: "Shipped" });
    expect(deskOrderPill({ ...o, paymentStatus: "refunded" })).toEqual({ tone: "bad", text: "Refunded" });
  });
});
