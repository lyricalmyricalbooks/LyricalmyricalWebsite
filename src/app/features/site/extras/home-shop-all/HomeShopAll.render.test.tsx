import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import { HomeShopAll } from "./HomeShopAll";

const render = (design: any) => renderToStaticMarkup(h(StaticRouter, { location: "/" }, h(HomeShopAll, { design })));

describe("Shop all books link on the home page", () => {
  it("is on by default and links to every book", () => {
    const html = render({});
    expect(html).toMatch(/<a [^>]*href="\/collections\/all"[^>]*><span data-studio-copy="homeShopAll">Shop all books<\/span><\/a>/);
    expect(html).toContain('data-store-region="homeShopAll"');
  });
  it("uses the owner's words", () => {
    expect(render({ copy: { homeShopAll: "Browse the archive" } })).toContain("Browse the archive");
  });
  it("hides when switched off or the words are cleared", () => {
    expect(render({ showHomeShopAll: false })).toBe("");
    expect(render({ copy: { homeShopAll: "  " } })).toBe("");
  });
});
