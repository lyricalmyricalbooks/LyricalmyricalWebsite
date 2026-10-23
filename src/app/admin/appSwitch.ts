import { useSyncExternalStore } from "react";

// The "Website · Inventory" switcher: the website admin and the inventory app (lyricalmyricalbooks/lyrical-inventory)
// open each other. Rules shared with the inventory app's src/lib/app-switch.js (docs/INVENTORY_LINK.md › Switching
// between the apps). Pure helpers first; the window handling takes its window as an argument so it can be tested.

export const INVENTORY_APP_URL = "https://lyricalmyricalbooks.github.io/lyrical-inventory/";
export const INVENTORY_ORIGINS = ["https://lyricalmyricalbooks.github.io"];
/** Each app names its own tab so the other can find it again instead of opening another one. */
export const WEBSITE_TAB_NAME = "lm-website-admin";
export const INVENTORY_TAB_NAME = "lm-inventory-app";

/** The inventory app opened on a website order's sales (only the #fragment differs, so an open app doesn't reload). */
export const inventoryOrderUrl = (orderId: string) => `${INVENTORY_APP_URL}#website-order=${encodeURIComponent(orderId)}`;

/** Website orders waiting for the inventory app, or null when the link isn't connected (no badge, never a made-up 0). */
export function inventoryWaiting(state: any): number | null {
  if (state?.connection?.ok !== true) return null;
  const n = Number(state?.pendingImport?.count);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** The inventory app knows a website order once it has been paid (refunded ones too). */
export function orderInInventoryApp(order: any): boolean {
  if (!order || order.isTest) return false;
  const status = String(order.paymentStatus || "");
  return status === "paid" || status === "refunded" || status === "refund_pending" || !!order.paidAt;
}

type Win = {
  open: (url?: string, target?: string) => any;
  opener?: any;
  matchMedia?: (q: string) => { matches: boolean };
  navigator?: any;
  document?: { referrer?: string };
};

/** An installed app (home screen, Android app, Chrome "Install app"): links go to the phone, not window.open. */
export function isInstalledApp(win: Win): boolean {
  try {
    if (win.matchMedia?.("(display-mode: standalone)").matches) return true;
    if (win.navigator?.standalone === true) return true;
    return String(win.document?.referrer || "").startsWith("android-app://");
  } catch { return false; }
}

const originOf = (url: string) => { try { return new URL(url).origin; } catch { return ""; } };

let openedTab: any = null;
/** Tests start each case from a page that has opened nothing. */
export function forgetOpenedTab() { openedTab = null; }

function show(tab: any, url: string, deep: boolean) {
  // Cross-origin: only the address can be set. A deep link changes the #fragment alone, so the app keeps running.
  if (deep) tab.location.href = url;
  tab.focus?.();
}

/**
 * Opens the inventory app from a click. Returns true when it handled the click (call preventDefault), false to let
 * the plain link open it (installed apps, a blocked pop-up). The opener is kept on purpose: both apps are the
 * publisher's, and it is how the inventory app finds this tab again instead of opening a third one.
 */
export function openInventoryApp(win: Win, url: string = INVENTORY_APP_URL, deep = url !== INVENTORY_APP_URL): boolean {
  if (isInstalledApp(win)) return false;
  try {
    // 1. This tab was opened by the inventory app's own switcher.
    const opener = win.opener;
    if (opener && !opener.closed && INVENTORY_ORIGINS.includes(originOf(String(win.document?.referrer || "")))) {
      show(opener, url, deep);
      return true;
    }
    // 2. A tab this page opened before.
    if (openedTab && !openedTab.closed) { show(openedTab, url, deep); return true; }
    // 3. The tab named for the inventory app, or a new one.
    const tab = win.open("", INVENTORY_TAB_NAME);
    if (!tab) return false;
    let blank = false;
    try { blank = tab.location.href === "about:blank"; } catch { /* the inventory app is already open there */ }
    if (blank) tab.location.replace(url);
    else if (deep) tab.location.href = url;
    tab.focus?.();
    openedTab = tab;
    return true;
  } catch { return false; }
}

/* The link's state, shared by the rail, the phone top bar and order pages (Dashboard reads it with the alerts). */
let waiting: number | null = null;
const listeners = new Set<() => void>();
export function setInventoryWaiting(next: number | null) {
  if (next === waiting) return;
  waiting = next;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
/** null = the inventory app link isn't connected; otherwise how many website orders wait for the app. */
export const useInventoryWaiting = () => useSyncExternalStore(subscribe, () => waiting, () => waiting);
