import { describe, expect, it } from "vitest";
import { catalogPageSize, nextShown, visibleCount } from "./catalogPaging";

describe("catalog paging", () => {
  it("is off unless a positive page size is set", () => {
    expect(catalogPageSize({})).toBe(0);
    expect(catalogPageSize({ catalogPageSize: "" })).toBe(0);
    expect(catalogPageSize({ catalogPageSize: -4 })).toBe(0);
    expect(catalogPageSize({ catalogPageSize: "12" })).toBe(12);
    expect(catalogPageSize({ catalogPageSize: 500 })).toBe(96);
  });
  it("shows every book when off", () => {
    expect(visibleCount(40, 0, 0)).toBe(40);
  });
  it("shows one page, then one more page per press, never past the total", () => {
    expect(visibleCount(40, 12, 0)).toBe(12);
    expect(nextShown(40, 12, 12)).toBe(24);
    expect(nextShown(40, 12, 36)).toBe(40);
    expect(visibleCount(5, 12, 0)).toBe(5);
  });
});
