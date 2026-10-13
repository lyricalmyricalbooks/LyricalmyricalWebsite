// Google Analytics 4 on the storefront. The measurement ID ("G-…") is set in Settings › General › Google Analytics
// and published as `settings/website.analytics.ga4MeasurementId`. Google's tag loads only when the visit may be
// counted (`trackingAllowed`: analytics not declined, not the Studio preview or a share link, not a signed-in admin),
// never in the prerender (it declines analytics) and never on admin pages. A later "decline" stops it at once
// (`ga-disable-<id>`). Events: page_view per route, view_item, add_to_cart, begin_checkout and purchase.
import { CONSENT_EVENT, consentAllows } from "./consent";
import { trackingAllowed } from "./trackingGuard";

type Params = Record<string, unknown>;
export interface Ga4Item { item_id: string; item_name: string; price: number; quantity: number; item_variant?: string }

const MAX_QUEUE = 40;
let measurementId = "";
let loaded = false;
let allowed: Promise<boolean> | null = null;
let queue: Array<[string, Params]> = [];

/** "G-ABC123" (any case, spaces trimmed) or "" when it isn't a GA4 measurement ID. */
export function cleanMeasurementId(value: unknown): string {
  const v = String(value ?? "").trim().toUpperCase();
  return /^G-[A-Z0-9]{4,20}$/.test(v) ? v : "";
}

/** Pages that are never shopper traffic. */
export const isUntrackedPath = (path: string) => /(^|\/)(admin|studio-fixture)(\/|\.|$|#|\?)/.test(path);

/** Order lines → GA4 items (gift cards and box sets included; CAD prices as charged per copy). */
export function ga4Items(lines: any[]): Ga4Item[] {
  return (Array.isArray(lines) ? lines : []).filter(l => l && l.id).slice(0, 200).map(l => ({
    item_id: String(l.id),
    item_name: String(l.title || l.name || "Book").slice(0, 100),
    price: Math.round((Number(l.price) || 0) * 100) / 100,
    quantity: Math.max(1, Number(l.quantity) || 1),
    ...(l.variantName ? { item_variant: String(l.variantName).slice(0, 100) } : {}),
  }));
}

/** The purchase event for a paid order, or null for test/sandbox orders. CAD totals, as stored on the order. */
export function purchaseEvent(orderId: string, order: any): Params | null {
  if (!orderId || !order || order.isTest === true || order.sandboxPayment === true) return null;
  return {
    transaction_id: String(order.orderId || orderId),
    currency: "CAD",
    value: Math.round((Number(order.total) || 0) * 100) / 100,
    tax: Number(order.tax) || 0,
    shipping: Number(order.shipping) || 0,
    ...(order.appliedDiscount?.code ? { coupon: String(order.appliedDiscount.code) } : {}),
    items: ga4Items(order.items),
  };
}

function load(id: string) {
  if (loaded || typeof document === "undefined") return;
  loaded = true;
  const w = window as any;
  w.dataLayer = w.dataLayer || [];
  w.gtag = w.gtag || function gtag() { w.dataLayer.push(arguments); };
  w.gtag("js", new Date());
  // Page views are sent by the router (single-page app), so the automatic first one is off.
  w.gtag("config", id, { send_page_view: false });
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);
}

async function flush() {
  if (!measurementId || typeof window === "undefined" || !queue.length) return;
  allowed = allowed || trackingAllowed().catch(() => false);
  const ok = await allowed;
  if (!ok || !consentAllows("analytics")) { queue = []; return; }
  load(measurementId);
  const pending = queue;
  queue = [];
  for (const [name, params] of pending) (window as any).gtag("event", name, { ...params, send_to: measurementId });
}

/** Called once the public settings are read. A missing or invalid ID keeps Google Analytics off. */
export function configureGa4(value: unknown) {
  const id = cleanMeasurementId(value);
  if (!id || measurementId || typeof window === "undefined") { if (!id) queue = []; return; }
  measurementId = id;
  window.addEventListener(CONSENT_EVENT, () => {
    // Declining analytics stops Google's tag immediately (Google's documented opt-out switch).
    (window as any)[`ga-disable-${id}`] = !consentAllows("analytics");
  });
  void flush();
}

export function ga4Event(name: string, params: Params = {}) {
  if (typeof window === "undefined" || isUntrackedPath(window.location.pathname)) return;
  if (queue.length >= MAX_QUEUE) return;
  queue.push([name, params]);
  void flush();
}

/** Sends `name` at most once per browser session for `key` (reloads and back-and-forth don't double count). */
export function ga4Once(key: string, name: string, params: Params = {}) {
  try {
    if (window.sessionStorage.getItem(`ga4_${key}`)) return;
    window.sessionStorage.setItem(`ga4_${key}`, "1");
  } catch {
    // storage unavailable: send it
  }
  ga4Event(name, params);
}

export function ga4PageView() {
  if (typeof window === "undefined") return;
  ga4Event("page_view", { page_location: window.location.href, page_title: document.title });
}

/** Test hook: forget the module state between tests. */
export function __resetGa4ForTests() { measurementId = ""; loaded = false; allowed = null; queue = []; }
