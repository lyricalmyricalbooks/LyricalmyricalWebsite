// @vitest-environment jsdom
// Books › edit › Search (SEO) › Heading above the description: one <h2> over the description, in every details layout.
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
async function page(design: any, shown: any = book, footerBadges: string[] = []) {
  site.data = { books: [shown], settings: { design: { footerBadges, ...design }, policies: {}, info: {} }, pages: [], loading: false, fresh: true };
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


const described = { ...book, description: "A ride across America.\n\n### On the road\nNight buses.", aboutHeading: "  A photobook about Greyhound bus journeys " };
const h2s = (el: HTMLElement) => [...el.querySelectorAll("h2")].map((h) => h.textContent);

it("adds nothing while the heading is blank", async () => {
  const { el, done } = await page({}, { ...described, aboutHeading: "" });
  expect(el.querySelector(".fm-pdp-desc-lead")).toBeNull();
  await done();
});

for (const productDetailsLayout of ["tabs", "accordions", "sections"]) {
  it(`puts the heading once above the description (${productDetailsLayout})`, async () => {
    const { el, done } = await page({ productDetailsLayout }, described);
    const lead = el.querySelectorAll(".fm-pdp-desc-lead");
    expect(lead.length).toBe(1);
    expect(lead[0].tagName).toBe("H2");
    expect(lead[0].textContent).toBe("A photobook about Greyhound bus journeys");
    expect(h2s(el)).toContain("A photobook about Greyhound bus journeys");
    // It sits before the description's own (h3) headings.
    const h3 = el.querySelector(".fm-pdp-desc-heading:not(.fm-pdp-desc-lead)");
    if (h3) expect(lead[0].compareDocumentPosition(h3) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await done();
  });
}

it("shows no heading over an empty description", async () => {
  const { el, done } = await page({}, { ...described, description: "" });
  expect(el.querySelector(".fm-pdp-desc-lead")).toBeNull();
  await done();
});
