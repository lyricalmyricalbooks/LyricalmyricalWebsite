// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { applyFavicon, faviconFor } from "./favicon";

describe("favicon", () => {
  beforeEach(() => { document.head.innerHTML = ""; });

  it("adds the shop's icon to a page that has none (e.g. Track order opened from an email)", () => {
    applyFavicon({ faviconUrl: "https://example.com/icon.png" });
    expect(document.querySelector("link[rel~='icon']")?.getAttribute("href")).toBe("https://example.com/icon.png");
  });

  it("updates the existing icon link instead of adding another", () => {
    applyFavicon({ faviconUrl: "https://example.com/a.png" });
    applyFavicon({ faviconUrl: "https://example.com/b.png" });
    const links = document.querySelectorAll("link[rel~='icon']");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("https://example.com/b.png");
  });

  it("leaves the page alone when no icon is set", () => {
    applyFavicon({});
    applyFavicon(undefined);
    expect(document.querySelector("link[rel~='icon']")).toBeNull();
  });

  it("uses the catalog page's own icon when one is set there", () => {
    expect(faviconFor({ faviconUrl: "https://x/root.png", storefront: { faviconUrl: "https://x/shop.png" } })).toBe("https://x/shop.png");
    expect(faviconFor({ faviconUrl: " https://x/root.png " })).toBe("https://x/root.png");
  });
});
