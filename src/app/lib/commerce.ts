import { inEditorPreview, trackingAllowed } from "./trackingGuard";
import { analyticsKey, cleanSearchTerm, deviceOf } from "./analyticsKeys";
import { orderDay } from "./shopDay";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  getDoc,
  query,
  orderBy,
  where,
  limit,
  increment,
} from "firebase/firestore/lite";
import { liteDb } from "../../lib/firestoreLite";

export type FulfillmentStatus =
  | "pending_payment"
  | "paid"
  | "processing"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "refunded";

export const FULFILLMENT_FLOW: FulfillmentStatus[] = [
  "pending_payment",
  "paid",
  "processing",
  "shipped",
  "out_for_delivery",
  "delivered",
];

export const FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = {
  pending_payment: "Awaiting Payment",
  paid: "Paid",
  processing: "Processing",
  shipped: "Shipped",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

// ──────────────────────────────────────────────────────────────
// Order helpers
// ──────────────────────────────────────────────────────────────
export const orderApi = {
  setFulfillmentStatus: async (
    orderId: string,
    status: FulfillmentStatus,
    note?: string,
  ) => {
    await updateDoc(doc(liteDb, "orders", orderId), {
      fulfillmentStatus: status,
      updatedAt: new Date().toISOString(),
    });
    // Admin-only path: load the admin API on demand so the shopper bundle never carries it.
    const { adminApi } = await import("../admin/api");
    await adminApi.addOrderNote(
      orderId,
      note || `Fulfillment status changed to ${FULFILLMENT_LABELS[status]}.`,
    );
  },

  bulkSetStatus: async (orderIds: string[], status: FulfillmentStatus) => {
    await Promise.all(
      orderIds.map(id =>
        updateDoc(doc(liteDb, "orders", id), {
          fulfillmentStatus: status,
          updatedAt: new Date().toISOString(),
        }),
      ),
    );
  },

  /**
   * Orders as CSV for bookkeeping and sales-tax filing. By default only money that
   * changed hands (paid, refunded) is exported; abandoned card attempts stay out.
   * Amounts are in CAD (the shop's base currency); ChargedAmount/ChargedCurrency
   * show what the customer actually paid when that was USD or EUR.
   */
  exportToCsv: (orders: any[], { paidOnly = true }: { paidOnly?: boolean } = {}): string => {
    const header = [
      "OrderID", "Date", "PaidAt", "Customer", "Email",
      "Country", "Province", "PostalCode",
      "Status", "PaymentStatus", "PaymentMethod", "FulfillmentStatus",
      "Subtotal", "Discount", "DiscountCode", "Shipping", "Tax", "Total", "Currency",
      "ChargedAmount", "ChargedCurrency",
      "RefundedAt", "RefundAmount", "RefundCurrency",
      "TrackingCarrier", "TrackingNumber", "ItemCount",
      // The Toronto calendar day the order was placed: Date/PaidAt are UTC moments, so an evening order
      // (and the last evening of a month or tax period) would otherwise land on the next day.
      "ShopDate", "PaidShopDate",
    ];
    const money = (v: any) => (v === undefined || v === null || v === "" ? "" : (Number(v) || 0).toFixed(2));
    const kept = orders.filter(o => o.isTest !== true
      && (!paidOnly || ["paid", "refunded", "refund_pending"].includes(o.paymentStatus)));
    const rows = kept.map(o => {
      const address = o.customer?.address || o.customer?.billingAddress || {};
      const rate = Number(o.exchangeRate);
      // The card/PayPal payment was created for exactly expectedAmountMinor in expectedCurrency.
      const exact = o.expectedAmountMinor != null && Number.isFinite(Number(o.expectedAmountMinor)) && o.expectedCurrency;
      const charged = exact ? money(Number(o.expectedAmountMinor) / 100)
        : o.checkoutCurrency && o.checkoutCurrency !== "CAD" && rate > 0 ? money(Number(o.total || 0) * rate) : money(o.total);
      return [
        o.orderId || o.id,
        o.createdAt || "",
        o.paidAt || "",
        (o.customer?.name || "").replace(/[",\n]/g, " "),
        o.customer?.email || "",
        address.country || "",
        address.state || "",
        address.zip || "",
        o.status || "",
        o.paymentStatus || "",
        o.paymentMethod || "",
        o.fulfillmentStatus || (o.status === "completed" ? "delivered" : o.paymentStatus === "paid" ? "paid" : ""),
        money(o.subtotal),
        money(o.discount),
        o.appliedDiscount?.code || "",
        money(o.shipping),
        money(o.tax),
        money(o.total),
        "CAD",
        charged,
        exact ? String(o.expectedCurrency).toUpperCase() : o.checkoutCurrency || "CAD",
        o.refundedAt || "",
        // A partial refund (Stripe/PayPal Dashboard) keeps the order paid and only records refundedAmountMinor.
        o.refund?.amount != null ? money(o.refund.amount) : Number(o.refundedAmountMinor) > 0 ? money(Number(o.refundedAmountMinor) / 100) : "",
        o.refund?.currency || (Number(o.refundedAmountMinor) > 0 ? String(o.expectedCurrency || o.checkoutCurrency || "CAD").toUpperCase() : ""),
        o.trackingCarrier || "",
        o.trackingNumber || "",
        (o.items || []).reduce((acc: number, i: any) => acc + (i.quantity || 0), 0),
        orderDay(o.createdAt),
        o.paidAt ? orderDay(o.paidAt) : "",
      ];
    });
    // A cell starting with = + - @ is run as a formula by spreadsheet apps: quote it as text.
    const cell = (v: any) => {
      const text = String(v);
      const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    return [header, ...rows].map(r => r.map(cell).join(",")).join("\n");
  },

  downloadCsv: (filename: string, csv: string) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};

// ──────────────────────────────────────────────────────────────
// Abandoned cart tracking
// ──────────────────────────────────────────────────────────────
export const abandonedCartApi = {
  upsert: async (
    cartKey: string,
    payload: {
      email: string;
      items: any[];
      subtotal: number;
      customer?: any;
    },
  ) => {
    if (!payload.email) return;
    const ref = doc(liteDb, "abandoned-carts", cartKey);
    const now = new Date().toISOString();
    // createdAt/recovered are set once: later saves must not reset the cart's
    // age or reopen a cart that was already bought (firestore.rules forbids that).
    const existing = await getDoc(ref).catch(() => null);
    if (existing?.exists() && existing.data()?.recovered === true) return;
    await setDoc(
      ref,
      {
        ...payload,
        cartKey,
        updatedAt: now,
        ...(existing?.exists() ? {} : { recovered: false, createdAt: now }),
      },
      { merge: true },
    );
  },

  markRecovered: async (cartKey: string) => {
    try {
      await updateDoc(doc(liteDb, "abandoned-carts", cartKey), {
        recovered: true,
        recoveredAt: new Date().toISOString(),
      });
    } catch {}
  },

  list: async (max = 100) => {
    const snap = await getDocs(
      query(
        collection(liteDb, "abandoned-carts"),
        orderBy("updatedAt", "desc"),
        limit(max),
      ),
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
};

// ──────────────────────────────────────────────────────────────
// Funnel + traffic analytics
// ──────────────────────────────────────────────────────────────
// Everything lands in today's `analytics/<date>` doc as `increment(1)` merges, which Firestore applies itself, so
// shoppers arriving at the same moment never overwrite each other's counts. Each call checks consent, the Studio
// preview and the admin session (see trackingGuard). Best-effort: tracking must never break browsing or checkout.
const dayKey = () => new Date().toISOString().split("T")[0];
const mapKey = analyticsKey;

async function bump(patch: Record<string, Record<string, ReturnType<typeof increment>>>) {
  if (!(await trackingAllowed())) return;
  const today = dayKey();
  try {
    await setDoc(doc(liteDb, "analytics", today), { date: today, ...patch }, { merge: true });
  } catch {
    // best-effort
  }
}

/** True the first time `key` is seen this browser session (so reloads and back-and-forth don't double count). */
function firstThisSession(key: string): boolean {
  try {
    if (window.sessionStorage.getItem(key)) return false;
    window.sessionStorage.setItem(key, "1");
  } catch {
    // storage unavailable: count it
  }
  return true;
}

/**
 * Whether a completed purchase should be added to the funnel: never a sandbox/test order, and only once per
 * order however often the confirmation page is reloaded or reopened (remembered in this browser).
 */
export function shouldCountPurchase(orderId: string, order: any, storage: Pick<Storage, "getItem" | "setItem"> | null): boolean {
  if (!orderId || order?.isTest === true || order?.sandboxPayment === true) return false;
  const key = `fm_purchase_counted_${orderId}`;
  try {
    if (storage?.getItem(key)) return false;
    storage?.setItem(key, "1");
  } catch {
    // storage unavailable: count it
  }
  return true;
}

export const funnelApi = {
  track: async (event: "view" | "add_to_cart" | "checkout_start" | "purchase") => {
    await bump({ funnel: { [event]: increment(1) } });
  },

  /** "Started checkout": once per browser session, not once per page load of the checkout. */
  trackCheckoutStart: async () => {
    if (typeof window !== "undefined" && !firstThisSession(`fm_checkout_start_${dayKey()}`)) return;
    await bump({ funnel: { checkout_start: increment(1) } });
  },

  /** "Completed purchase": once per real order (see shouldCountPurchase). */
  trackPurchase: async (orderId: string, order?: any) => {
    let storage: Storage | null = null;
    try { storage = typeof window !== "undefined" ? window.localStorage : null; } catch { storage = null; }
    if (!shouldCountPurchase(orderId, order, storage)) return;
    await bump({ funnel: { purchase: increment(1) } });
  },

  trackCategory: async (categoryName: string) => {
    const key = mapKey((categoryName || "").toUpperCase());
    if (!key || inEditorPreview()) return;
    await bump({ categoryViews: { [key]: increment(1) } });
  },

  /** Where this session came from and on what kind of screen — once per session, in its own write. */
  trackSession: async () => {
    if (typeof window === "undefined" || !firstThisSession(`fm_session_${dayKey()}`)) return;
    let source = "direct";
    try { source = mapKey((window.sessionStorage.getItem("referral_source") || "direct").toLowerCase()) || "direct"; } catch { /* direct */ }
    await bump({ sources: { [source]: increment(1) }, devices: { [deviceOf(window.innerWidth)]: increment(1) } });
  },

  /** A product page opened — once per book per session. */
  trackProductView: async (bookId: string) => {
    if (!bookId || typeof window === "undefined" || !firstThisSession(`fm_bookview_${bookId}`)) return;
    await bump({ bookViews: { [mapKey(bookId)]: increment(1) } });
  },

  /** What shoppers type into search, and whether it found anything. Personal-looking terms are never stored. */
  trackSearch: async (rawTerm: string, resultCount: number) => {
    const term = cleanSearchTerm(rawTerm);
    if (!term || typeof window === "undefined") return;
    const field = resultCount > 0 ? "searches" : "noResults";
    if (!firstThisSession(`fm_search_${field}_${term}`)) return;
    await bump({ [field]: { [term]: increment(1) } });
  },
};
