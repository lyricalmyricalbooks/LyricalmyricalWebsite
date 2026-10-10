// The admin page lives in the address bar (`/admin#orders/<id>`, `/admin#settings/payments`), so a reload,
// the browser Back/Forward buttons and a copied link all land on the same page. Pure and tested.
// Studio links (`#designer?…`) are read by `parseStudioLocation`; gift-card links keep `#gift-cards/<id>`.

export type AdminRoute = { tab: string; settingsTab?: string; orderId?: string; giftCardId?: string };

export const ADMIN_TABS = ["overview", "analytics", "orders", "customers", "inventory", "catalog", "discounts", "giftCards", "reviews", "messages", "settings"] as const;
/** Old Settings page ids that now open another page (Email sender was merged into the one email page). */
export const SETTINGS_TAB_ALIASES: Record<string, string> = { communications: "notifications" };
/** The Settings page an id really opens (an alias resolves to its page). */
export const settingsPageOf = (id: string): string => SETTINGS_TAB_ALIASES[id] || id;

export const SETTINGS_TABS = ["general", "shipping", "payments", "notifications", "taxes", "communications", "designer"] as const;

const TABS = new Set<string>(ADMIN_TABS);
const SETTINGS = new Set<string>(SETTINGS_TABS);
const decode = (v: string) => { try { return decodeURIComponent(v); } catch { return v; } };

/** Read an admin hash. Studio (`#designer…`) and unknown hashes return null. */
export function routeFromHash(hash: string): AdminRoute | null {
  const h = hash.replace(/^#/, "").split("?")[0];
  if (!h) return null;
  const [head, rest] = [h.split("/")[0], h.split("/").slice(1).join("/")];
  if (head === "gift-cards") return { tab: "giftCards", ...(rest ? { giftCardId: decode(rest) } : {}) };
  if (head === "orders") return { tab: "orders", ...(rest ? { orderId: decode(rest) } : {}) };
  if (head === "settings") {
    const sub = SETTINGS.has(rest) && rest !== "designer" ? settingsPageOf(rest) : "general";
    return { tab: "settings", settingsTab: sub };
  }
  // Shipping and Payments can also be top-level tabs; they are Settings pages.
  if (head === "shipping" || head === "payments") return { tab: "settings", settingsTab: head };
  if (TABS.has(head)) return { tab: head };
  return null;
}

/** The hash for the page on screen. Studio returns `#designer` (its own links add the query). */
export function hashForRoute(r: AdminRoute): string {
  if (r.tab === "shipping" || r.tab === "payments") return `#settings/${r.tab}`;
  if (r.tab === "settings") return r.settingsTab === "designer" ? "#designer" : `#settings/${r.settingsTab || "general"}`;
  if (r.tab === "orders") return r.orderId ? `#orders/${encodeURIComponent(r.orderId)}` : "#orders";
  if (r.tab === "giftCards") return "#gift-cards";
  return `#${TABS.has(r.tab) ? r.tab : "overview"}`;
}

/** Same page, only a different order open? Then the address is replaced instead of adding a Back step. */
export function sameSection(a: string, b: string): boolean {
  const orders = (h: string) => /^#?orders(\/|$)/.test(h);
  return orders(a) && orders(b);
}

/** Browser-tab title for the page on screen. */
export function adminDocumentTitle(pageTitle: string): string {
  return `${pageTitle} · Lyricalmyrical admin`;
}
