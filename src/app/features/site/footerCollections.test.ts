import { describe, expect, it } from "vitest";
import { footerCollectionItems } from "./footerNavigation";
import { resolveHref } from "./storeMenu";

const categories = [
  { id: "cat-0-publications", name: "PUBLICATIONS", showInNav: true },
  { id: "books", name: "Books", showInNav: true, parentId: "cat-0-publications" },
  { id: "zines", name: "Zines", showInNav: true, parentId: "cat-0-publications" },
  { id: "hidden", name: "Archive", showInNav: false },
];

describe("footer Collections group", () => {
  it("lists every category shown in the menu, sub-categories after their parent, each linking to its collection", () => {
    const items = footerCollectionItems({ categories });
    expect(items.map(i => i.label)).toEqual(["PUBLICATIONS", "Books", "Zines"]);
    expect(items.map(resolveHref)).toEqual(["/collections/publications", "/collections/books", "/collections/zines"]);
  });
  it("is empty when switched off or there are no categories", () => {
    expect(footerCollectionItems({ categories, showFooterCollections: false })).toEqual([]);
    expect(footerCollectionItems({})).toEqual([]);
  });
  it("accepts plain-name categories", () => {
    expect(footerCollectionItems({ categories: ["Zines"] }).map(i => resolveHref(i))).toEqual(["/collections/zines"]);
  });
});
