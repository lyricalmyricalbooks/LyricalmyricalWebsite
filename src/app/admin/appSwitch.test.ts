import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  INVENTORY_APP_URL, INVENTORY_TAB_NAME, forgetOpenedTab, inventoryOrderUrl, inventoryWaiting, isInstalledApp,
  openInventoryApp, orderInInventoryApp,
} from "./appSwitch";

// A cross-origin tab: its address can be set but not read.
function otherAppTab() {
  const tab: any = { closed: false, focus: vi.fn(), set: [] as string[] };
  tab.location = {
    get href() { throw new DOMException("Blocked a frame", "SecurityError"); },
    set href(v: string) { tab.set.push(v); },
    replace: vi.fn(),
  };
  return tab;
}
function blankTab() {
  const tab: any = { closed: false, focus: vi.fn() };
  tab.location = { href: "about:blank", replace: vi.fn() };
  return tab;
}
const browser = (over: any = {}) => ({
  open: vi.fn(() => null as any),
  matchMedia: () => ({ matches: false }),
  navigator: {},
  document: { referrer: "" },
  ...over,
});

beforeEach(() => forgetOpenedTab());

describe("addresses and counts", () => {
  it("deep-links an order by its id, encoded, after the #", () => {
    expect(inventoryOrderUrl("ABCD-12/34")).toBe(`${INVENTORY_APP_URL}#website-order=ABCD-12%2F34`);
  });
  it("counts only when the link is connected, and never invents a number", () => {
    expect(inventoryWaiting(null)).toBeNull();
    expect(inventoryWaiting({ pendingImport: { count: 3 } })).toBeNull();
    expect(inventoryWaiting({ connection: { ok: true } })).toBe(0);
    expect(inventoryWaiting({ connection: { ok: true }, pendingImport: { count: 3 } })).toBe(3);
    expect(inventoryWaiting({ connection: { ok: true }, pendingImport: { count: "x" } })).toBe(0);
  });
  it("offers the inventory app only for paid (or refunded) real orders", () => {
    expect(orderInInventoryApp({ paymentStatus: "paid" })).toBe(true);
    expect(orderInInventoryApp({ paymentStatus: "refunded" })).toBe(true);
    expect(orderInInventoryApp({ paymentStatus: "unpaid" })).toBe(false);
    expect(orderInInventoryApp({ paymentStatus: "paid", isTest: true })).toBe(false);
  });
});

describe("installed apps hand the link to the phone", () => {
  it("spots home-screen, Android and Install-app windows", () => {
    expect(isInstalledApp(browser({ matchMedia: () => ({ matches: true }) }))).toBe(true);
    expect(isInstalledApp(browser({ navigator: { standalone: true } }))).toBe(true);
    expect(isInstalledApp(browser({ document: { referrer: "android-app://io.github.x/" } }))).toBe(true);
    expect(isInstalledApp(browser())).toBe(false);
  });
  it("lets the plain link open in an installed app", () => {
    const win = browser({ matchMedia: () => ({ matches: true }) });
    expect(openInventoryApp(win)).toBe(false);
    expect(win.open).not.toHaveBeenCalled();
  });
});

describe("switching between browser tabs", () => {
  it("goes back to the inventory app that opened this tab, without reloading it", () => {
    const opener = otherAppTab();
    const win = browser({ opener, document: { referrer: "https://lyricalmyricalbooks.github.io/" } });
    expect(openInventoryApp(win)).toBe(true);
    expect(opener.focus).toHaveBeenCalled();
    expect(opener.set).toEqual([]);
    expect(win.open).not.toHaveBeenCalled();
  });
  it("never steers a stranger that opened this tab (an email, another site)", () => {
    const opener = otherAppTab();
    const tab = blankTab();
    const win = browser({ opener, document: { referrer: "https://mail.google.com/" }, open: vi.fn(() => tab) });
    expect(openInventoryApp(win)).toBe(true);
    expect(opener.focus).not.toHaveBeenCalled();
    expect(win.open).toHaveBeenCalledWith("", INVENTORY_TAB_NAME);
    expect(tab.location.replace).toHaveBeenCalledWith(INVENTORY_APP_URL);
  });
  it("opens a new named tab the first time, then reuses it", () => {
    const tab = blankTab();
    const win = browser({ open: vi.fn(() => tab) });
    expect(openInventoryApp(win)).toBe(true);
    expect(tab.location.replace).toHaveBeenCalledWith(INVENTORY_APP_URL);
    const url = inventoryOrderUrl("A-1");
    tab.location = { href: "x" } as any;
    expect(openInventoryApp(win, url)).toBe(true);
    expect(win.open).toHaveBeenCalledTimes(1);
    expect(tab.location.href).toBe(url);
  });
  it("finds the inventory app's tab by name and only moves it for a deep link", () => {
    const tab = otherAppTab();
    const win = browser({ open: vi.fn(() => tab) });
    expect(openInventoryApp(win)).toBe(true);
    expect(tab.set).toEqual([]);
    forgetOpenedTab();
    const url = inventoryOrderUrl("A-2");
    expect(openInventoryApp(win, url)).toBe(true);
    expect(tab.set).toEqual([url]);
    expect(tab.focus).toHaveBeenCalledTimes(2);
  });
  it("falls back to the plain link when the browser blocks the new tab", () => {
    expect(openInventoryApp(browser())).toBe(false);
  });
  it("opens a fresh tab once the remembered one was closed", () => {
    const first = blankTab();
    const second = blankTab();
    const open = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const win = browser({ open });
    openInventoryApp(win);
    first.closed = true;
    openInventoryApp(win);
    expect(open).toHaveBeenCalledTimes(2);
    expect(second.location.replace).toHaveBeenCalledWith(INVENTORY_APP_URL);
  });
});
