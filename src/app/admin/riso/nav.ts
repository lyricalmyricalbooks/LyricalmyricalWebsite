import {
  BookOpen, Settings, Inbox, LayoutDashboard, BadgePercent, Star, ShoppingCart, Users, Boxes, Gift,
  SlidersHorizontal, Truck, CreditCard, Receipt, Palette, Mail, Store, Percent, Wallet, Search, UserRound, Layers, LayoutGrid,
  PackageOpen, PackageCheck, Clock, Check, X, MailOpen, Archive,
} from "lucide-react";
import type { NavEntry, RailInfo } from "./components";

export const NAV: NavEntry[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "orders", label: "Orders", icon: ShoppingCart, section: "Sell" },
  { id: "customers", label: "Customers", icon: Users },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "catalog", label: "Books", icon: BookOpen },
  { id: "discounts", label: "Discounts", icon: BadgePercent, section: "Promote" },
  { id: "giftCards", label: "Gift cards", icon: Gift },
  { id: "reviews", label: "Reviews", icon: Star },
  { id: "messages", label: "Messages", icon: Inbox },
  // Design is its own page (theme, pages, colours, type); Studio opens from it.
  { id: "design", label: "Design", icon: Palette, section: "Shop" },
  { id: "settings", label: "Settings", icon: Settings, children: [
    { id: "general", label: "General", icon: SlidersHorizontal },
    { id: "shipping", label: "Shipping", icon: Truck },
    { id: "payments", label: "Payments", icon: CreditCard },
    { id: "taxes", label: "Taxes", icon: Receipt },
    // One email page: templates, shop alerts, Gmail sending, sender details and recent deliveries.
    { id: "notifications", label: "Email sender", icon: Mail },
  ] },
];

/** Older sidebar ids for a Settings page (`settings/<page>`), still accepted by the shell. */
export const SETTINGS_ITEM_PREFIX = "settings/";

/**
 * The sidebar list (bento shell, 12 November 2026): Overview, then the Sell, Promote and Shop groups (each item's
 * `section` heads its group). Settings keeps its pages as children, shown indented only while one is open.
 */
export function sidebarItems(nav: NavEntry[]): NavEntry[] {
  return nav;
}

/**
 * The small line above a page title (bento pages): the page's sidebar group, then the page or Settings page,
 * e.g. "Sell · Orders", "Settings · Shipping". An unknown id gives "".
 */
export function pageEyebrow(nav: NavEntry[], id: string, child?: string): string {
  let section = "";
  for (const item of nav) {
    if (item.section) section = item.section;
    if (item.id !== id) continue;
    const sub = child && item.children?.find(c => c.id === child);
    if (item.children) return [item.label, sub ? sub.label : item.children[0]?.label].filter(Boolean).join(" · ");
    return [section, item.label].filter(Boolean).join(" · ");
  }
  return "";
}

export const PAGE_COPY: Record<string, { title: string; description: string }> = {
  overview: { title: "Overview", description: "Sales, orders, and catalog health at a glance." },
  orders: { title: "Orders", description: "Review payments, fulfillment, and shipping for every order." },
  customers: { title: "Customers", description: "Who buys, how often, and who to win back." },
  inventory: { title: "Inventory", description: "Stock on hand, reprints and quick count fixes." },
  catalog: { title: "Books", description: "Titles, pricing, formats and stock." },
  discounts: { title: "Discounts", description: "Codes, automatic offers and what they earned." },
  giftCards: { title: "Gift cards", description: "Balances, history and resending codes." },
  reviews: { title: "Reviews", description: "Approve what readers say before it goes live." },
  messages: { title: "Messages", description: "Notes from the contact form on your website." },
  design: { title: "Design", description: "How the storefront looks: pages, colours and type." },
  settings: { title: "Settings", description: "Store identity, shipping, payments and email." },
  shipping: { title: "Shipping", description: "Where you deliver, what it costs, and how parcels are labelled." },
  payments: { title: "Payments", description: "How shoppers pay, and when the money reaches your bank." },
};

/** Settings sub-pages: the one line under the title and the page's own secondary action. */
export const SETTINGS_COPY: Record<string, { description: string; action?: { label: string; kind: "storefront" | "stripe" | "designer" | "label" | "taxReport" | "testEmail" } }> = {
  general: { description: "Your store’s name, contact details and whether the shop is open.", action: { label: "View storefront ↗", kind: "storefront" } },
  shipping: { description: "Where you deliver, what it costs, and how parcels are labelled.", action: { label: "Test a label", kind: "label" } },
  payments: { description: "How shoppers pay, and when the money reaches your bank.", action: { label: "Open Stripe ↗", kind: "stripe" } },
  taxes: { description: "Whether prices include tax, and the rates for each region.", action: { label: "Download tax report", kind: "taxReport" } },
  notifications: { description: "The account order emails come from, and which emails customers get.", action: { label: "Send a test email", kind: "testEmail" } },
};

/** The Overview tells the top bar's crumb which of its tabs is open ("Daily desk"); the detail is the tab's name. */
export const OVERVIEW_TAB_EVENT = "lm:overview-tab";

/**
 * Each page's section menu (calm v4 mockup, 12 November 2026): the hint under each section and its icon. Settings
 * groups its pages as Store, Money and Email. A section missing here still shows, with the page's icon.
 */
export const RAILS: Record<"settings" | "overview" | "orders" | "reviews" | "messages", RailInfo> = {
  settings: { title: "Settings", icon: Settings, sections: {
    general: { hint: "Name and contact", icon: Store, group: "Store" },
    shipping: { hint: "Zones and rates", icon: Truck, group: "Store" },
    payments: { hint: "Stripe and payouts", icon: CreditCard, group: "Money" },
    taxes: { hint: "Rates by region", icon: Percent, group: "Money" },
    notifications: { hint: "Sender and emails", icon: Mail, group: "Email" },
  } },
  overview: { title: "Overview", icon: LayoutDashboard, sections: {
    today: { hint: "Today at a glance", icon: LayoutDashboard },
    sales: { hint: "Revenue and payouts", icon: Wallet },
    titles: { hint: "Every book side by side", icon: BookOpen },
    traffic: { hint: "Traffic and sources", icon: Users },
    search: { hint: "Searches and page speed", icon: Search },
    customers: { hint: "Who buys and comes back", icon: UserRound },
    stock: { hint: "What is running low", icon: Layers },
    all: { hint: "The whole board", icon: LayoutGrid },
  } },
  orders: { title: "Orders", icon: ShoppingCart, sections: {
    open: { hint: "Waiting to pack or ship", icon: PackageOpen },
    completed: { hint: "Delivered and closed", icon: PackageCheck },
    all: { hint: "Every order", icon: ShoppingCart },
  } },
  reviews: { title: "Reviews", icon: Star, sections: {
    pending: { hint: "Waiting for you", icon: Clock },
    approved: { hint: "Live on the shop", icon: Check },
    rejected: { hint: "Hidden", icon: X },
    all: { hint: "Every review", icon: Star },
  } },
  messages: { title: "Messages", icon: Inbox, sections: {
    inbox: { hint: "Everything open", icon: Inbox },
    unread: { hint: "Needs a reply", icon: Mail },
    replied: { hint: "You answered", icon: MailOpen },
    archived: { hint: "Put away", icon: Archive },
  } },
};
