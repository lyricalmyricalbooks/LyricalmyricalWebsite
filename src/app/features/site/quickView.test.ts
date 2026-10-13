import { describe, expect, it } from "vitest";
import { quickViewBlurb, quickViewNeedsPage } from "./QuickView";

describe("quick view", () => {
  it("sends books that need a choice to their page", () => {
    expect(quickViewNeedsPage({ variants: [{}, {}] })).toBe(true);
    expect(quickViewNeedsPage({ addOns: [{ id: "a" }] })).toBe(true);
    expect(quickViewNeedsPage({ productType: "giftCard" })).toBe(true);
    expect(quickViewNeedsPage({ variants: [{}] })).toBe(false);
  });
  it("shows plain text cut on a word", () => {
    expect(quickViewBlurb({ description: "<p>Hello&nbsp;<b>world</b></p>" })).toBe("Hello world");
    const long = quickViewBlurb({ description: "word ".repeat(100) }, 50);
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(51);
  });
});
