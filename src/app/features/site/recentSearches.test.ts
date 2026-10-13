import { describe, expect, it } from "vitest";
import { addRecentSearch } from "./recentSearches";

describe("addRecentSearch", () => {
  it("puts the newest search first and drops repeats in any capitalisation", () => {
    expect(addRecentSearch(["poetry", "novel"], "Novel")).toEqual(["novel", "poetry"]);
  });
  it("keeps at most the limit", () => {
    expect(addRecentSearch(["a1", "b2", "c3"], "d4", 3)).toEqual(["d4", "a1", "b2"]);
  });
  it("ignores email-like, long-number and too-short terms", () => {
    expect(addRecentSearch(["poetry"], "me@example.com")).toEqual(["poetry"]);
    expect(addRecentSearch(["poetry"], "4111 1111 1111 1111")).toEqual(["poetry"]);
    expect(addRecentSearch(["poetry"], "a")).toEqual(["poetry"]);
  });
});
