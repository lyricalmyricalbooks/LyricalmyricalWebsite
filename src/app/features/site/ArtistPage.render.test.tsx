// @vitest-environment jsdom
// Artist pages (/artists/<slug>): the heading Google matches on the artist's name, the first line naming their books,
// real links to their books and websites, and a not-found (noindex) page only once the fresh catalog read confirms it.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const site = vi.hoisted(() => ({ data: {} as any, seo: [] as any[] }));
vi.mock("./useSiteData", () => ({ useSiteData: () => site.data, useLiveDesign: () => site.data.settings?.design || {} }));
vi.mock("../../CartContext", async (orig) => ({ ...(await orig() as any), useCart: () => ({ addToCart: () => true, setIsCartOpen: () => {}, cartCount: 0, cart: [] }) }));
vi.mock("../../../lib/firebase", () => ({ db: {}, auth: {} }));
vi.mock("../../lib/seo", () => ({ useSEO: (meta: any) => { site.seo.push(meta); } }));
vi.mock("../../lib/reviews", () => ({ reviewsApi: { listApproved: async () => [], summary: async () => null } }));
vi.mock("../../lib/commerce", () => ({ funnelApi: new Proxy({}, { get: () => () => {} }) }));
vi.mock("../../components/sectionRender", () => ({ TemplateSections: () => null, GlobalSections: () => null, SectionList: () => null }));
vi.mock("./RecentlyViewedRow", () => ({ default: () => null }));
vi.mock("./ReviewsSection", () => ({ default: () => null }));
vi.mock("./StoreHeader", () => ({ StoreHeader: () => null }));
vi.mock("./StoreFooter", () => ({ StoreFooter: () => null }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).fetch = () => Promise.reject(new Error("offline"));

const { default: ArtistPage } = await import("./ArtistPage");
const { default: ArtistsDirectoryPage } = await import("./ArtistsDirectoryPage");
const { default: BookDetail } = await import("./BookDetail");
const { CurrencyProvider } = await import("../../CurrencyContext");
const { keepPrerenderedPage, endPrerenderedHandoff } = await import("../../lib/prerenderedPage");

const BOOKS = [
  { id: "a", slug: "the-hound", title: "The Hound", subtitle: "Ian Willms", status: "published", publishDate: "2024-05-01", retailPrice: 60, stockLevel: 3,
    photos: [{ url: "https://img.example/hound.jpg", altText: "Front cover of The Hound, a route map on red cloth." }],
    artistBio: "[Ian Willms](https://www.ianwillms.com/) is a photographer from Toronto.", creatorLinks: [{ name: "Ian Willms", url: "https://www.ianwillms.com" }] },
  { id: "b", slug: "second-dog", title: "Second Dog", subtitle: "Ian Willms", status: "published", publishDate: "2026-01-01", retailPrice: 40, stockLevel: 0 },
  { id: "c", slug: "anthology", title: "Anthology", subtitle: "Various artists", status: "published", retailPrice: 20, stockLevel: 1 },
];
const design = { copy: { siteName: "Lyricalmyrical Books", notFoundTitle: "Missing-title", pageLoading: "Loading-copy" } };

let root: Root | null = null;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = null; endPrerenderedHandoff(); });

async function open(path: string, state: { books: any[]; loading?: boolean; fresh?: boolean; loadError?: any }) {
  site.seo = [];
  site.data = { settings: { design, policies: {}, info: {} }, pages: [], loading: false, fresh: true, loadError: null, retry: () => {}, ...state };
  const el = document.createElement("div");
  root = createRoot(el);
  await act(async () => {
    root!.render(h(MemoryRouter, { initialEntries: [path] }, h(CurrencyProvider, null, h(Routes, null,
      h(Route, { path: "/artists", element: h(ArtistsDirectoryPage) }),
      h(Route, { path: "/artists/:slug", element: h(ArtistPage) }),
      h(Route, { path: "/books/:slug", element: h(BookDetail) })))));
  });
  return el;
}

describe("an artist page", () => {
  it("has one H1 with the artist's name and a first line naming their books, newest first", async () => {
    const el = await open("/artists/ian-willms", { books: BOOKS });
    const h1s = el.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe("Ian Willms: photobooks");
    expect(el.querySelector('[data-store-region="artistIntro"]')?.textContent)
      .toBe("Photobooks by Ian Willms published by Lyricalmyrical Books: Second Dog and The Hound.");
    expect(el.textContent).toContain("Ian Willms is a photographer from Toronto.");
    expect(el.querySelector("[data-seo-artist]")?.getAttribute("data-seo-artist")).toBe("ian-willms");
  });

  it("links every book with a real <a href> and the artist's own site with rel=noopener", async () => {
    const el = await open("/artists/ian-willms", { books: BOOKS });
    const grid = el.querySelector('[data-store-region="artistBooks"]')!;
    expect([...grid.querySelectorAll("a")].map(a => a.getAttribute("href"))).toEqual(["/books/second-dog", "/books/the-hound"]);
    expect(grid.querySelectorAll(".fm-card .fm-card-title")).toHaveLength(2);
    const site = el.querySelector('[data-store-region="artistLinks"] a')!;
    expect(site.getAttribute("href")).toBe("https://www.ianwillms.com/");
    expect(site.getAttribute("rel")).toBe("noopener");
    expect(site.textContent).toBe("ianwillms.com");
    const crumb = el.querySelector('[data-store-region="artistBreadcrumb"]')!;
    expect(crumb.textContent).toContain("Artists");
    expect(crumb.querySelector('a[href="/artists"]')?.textContent).toBe("Artists");
  });

  it("gives Google the title, a description, a canonical address and Person + breadcrumb data", async () => {
    await open("/artists/ian-willms", { books: BOOKS });
    const seo = site.seo.at(-1);
    expect(seo.title).toBe("Ian Willms: photobooks");
    expect(seo.type).toBe("profile");
    expect(seo.noindex).toBeFalsy();
    expect(seo.url).toMatch(/\/artists\/ian-willms$/);
    // The share picture (the first book cover) is described by its own alt text, not the page title.
    expect(seo).toMatchObject({ image: "https://img.example/hound.jpg", imageAlt: "Front cover of The Hound, a route map on red cloth." });
    expect(seo.description).toBe("Photobooks by Ian Willms published by Lyricalmyrical Books: Second Dog and The Hound. Ian Willms is a photographer from Toronto.");
    const [profile, crumbs] = seo.jsonLd;
    expect(profile["@type"]).toBe("ProfilePage");
    expect(profile.mainEntity).toMatchObject({ "@type": "Person", name: "Ian Willms", sameAs: ["https://www.ianwillms.com/"], url: "https://www.ianwillms.com/" });
    expect(profile.mainEntity.workExample.map((b: any) => b.name)).toEqual(["Second Dog", "The Hound"]);
    expect(crumbs["@type"]).toBe("BreadcrumbList");
    expect(crumbs.itemListElement.map((i: any) => i.name)).toEqual(["Shop", "Artists", "Ian Willms"]);
    expect(crumbs.itemListElement[1].item).toMatch(/\/artists$/);
  });

  it("is not found (noindex) for an unknown artist once the fresh read confirms it", async () => {
    const el = await open("/artists/various-artists", { books: BOOKS });
    expect(el.querySelector("h1")?.textContent).not.toContain("photobooks");
    expect(site.seo.at(-1)).toMatchObject({ title: "Missing-title", noindex: true, notFound: true });
  });

  it("waits (indexable, never 'not found') while only the cached catalog is in", async () => {
    const el = await open("/artists/new-artist", { books: [], fresh: false });
    expect(el.textContent).toContain("Loading-copy");
    expect(site.seo.at(-1)?.noindex).toBe(false);
  });

  it("keeps the server-rendered page and its head tags while loading on the landing page", async () => {
    window.history.replaceState(null, "", "/artists/ian-willms");
    const served = document.createElement("div");
    served.innerHTML = "<main><h1>Served artist</h1></main>";
    keepPrerenderedPage(served);
    const el = await open("/artists/ian-willms", { books: [], loading: true, fresh: false });
    expect(el.textContent).toContain("Served artist");
    expect(site.seo.at(-1)?.keep).toBe(true);
  });
});

describe("the artist line on a book page", () => {
  it("links each credited name to its artist page and keeps the words as written", async () => {
    const el = await open("/books/the-hound", { books: BOOKS });
    const link = el.querySelector('a[href="/artists/ian-willms"]');
    expect(link?.textContent).toBe("Ian Willms");
    expect(link?.closest("p")?.textContent).toBe("Ian Willms");
  });

  it("links nobody for a group credit", async () => {
    const el = await open("/books/anthology", { books: BOOKS });
    expect(el.querySelector('a[href^="/artists/"]')).toBeNull();
    expect(el.textContent).toContain("Various artists");
  });
});

describe("the artists directory page", () => {
  it("lists every credited artist with links and CollectionPage structured data", async () => {
    const el = await open("/artists", { books: BOOKS });
    expect(el.querySelectorAll("h1")).toHaveLength(1);
    expect(el.querySelector("[data-seo-artists]")?.getAttribute("data-seo-artists")).toBe("ready");
    const link = el.querySelector('a[href="/artists/ian-willms"]');
    expect(link?.textContent).toContain("Ian Willms");
    const seo = site.seo.at(-1);
    expect(seo.noindex).toBe(false);
    expect(seo.url).toMatch(/\/artists$/);
    expect(seo.jsonLd[0]["@type"]).toBe("CollectionPage");
    expect(seo.jsonLd[0].mainEntity.itemListElement).toHaveLength(1);
  });
});
