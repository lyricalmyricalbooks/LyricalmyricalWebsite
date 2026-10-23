import { describe, expect, it } from "vitest";
import { bookNeighbours, bookLinkSlug } from "./bookNeighbours";

const b = (id: string, extra: any = {}) => ({ id, title: id, status: "published", createdAt: `2026-0${extra.m || 1}-01`, ...extra });

describe("bookNeighbours", () => {
  it("follows the shop's Featured order (newest first) without wrapping", () => {
    const books = [b("old", { m: 1 }), b("mid", { m: 2 }), b("new", { m: 3 })];
    expect(bookNeighbours(books[1], books)).toEqual({ prev: books[2], next: books[0] });
    expect(bookNeighbours(books[2], books)).toEqual({ prev: undefined, next: books[1] });
    expect(bookNeighbours(books[0], books)).toEqual({ prev: books[1], next: undefined });
  });

  it("skips drafts and keeps to the book's shop category", () => {
    const poetry = { id: "poetry", name: "POETRY" };
    const books = [b("p1", { m: 3, categories: ["POETRY"] }), b("x", { m: 2 }), b("draft", { m: 2, status: "draft", categories: ["POETRY"] }), b("p2", { m: 1, categories: ["POETRY"] })];
    expect(bookNeighbours(books[0], books, { category: poetry, categories: [poetry] })).toEqual({ prev: undefined, next: books[3] });
  });

  it("puts sold-out books last when the shop does", () => {
    const gone = b("gone", { m: 3, trackInventory: true, stockLevel: 0 });
    const books = [gone, b("a", { m: 2, retailPrice: 5 }), b("z", { m: 1, retailPrice: 5 })];
    expect(bookNeighbours(books[2], books, { soldOutLast: true }).next).toBe(gone);
  });

  it("gives nothing for a missing book or one not in the list", () => {
    expect(bookNeighbours(undefined, [b("a")])).toEqual({});
    expect(bookNeighbours(b("nope"), [b("a")])).toEqual({});
    expect(bookLinkSlug({ id: "id1" })).toBe("id1");
    expect(bookLinkSlug({ id: "id1", slug: "s" })).toBe("s");
  });
});
