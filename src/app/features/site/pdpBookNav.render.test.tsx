// @vitest-environment jsdom
// Previous / next book links (Studio › Style › Book page · photos & layout › showPdpBookNav) on the product page:
// off by default, and when on they follow the shop grid's order.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";

const site = vi.hoisted(() => ({ data: {} as any, cart: [] as any[], opened: 0 }));

vi.mock("./useSiteData", () => ({ useSiteData: () => site.data, useLiveDesign: () => site.data.settings?.design || {} }));
vi.mock("../../CartContext", async (orig) => ({ ...(await orig() as any), useCart: () => ({ addToCart: () => true, setIsCartOpen: () => { site.opened++; }, cartCount: site.cart.length, cart: site.cart }) }));
vi.mock("../../../lib/firebase", () => ({ db: {}, auth: {} }));
vi.mock("./shippingProfilesLoad", () => ({ loadShippingProfiles: async () => [{ id: "p", freeShippingOver: 75, zones: [] }] }));
vi.mock("../../lib/seo", () => ({ useSEO: () => {} }));
vi.mock("../../lib/reviews", () => ({ reviewsApi: { listApproved: async () => [], summary: async () => null } }));
vi.mock("../../lib/commerce", () => ({ funnelApi: new Proxy({}, { get: () => () => {} }) }));
vi.mock("../../components/sectionRender", () => ({ TemplateSections: () => null, GlobalSections: () => null, SectionList: () => null }));
vi.mock("./RecentlyViewedRow", () => ({ default: () => null }));
vi.mock("./ReviewsSection", () => ({ default: () => null }));
vi.mock("./StoreHeader", () => ({ StoreHeader: () => null }));
vi.mock("./StoreFooter", () => ({ StoreFooter: () => null }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).fetch = () => Promise.reject(new Error("offline"));

const { default: BookDetail } = await import("./BookDetail");
const { CurrencyProvider } = await import("../../CurrencyContext");

const book = { id: "pb", slug: "pb", title: "Printed Book", status: "published", format: "Paperback", stockLevel: 4, trackInventory: true, retailPrice: 30, photos: [{ id: "p", url: "https://example.com/1.jpg" }] };
async function page(design: any, shown: any = book, books: any[] = [shown]) {
  site.data = { books, settings: { design, policies: {}, info: {} }, pages: [], loading: false, fresh: true };
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root: Root = createRoot(el);
  await act(async () => {
    root.render(h(MemoryRouter, { initialEntries: [`/books/${shown.slug}`] },
      h(CurrencyProvider, null, h(Routes, null, h(Route, { path: "/books/:slug", element: h(BookDetail) })))));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return { el, done: async () => { await act(async () => root.unmount()); el.remove(); } };
}

const nav = (el: HTMLElement) => el.querySelector('[data-studio-region="productBookNav"], .fm-pdp-booknav');
const other = (id: string, createdAt: string) => ({ ...book, id, slug: id, title: `Book ${id}`, createdAt });
const shelf = [other("a", "2026-03-01"), { ...book, createdAt: "2026-02-01" }, other("c", "2026-01-01")];

it("is off by default", async () => {
  const { el, done } = await page({}, book, shelf);
  expect(nav(el)).toBeNull();
  await done();
});

it("links the books either side in the shop's order when switched on", async () => {
  const { el, done } = await page({ showPdpBookNav: true }, book, shelf);
  const links = [...nav(el)!.querySelectorAll("a")];
  expect(links.map(a => a.getAttribute("href"))).toEqual(["/books/a", "/books/c"]);
  expect(nav(el)!.textContent).toMatch(/Previous book.*Book a.*Next book.*Book c/);
  await done();
});

it("draws nothing for the only book in the shop", async () => {
  const { el, done } = await page({ showPdpBookNav: true });
  expect(nav(el)).toBeNull();
  await done();
});
