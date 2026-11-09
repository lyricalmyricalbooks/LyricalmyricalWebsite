import { describe, expect, it } from "vitest";
import { trendWords } from "./trendWords";

const money = (n: number) => `CA$${n.toFixed(2)}`;

describe("headline figures in words", () => {
  it("says how much money moved", () => {
    expect(trendWords(412, 316, { kind: "money", before: "yesterday", money })).toEqual({ text: "CA$96.00 more than yesterday", dir: "up", tone: "good" });
    expect(trendWords(100, 150, { kind: "money", before: "the 7 days before", money }).text).toBe("CA$50.00 less than the 7 days before");
  });
  it("uses fewer for counts and keeps the tone the right way round", () => {
    expect(trendWords(7, 9, { kind: "count", before: "yesterday" })).toEqual({ text: "2 fewer than yesterday", dir: "down", tone: "bad" });
    expect(trendWords(7, 9, { kind: "count", before: "yesterday", goodWhen: "down" }).tone).toBe("good");
    expect(trendWords(9, 7, { kind: "count", before: "yesterday", goodWhen: "neutral" }).tone).toBe("neutral");
  });
  it("names the old rate for percentages", () => {
    expect(trendWords(2.8, 3.4, { kind: "percent", before: "yesterday" }).text).toBe("Down from 3.4%");
    expect(trendWords(3.44, 3.41, { kind: "percent", before: "yesterday" }).text).toBe("Same as yesterday");
  });
  it("says same when nothing moved, and survives a missing number", () => {
    expect(trendWords(5, 5, { kind: "count", before: "yesterday" })).toEqual({ text: "Same as yesterday", dir: "same", tone: "neutral" });
    expect(trendWords(NaN, 0, { kind: "count", before: "yesterday" }).text).toBe("Same as yesterday");
  });
});
