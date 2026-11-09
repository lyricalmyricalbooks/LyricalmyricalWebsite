import { describe, expect, it } from "vitest";
import { needsAction, needsItems, needsLoading, type NeedsInput } from "./needsStrip";

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
  it("is loading until the order and message counts arrive", () => {
    expect(needsLoading({ ...none, toPack: null })).toBe(true);
    expect(needsLoading(none)).toBe(false);
  });
});
