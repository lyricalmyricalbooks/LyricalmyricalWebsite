// @vitest-environment jsdom
// Star rating under the title (Studio › Style › Book page · photos & layout › showPdpRatingStars): off by default;
// when on it shows the approved-review summary and opens the Reviews tab; nothing for a book with no reviews.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";

const site = vi.hoisted(() => ({ data: {} as any }));
const reviews = vi.hoisted(() => ({ summary: null as any }));
vi.mock("./useSiteData", () => ({ useSiteData: () => site.data, useLiveDesign: () => site.data.settings?.design || {} }));
vi.mock("../../CartContext", async (orig) => ({ ...(await orig() as any), useCart: () => ({ addToCart: () => true, setIsCartOpen: () => {}, cartCount: 0, cart: [] }) }));
vi.mock("../../../lib/firebase", () => ({ db: {}, auth: {} }));
vi.mock("./shippingProfilesLoad", () => ({ loadShippingProfiles: async () => [] }));
vi.mock("../../lib/seo", () => ({ useSEO: () => {} }));
vi.mock("../../lib/reviews", () => ({ reviewsApi: { listApproved: async () => [], summary: async () => reviews.summary } }));
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
async function page(design: any) {
  site.data = { books: [book], settings: { design, policies: {}, info: {} }, pages: [], loading: false, fresh: true };
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root: Root = createRoot(el);
  await act(async () => {
    root.render(h(MemoryRouter, { initialEntries: ["/books/pb"] },
      h(CurrencyProvider, null, h(Routes, null, h(Route, { path: "/books/:slug", element: h(BookDetail) })))));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return { el, done: async () => { await act(async () => root.unmount()); el.remove(); } };
}
const line = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-store-region="productRating"]');

it("is off by default", async () => {
  reviews.summary = { count: 12, average: 4.26 };
  const { el, done } = await page({});
  expect(line(el)).toBeNull();
  await done();
});

it("shows nothing for a book without approved reviews", async () => {
  reviews.summary = { count: 0, average: 0 };
  const { el, done } = await page({ showPdpRatingStars: true });
  expect(line(el)).toBeNull();
  await done();
});

it("shows the stars, average and count, and opens the Reviews tab", async () => {
  reviews.summary = { count: 12, average: 4.26 };
  const { el, done } = await page({ showPdpRatingStars: true });
  const b = line(el)!;
  expect(b.tagName).toBe("BUTTON");
  expect(b.textContent).toContain("4.3");
  expect(b.textContent).toContain("(12 reviews)");
  expect(b.getAttribute("aria-label")).toBe("Rated 4.3 out of 5 from 12 reviews");
  expect(b.querySelectorAll(".fm-pdp-rating-star")).toHaveLength(5);
  expect(el.querySelector("#pdp-tab-reviews")?.getAttribute("aria-selected")).toBe("false");
  await act(async () => { b.click(); });
  expect(el.querySelector("#pdp-tab-reviews")?.getAttribute("aria-selected")).toBe("true");
  await done();
});

it("says one review in the singular", async () => {
  reviews.summary = { count: 1, average: 5 };
  const { el, done } = await page({ showPdpRatingStars: true });
  expect(line(el)!.textContent).toContain("(1 review)");
  await done();
});
