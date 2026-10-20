import { describe, expect, it } from "vitest";
import { ADMIN_TABS, SETTINGS_TABS, adminDocumentTitle, hashForRoute, keepsSubTab, routeFromHash, sameSection, settingsPageOf } from "./adminRoute";

describe("admin route ↔ hash", () => {
  it("round-trips every page", () => {
    for (const tab of ADMIN_TABS.filter((t) => t !== "settings")) {
      expect(routeFromHash(hashForRoute({ tab }))).toEqual({ tab });
    }
    for (const settingsTab of SETTINGS_TABS.filter((t) => t !== "designer")) {
      expect(routeFromHash(hashForRoute({ tab: "settings", settingsTab }))).toEqual({ tab: "settings", settingsTab: settingsPageOf(settingsTab) });
    }
    // Email sender was merged into the one email page: its old address still opens it.
    expect(routeFromHash("#settings/communications")).toEqual({ tab: "settings", settingsTab: "notifications" });
  });

  it("keeps the existing email and gift-card links working", () => {
    expect(routeFromHash("#orders")).toEqual({ tab: "orders" });
    expect(routeFromHash("#orders/abc%2F12")).toEqual({ tab: "orders", orderId: "abc/12" });
    expect(routeFromHash("#gift-cards/card1")).toEqual({ tab: "giftCards", giftCardId: "card1" });
    expect(hashForRoute({ tab: "orders", orderId: "abc/12" })).toBe("#orders/abc%2F12");
  });

  it("leaves Studio links and unknown hashes alone", () => {
    expect(routeFromHash("#designer?t=productPage")).toBeNull();
    expect(routeFromHash("#nope")).toBeNull();
    expect(routeFromHash("")).toBeNull();
    expect(hashForRoute({ tab: "settings", settingsTab: "designer" })).toBe("#designer");
  });

  it("treats Shipping/Payments as Settings pages and falls back to General", () => {
    expect(hashForRoute({ tab: "shipping" })).toBe("#settings/shipping");
    expect(routeFromHash("#payments")).toEqual({ tab: "settings", settingsTab: "payments" });
    expect(routeFromHash("#settings/unknown")).toEqual({ tab: "settings", settingsTab: "general" });
    expect(routeFromHash("#settings/designer")).toEqual({ tab: "settings", settingsTab: "general" });
  });

  it("only treats a different order on the same page as the same section", () => {
    expect(sameSection("#orders", "#orders/a")).toBe(true);
    expect(sameSection("#orders/a", "#orders/b")).toBe(true);
    expect(sameSection("#orders", "#customers")).toBe(false);
    expect(sameSection("#settings/general", "#settings/payments")).toBe(false);
  });

  it("names the browser tab after the page", () => {
    expect(adminDocumentTitle("Orders")).toBe("Orders · Lyricalmyrical admin");
  });
  it("keeps the Overview's own sub tab in the address", () => {
    expect(routeFromHash("#overview/visitors/move")).toEqual({ tab: "overview" });
    expect(keepsSubTab("#overview/visitors/move", "#overview")).toBe(true);
    expect(keepsSubTab("#overview", "#overview")).toBe(false);
    expect(keepsSubTab("#overview/visitors", "#orders")).toBe(false);
  });
});
