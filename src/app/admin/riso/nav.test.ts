import { describe, expect, it } from "vitest";
import { NAV, PAGE_COPY } from "./nav";

describe("admin navigation", () => {
  it("lists the primary modules in order", () => {
    expect(NAV.map((n) => n.id)).toEqual(["overview", "orders", "customers", "inventory", "catalog", "discounts", "giftCards", "reviews", "messages", "settings"]);
  });

  it("has unique ids across modules and settings children", () => {
    const ids = [...NAV.map((n) => n.id), ...NAV.flatMap((n) => (n.children || []).map((c) => `settings-${c.id}`))];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps nested Settings navigation (general, shipping, payments, taxes, design, notifications, email sender)", () => {
    const settings = NAV.find((n) => n.id === "settings");
    expect(settings?.children?.map((c) => c.id)).toEqual(["general", "shipping", "payments", "taxes", "designer", "notifications", "communications"]);
  });

  it("has a title and description for every module", () => {
    for (const n of NAV) {
      expect(PAGE_COPY[n.id]?.title, n.id).toBeTruthy();
      expect(PAGE_COPY[n.id]?.description, n.id).toBeTruthy();
    }
  });
});
