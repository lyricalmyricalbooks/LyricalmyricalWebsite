import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./trackingGuard", () => ({ trackingAllowed: vi.fn(async () => true) }));
import { trackingAllowed } from "./trackingGuard";
import { __resetGa4ForTests, cleanMeasurementId, configureGa4, ga4Event, ga4Items, isUntrackedPath, purchaseEvent } from "./ga4";

const flush = () => new Promise(r => setTimeout(r, 0));

describe("ga4 helpers", () => {
  it("accepts only GA4 measurement IDs", () => {
    expect(cleanMeasurementId(" g-abc123xyz ")).toBe("G-ABC123XYZ");
    expect(cleanMeasurementId("UA-12345-1")).toBe("");
    expect(cleanMeasurementId("123456789")).toBe("");
  });
  it("never counts admin pages", () => {
    expect(isUntrackedPath("/admin")).toBe(true);
    expect(isUntrackedPath("/shop/admin/orders")).toBe(true);
    expect(isUntrackedPath("/studio-fixture.html")).toBe(true);
    expect(isUntrackedPath("/books/administration")).toBe(false);
  });
  it("builds a CAD purchase from the stored order, never for test orders", () => {
    const order = { orderId: "LM-1", total: 41.5, tax: 2, shipping: 9, appliedDiscount: { code: "LAUNCH" }, items: [{ id: "b1", title: "Salt", price: 15.25, quantity: 2, variantName: "Signed" }] };
    expect(purchaseEvent("x", order)).toEqual({
      transaction_id: "LM-1", currency: "CAD", value: 41.5, tax: 2, shipping: 9, coupon: "LAUNCH",
      items: [{ item_id: "b1", item_name: "Salt", price: 15.25, quantity: 2, item_variant: "Signed" }],
    });
    expect(purchaseEvent("x", { ...order, isTest: true })).toBeNull();
    expect(purchaseEvent("x", { ...order, sandboxPayment: true })).toBeNull();
    expect(ga4Items([null, { title: "no id" }])).toEqual([]);
  });
});

describe("ga4 loading", () => {
  beforeEach(() => {
    __resetGa4ForTests();
    (globalThis as any).window = { location: { pathname: "/", href: "https://shop.test/" }, addEventListener: vi.fn(), localStorage: { getItem: () => null } };
    (globalThis as any).document = { head: { appendChild: vi.fn() }, createElement: () => ({}), title: "Shop" };
  });

  it("sends queued events once configured and allowed", async () => {
    ga4Event("page_view", { page_title: "Home" });
    configureGa4("G-TEST1234");
    await flush();
    const w = (globalThis as any).window;
    expect((globalThis as any).document.head.appendChild).toHaveBeenCalledTimes(1);
    expect(w.dataLayer.some((args: any) => args[0] === "event" && args[1] === "page_view")).toBe(true);
  });

  it("loads nothing when the visit may not be counted", async () => {
    vi.mocked(trackingAllowed).mockResolvedValueOnce(false);
    configureGa4("G-TEST1234");
    ga4Event("page_view");
    await flush();
    expect((globalThis as any).document.head.appendChild).not.toHaveBeenCalled();
  });

  it("stays off without a valid ID", async () => {
    configureGa4("not-an-id");
    ga4Event("page_view");
    await flush();
    expect((globalThis as any).document.head.appendChild).not.toHaveBeenCalled();
  });
});
