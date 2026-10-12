import { describe, expect, it } from "vitest";
import {
  appliedFilters, applyCatalogControls, bookFormats, bookInStock, EMPTY_FILTERS, filterView, filtersActive, formatKey, formatsIn, priceRangeFor,
} from "./CatalogControls";

const paperback = { id: "p", title: "Zine", format: "Paperback", retailPrice: 12, stockLevel: 4, createdAt: "2026-01-01" };
const hardcover = { id: "h", title: "Atlas", format: "Hardcover", retailPrice: 45, stockLevel: 0, trackInventory: true, createdAt: "2026-02-01" };
const editions = {
  id: "e", title: "Poems", retailPrice: 0, createdAt: "2026-03-01", isbn: "978-1-23456-789-7",
  variants: [{ id: "pb", name: "Paperback", price: 20, stock: 0 }, { id: "eb", name: "E-book (EPUB)", price: 9, stock: 5 }],
};
const audio = { id: "a", title: "Spoken", format: "Audiobook", retailPrice: 15, createdAt: "2026-04-01" };
const all = [paperback, hardcover, editions, audio];

describe("format buckets", () => {
  it("files format names into the shop's format chips", () => {
    expect(formatKey("Trade paperback")).toBe("paperback");
    expect(formatKey("Hardback")).toBe("hardcover");
    expect(formatKey("E-book (PDF)")).toBe("ebook");
    expect(formatKey("Audiobook (MP3)")).toBe("audiobook");
    expect(formatKey("Risograph print")).toBe("other");
    expect(formatKey("")).toBeNull();
  });
  it("uses every edition a book is sold in", () => {
    expect(bookFormats(editions)).toEqual(["paperback", "ebook"]);
    expect(bookFormats({ format: "Paperback", isDigital: true })).toEqual(["ebook"]);
    expect(formatsIn(all)).toEqual(["paperback", "hardcover", "ebook", "audiobook"]);
  });
});

describe("in stock", () => {
  it("counts a book whose e-book edition is available, and backorders", () => {
    expect(bookInStock(editions)).toBe(true);
    expect(bookInStock(hardcover)).toBe(false);
    expect(bookInStock({ ...hardcover, allowBackorder: true })).toBe(true);
    expect(applyCatalogControls(all, "", "newest", true, [0, Infinity]).map(b => b.id)).toEqual(["a", "e", "p"]);
  });
});

describe("price and format filters", () => {
  it("filters and sorts edition-only books by their cheapest edition", () => {
    expect(applyCatalogControls(all, "", "price_asc", false, [0, Infinity]).map(b => b.id)).toEqual(["e", "p", "a", "h"]);
    expect(applyCatalogControls(all, "", "newest", false, priceRangeFor({ ...EMPTY_FILTERS, minPrice: "10", maxPrice: "20" })).map(b => b.id)).toEqual(["a", "p"]);
  });
  it("sorts oldest first and on-sale books first", () => {
    const books = [
      { id: "old", createdAt: "2020-01-01", retailPrice: 10 },
      { id: "mid", createdAt: "2021-01-01", retailPrice: 10, isOnSale: true, salePrice: 5 },
      { id: "new", createdAt: "2022-01-01", retailPrice: 10 },
    ];
    expect(applyCatalogControls(books, "", "oldest", false, [0, Infinity]).map(b => b.id)).toEqual(["old", "mid", "new"]);
    expect(applyCatalogControls(books, "", "sale", false, [0, Infinity]).map(b => b.id)).toEqual(["mid", "new", "old"]);
  });
  it("reads Min/Max in the shopper's currency", () => {
    // 1 CAD = 0.5 shown units: "6" shown means 12 CAD.
    const [min, max] = priceRangeFor({ ...EMPTY_FILTERS, minPrice: "6", maxPrice: "6" }, 0.5);
    expect(min).toBeLessThanOrEqual(12);
    expect(max).toBeGreaterThanOrEqual(12);
    expect(priceRangeFor({ ...EMPTY_FILTERS, minPrice: "abc", maxPrice: "-3" })).toEqual([0, Infinity]);
  });
  it("keeps books matching any chosen format", () => {
    expect(applyCatalogControls(all, "", "newest", false, [0, Infinity], ["ebook", "audiobook"]).map(b => b.id)).toEqual(["a", "e"]);
  });
  it("searches ISBNs too", () => {
    expect(applyCatalogControls(all, "978-1-23456", "newest", false, [0, Infinity]).map(b => b.id)).toEqual(["e"]);
  });
  it("never applies a filter the current view doesn't show", () => {
    const onlyPaperbacks = [paperback, { ...paperback, id: "p2", retailPrice: 12 }];
    const view = filterView(onlyPaperbacks);
    expect(view).toEqual({ availableFormats: ["paperback"], showPrice: false });
    const applied = appliedFilters({ formats: ["ebook"], minPrice: "100", maxPrice: "" }, view);
    expect(applied).toEqual({ formats: [], priceRange: [0, Infinity] });
    expect(filterView(all).showPrice).toBe(true);
    expect(appliedFilters({ formats: ["ebook", "other"], minPrice: "", maxPrice: "" }, filterView(all)).formats).toEqual(["ebook"]);
  });
  it("knows when there is anything to clear", () => {
    expect(filtersActive(EMPTY_FILTERS)).toBe(false);
    expect(filtersActive(EMPTY_FILTERS, " ")).toBe(false);
    expect(filtersActive(EMPTY_FILTERS, "", true)).toBe(true);
    expect(filtersActive({ ...EMPTY_FILTERS, maxPrice: "20" })).toBe(true);
  });
});
