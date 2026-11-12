import { describe, expect, it } from "vitest";
import { NAV, PAGE_COPY, sidebarItems } from "./nav";

describe("admin navigation", () => {
  it("lists the primary modules in order", () => {
    expect(NAV.map((n) => n.id)).toEqual(["overview", "orders", "customers", "inventory", "catalog", "discounts", "giftCards", "reviews", "messages", "design", "settings"]);
  });

  it("has unique ids across modules and settings children", () => {
    const ids = [...NAV.map((n) => n.id), ...NAV.flatMap((n) => (n.children || []).map((c) => `settings-${c.id}`))];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps nested Settings navigation (general, shipping, payments, taxes, email sender)", () => {
    const settings = NAV.find((n) => n.id === "settings");
    expect(settings?.children?.map((c) => c.id)).toEqual(["general", "shipping", "payments", "taxes", "notifications"]);
    // Notifications and Email sender are one page, listed once as "Email sender".
    expect(settings?.children?.find((c) => c.id === "notifications")?.label).toBe("Email sender");
  });

  it("has a title and description for every module", () => {
    for (const n of NAV) {
      expect(PAGE_COPY[n.id]?.title, n.id).toBeTruthy();
      expect(PAGE_COPY[n.id]?.description, n.id).toBeTruthy();
    }
  });
});

describe("sidebar items", () => {
  it("lists every module once, Settings as one entry with its pages inside (redesign, 10 November 2026)", () => {
    const items = sidebarItems(NAV);
    expect(items.map((i) => i.id)).toEqual(NAV.map((n) => n.id));
    expect(items.find((i) => i.id === "settings")?.children?.length).toBeGreaterThan(0);
  });

  it("groups the pages under Sell, Promote and Shop after Overview (bento shell, 12 November 2026)", () => {
    const heads = NAV.filter((n) => n.section).map((n) => [n.section, n.id]);
    expect(heads).toEqual([["Sell", "orders"], ["Promote", "discounts"], ["Shop", "design"]]);
  });
});
