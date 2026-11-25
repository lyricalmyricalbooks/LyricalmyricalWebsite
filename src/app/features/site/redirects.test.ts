import { describe, expect, it } from "vitest";
import { cleanRedirects, findRedirect, normalizePath, normalizeTarget, parseRedirectLines, redirectProblem, redirectsAfterMove } from "./redirects";

describe("redirects", () => {
  it("normalises old addresses", () => {
    expect(normalizePath("/Books/Old-Title/?x=1#y")).toBe("/books/old-title");
    expect(normalizePath("books/a")).toBe("/books/a");
    expect(normalizePath("https://x.com/a")).toBe("");
    expect(normalizePath("//evil.com")).toBe("");
  });
  it("accepts only on-site paths and https targets", () => {
    expect(normalizeTarget("books/new")).toBe("/books/new");
    expect(normalizeTarget("https://example.com/a")).toBe("https://example.com/a");
    expect(normalizeTarget("javascript:alert(1)")).toBe("");
    expect(normalizeTarget("http://example.com")).toBe("");
    expect(normalizeTarget("//evil.com")).toBe("");
  });
  it("refuses home, shop routes, duplicates, self and loops", () => {
    const list = [{ from: "/a", to: "/b" }];
    expect(redirectProblem({ from: "/", to: "/x" }, [])).toMatch(/home/);
    expect(redirectProblem({ from: "/checkout", to: "/x" }, [])).toMatch(/shop itself/);
    expect(redirectProblem({ from: "/a", to: "/c" }, list)).toMatch(/already/);
    expect(redirectProblem({ from: "/z", to: "/Z/" }, [])).toMatch(/same/);
    expect(redirectProblem({ from: "/b", to: "/a" }, list)).toMatch(/loop/);
    expect(redirectProblem({ from: "/c", to: "/a" }, list)).toBe("");
  });
  it("cleans a stored list", () => {
    expect(cleanRedirects([{ from: "/A", to: "/b" }, { from: "/a", to: "/c" }, { from: "/b", to: "/a" }, null, { from: "x", to: "javascript:1" }]))
      .toEqual([{ from: "/a", to: "/b" }]);
  });
  it("finds a redirect ignoring case, slash and home", () => {
    const list = [{ from: "/books/old", to: "/books/new" }];
    expect(findRedirect(list, "/Books/Old/")).toBe("/books/new");
    expect(findRedirect(list, "/books/other")).toBeNull();
    expect(findRedirect(list, "/")).toBeNull();
    expect(findRedirect(null, "/books/old")).toBeNull();
  });
  it("parses pasted lines", () => {
    const r = parseRedirectLines("from,to\n/a, /b\n/c\t/d\nnonsense\n/b, /a", []);
    expect(r.added).toEqual([{ from: "/a", to: "/b" }, { from: "/c", to: "/d" }]);
    expect(r.skipped.map(s => s.line)).toEqual(["nonsense", "/b, /a"]);
  });
  it("forwards a book's old address after it moves (Shopify's Create a URL redirect)", () => {
    expect(redirectsAfterMove([], "/books/old", "/books/new")).toEqual([{ from: "/books/old", to: "/books/new" }]);
    // An older redirect that ended at the old address now ends at the new one: one hop, no chain.
    expect(redirectsAfterMove([{ from: "/product/x", to: "/books/old" }], "/books/old", "/books/new"))
      .toEqual([{ from: "/product/x", to: "/books/new" }, { from: "/books/old", to: "/books/new" }]);
    // Moving back drops the redirect away from the address the book lives at again.
    expect(redirectsAfterMove([{ from: "/books/old", to: "/books/new" }], "/books/new", "/books/old"))
      .toEqual([{ from: "/books/new", to: "/books/old" }]);
    // External destinations are left alone.
    expect(redirectsAfterMove([{ from: "/press", to: "https://example.com/books/old" }], "/books/old", "/books/new"))
      .toEqual([{ from: "/press", to: "https://example.com/books/old" }, { from: "/books/old", to: "/books/new" }]);
    expect(redirectsAfterMove([{ from: "/books/old", to: "/books/new" }], "/books/old", "/books/new")).toBeNull();
    expect(redirectsAfterMove([], "/books/a", "/Books/A/")).toBeNull();
    expect(redirectsAfterMove([], "/", "/books/a")).toBeNull();
  });
});
