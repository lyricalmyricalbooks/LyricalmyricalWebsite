import { describe, expect, it } from "vitest";
import { ratingCountKey, ratingLine } from "./pdpRating";

describe("book page star rating", () => {
  it("shows nothing without approved reviews or with a broken summary", () => {
    expect(ratingLine(null)).toBeNull();
    expect(ratingLine({ count: 0, average: 0 })).toBeNull();
    expect(ratingLine({ count: 3, average: NaN })).toBeNull();
    expect(ratingLine({ count: "x", average: 4 })).toBeNull();
  });

  it("rounds the stars to half steps and the figure to one decimal", () => {
    expect(ratingLine({ count: 12, average: 4.26 })).toEqual({ average: 4.26, shown: "4.3", count: 12, stars: [1, 1, 1, 1, 0.5] });
    expect(ratingLine({ count: 1, average: 5 })!.stars).toEqual([1, 1, 1, 1, 1]);
    expect(ratingLine({ count: 2, average: 2.2 })!.stars).toEqual([1, 1, 0, 0, 0]);
    expect(ratingLine({ count: 2, average: 9 })!.shown).toBe("5.0");
  });

  it("says one review in the singular", () => {
    expect(ratingCountKey(1)).toBe("pdpRatingCountOne");
    expect(ratingCountKey(4)).toBe("pdpRatingCount");
  });
});
