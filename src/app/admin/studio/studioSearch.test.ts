import { describe, expect, it } from "vitest";
import { buildStudioIndex, normalizeSearchText, searchStudio } from "./studioSearch";
import { STYLE_GROUPS } from "./styleSchema";
import { COPY_SCHEMA } from "../../features/site/storeCopy";

const index = buildStudioIndex({
  styleGroups: STYLE_GROUPS,
  copySchema: COPY_SCHEMA,
  templates: [{ id: "heroPage", label: "Home" }, { id: "productPage", label: "Product page" }, { id: "page:about", label: "About", pageSlug: "about" }],
  pages: [{ slug: "about", title: "About us", status: "published" }, { slug: "about", title: "dupe" }],
  sectionsByTemplate: {
    heroPage: [{ id: "s1", type: "HeroSection", visible: true, settings: { title: "Spring list" } }],
    __global: [{ id: "g1", type: "AnnouncementBar", visible: false, settings: {} }],
  },
  sectionLabel: (t) => (t === "HeroSection" ? "Hero Banner" : t),
});

describe("normalizeSearchText", () => {
  it("splits camelCase keys and unifies spellings", () => {
    expect(normalizeSearchText("pdpCardBg")).toBe("pdp card bg");
    expect(normalizeSearchText("Page Colour")).toBe("page color");
  });
});

describe("searchStudio", () => {
  it("returns shortcuts for an empty query", () => {
    const r = searchStudio(index, "");
    expect(r.length).toBeGreaterThan(5);
    expect(r.every((e) => ["action", "area", "page"].includes(e.kind))).toBe(true);
  });

  it("finds actions by their on-screen name and by plain words", () => {
    expect(searchStudio(index, "publish")[0].target).toEqual({ type: "action", id: "publish" });
    expect(searchStudio(index, "go live").some((e) => e.target.type === "action" && e.target.id === "publish")).toBe(true);
  });

  it("requires every typed word to match", () => {
    expect(searchStudio(index, "publish zzzqqq")).toEqual([]);
  });

  it("finds Style controls through British spelling and synonyms", () => {
    const r = searchStudio(index, "background colour");
    expect(r.some((e) => e.target.type === "style" && e.target.key === "backgroundColor")).toBe(true);
    // "phone" finds phone-sized settings via the mobile synonym
    expect(searchStudio(index, "phone").some((e) => e.target.type === "action" && e.target.id === "device-mobile")).toBe(true);
  });

  it("finds shopper text by its label and its current default wording", () => {
    const sample = COPY_SCHEMA[0].fields[0];
    const hit = searchStudio(index, sample.label).find((e) => e.target.type === "copy" && e.target.key === sample.key);
    expect(hit).toBeTruthy();
    expect(hit!.where).toContain("Text & labels");
  });

  it("lists pages once and the sections on each page", () => {
    expect(searchStudio(index, "about").filter((e) => e.target.type === "page")).toHaveLength(1);
    const sec = searchStudio(index, "spring").find((e) => e.kind === "section");
    expect(sec?.target).toEqual({ type: "section", templateId: "heroPage", sectionId: "s1" });
    expect(searchStudio(index, "announcement")[0].where).toContain("hidden");
  });

  it("ranks a title that starts with the query above looser hits", () => {
    const r = searchStudio(index, "save draft");
    expect(r[0].title).toBe("Save draft");
  });

  it("caps the number of results", () => {
    expect(searchStudio(index, "color", { limit: 5 }).length).toBeLessThanOrEqual(5);
  });
});

describe("search index size", () => {
  it("indexes each element setting once, not once per screen size, and still finds phone settings", async () => {
    const { buildStudioIndex, searchStudio } = await import("./studioSearch");
    const { STYLE_GROUPS } = await import("./styleSchema");
    const { COPY_SCHEMA } = await import("../../features/site/storeCopy");
    const index = buildStudioIndex({ templates: [], pages: [], sectionsByTemplate: {}, sectionLabel: (t: string) => t, styleGroups: STYLE_GROUPS, copySchema: COPY_SCHEMA } as any);
    const all = STYLE_GROUPS.reduce((n, g) => n + g.fields.length, 0);
    const styleEntries = index.filter(e => e.kind === "style").length;
    expect(styleEntries).toBeLessThan(all / 2);
    expect(index.some(e => /Mobile|Tablet/.test(e.id) && e.id.startsWith("style:") && e.id.includes("regions."))).toBe(false);
    expect(searchStudio(index, "newsletter button phone padding", { limit: 10 }).some(r => r.id.includes("regions.newsletterButton"))).toBe(true);
  });
});

describe("command palette 2.0", () => {
  it("offers selection commands first, then recent results, then shortcuts, before typing", async () => {
    const { paletteGroups, contextCommands } = await import("./studioSearch");
    const context = contextCommands({ section: { id: "s1", label: "Hero Banner", visible: true, first: true, last: false } });
    const groups = paletteGroups(index, "", { context, recent: ["section:s1", "missing-id"] });
    expect(groups.map(g => g.title)).toEqual(["For what you selected", "Recent", "Shortcuts"]);
    expect(groups[0].entries.map(e => e.title)).toContain("Duplicate this section");
    // The first section can't move up; the recent list drops results that no longer exist.
    expect(groups[0].entries.some(e => e.title === "Move this section up")).toBe(false);
    expect(groups[1].entries.map(e => e.id)).toEqual(["section:s1"]);
  });

  it("> lists commands only and searches them", async () => {
    const { paletteGroups } = await import("./studioSearch");
    const all = paletteGroups(index, ">").flatMap(g => g.entries);
    expect(all.length).toBeGreaterThan(5);
    expect(all.every(e => e.kind === "action" || e.kind === "area")).toBe(true);
    const pub = paletteGroups(index, "> publish").flatMap(g => g.entries);
    expect(pub[0].title).toBe("Publish to the live shop");
    expect(paletteGroups(index, "> footer color").flatMap(g => g.entries).every(e => e.kind !== "style")).toBe(true);
  });

  it("shows the keyboard shortcut a command shares with the key handler", async () => {
    const { contextCommands } = await import("./studioSearch");
    expect(index.find(e => e.id === "action:save")?.keys).toBe("Ctrl/⌘ S");
    expect(index.find(e => e.id === "action:device-mobile")?.keys).toBe("3");
    const dup = contextCommands({ section: { id: "s", label: "x", visible: true, first: false, last: false } }).find(e => e.title === "Duplicate this section");
    expect(dup?.keys).toBe("Ctrl/⌘ D");
  });

  it("finds page parts and books by name", async () => {
    const { buildStudioIndex, searchStudio } = await import("./studioSearch");
    const idx = buildStudioIndex({ styleGroups: [], copySchema: [], templates: [], pages: [], sectionsByTemplate: {}, sectionLabel: t => t,
      elements: [{ key: "r:buyCard", label: "Buy card", where: "This page › Page" }],
      books: [{ slug: "night-pages", title: "Night Pages", author: "A. Writer" }, { slug: "night-pages", title: "dupe" }] });
    expect(searchStudio(idx, "buy card")[0]).toMatchObject({ kind: "element", target: { type: "element", key: "r:buyCard" } });
    expect(searchStudio(idx, "writer").map(e => e.id)).toEqual(["book:night-pages"]);
  });

  it("reads the screen size a query asks for", async () => {
    const { searchedDevice } = await import("./studioSearch");
    expect(searchedDevice("newsletter button phone padding")).toBe("mobile");
    expect(searchedDevice("Tablet gap")).toBe("tablet");
    expect(searchedDevice("price colour")).toBeNull();
  });

  it("remembers recent picks newest first without repeats", async () => {
    const { pushRecent } = await import("./studioSearch");
    expect(pushRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    expect(pushRecent(["a", "b"], "z", 2)).toEqual(["z", "a"]);
  });
});

describe("book results use the storefront's collision-safe routes", () => {
  it("lists books with shared or missing slugs under the route the preview resolves", async () => {
    const { buildStudioIndex } = await import("./studioSearch");
    const { resolveProductRoutes } = await import("../../features/site/productRoutes");
    const books = resolveProductRoutes([
      { id: "b1", slug: "night", title: "Night" }, { id: "b2", slug: "night", title: "Night (2nd)" }, { id: "b3", title: "No Slug Yet" },
    ]);
    const idx = buildStudioIndex({ styleGroups: [], copySchema: [], templates: [], pages: [], sectionsByTemplate: {}, sectionLabel: t => t, books });
    expect(idx.filter(e => e.kind === "book").map(e => (e.target as any).slug)).toEqual(["b1", "b2", "no-slug-yet"]);
  });
});

describe("block commands (Block library 3.0)", () => {
  it("offers add, copy and paste only when they apply", async () => {
    const { contextCommands } = await import("./studioSearch");
    const section = { id: "s", label: "Flexible composition", visible: true, first: true, last: true };
    const titles = (blocks: any) => contextCommands({ section, blocks }).map(e => e.title).filter(t => /block/i.test(t));
    expect(titles({ takesBlocks: false, canPaste: false })).toEqual([]);
    expect(titles({ takesBlocks: true, canPaste: false })).toEqual(["Add a block to this section"]);
    expect(titles({ takesBlocks: true, blockLabel: "Text", canPaste: true })).toEqual([
      "Add a block to this section", "Copy the selected block (Text)", "Paste the copied block here",
    ]);
  });
});
