import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Search engines follow only <a href>: every section that shows books must link each one to its page,
// so the home page (built from these sections) passes links to the books, not just click handlers.

const { StaticRouter } = await import("react-router");
const { CurrencyProvider } = await import("../CurrencyContext");
const { CartProvider } = await import("../CartContext");
const Sections: Record<string, any> = await import("./SectionComponents");

const BOOKS = [
  { id: "b1", slug: "salt-water", title: "Salt Water", retailPrice: 30, stockLevel: 5, status: "published", isFeatured: true, categories: ["Poetry"], photos: [{ url: "https://example.com/1.jpg" }] },
  { id: "b2", slug: "night-ink", title: "Night Ink", retailPrice: 12, stockLevel: 3, status: "published", categories: ["Zines"], photos: [{ url: "https://example.com/2.jpg" }] },
];
const wrap = (child: any) => renderToStaticMarkup(h(StaticRouter, { location: "/" }, h(CurrencyProvider, null, h(CartProvider, null, child))));
const render = (type: string, settings: any = {}) => wrap(h(Sections[type], { settings: { __sectionId: "s1", ...settings }, books: BOOKS, enableAnimations: false, onProductClick: () => {} }));

describe("book sections link to book pages", () => {
  it.each(["ProductGridHeaderSection", "ProductShowcaseGridSection", "FeaturedCollectionSection"])("%s links every book", (type) => {
    const html = render(type);
    expect(html).toContain('href="/books/salt-water"');
    expect(html).toContain('href="/books/night-ink"');
  });
  it("the staff notes table links each title", () => {
    const html = render("StaffNotesTableSection", { items: [{ slug: "salt-water", note: "A favourite" }] });
    expect(html).toContain('<a href="/books/salt-water">Salt Water</a>');
  });
  it.each(["FeaturedProductSection", "BookSpotlightSection"])("%s links the book's title", (type) => {
    expect(render(type)).toMatch(/<a href="\/books\/(salt-water|night-ink)">(Salt Water|Night Ink)<\/a>/);
  });
  it("never nests a link inside a button or a link", () => {
    for (const type of ["ProductGridHeaderSection", "ProductShowcaseGridSection", "FeaturedCollectionSection", "FeaturedProductSection", "BookSpotlightSection"]) {
      const html = render(type);
      expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*<a /s);
      expect(html).not.toMatch(/<a [^>]*>(?:(?!<\/a>).)*<a /s);
    }
  });
});
