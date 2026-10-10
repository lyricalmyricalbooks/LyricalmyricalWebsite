import {
  BookOpen, Settings, Inbox, LayoutDashboard, Tag, BadgePercent, ShoppingCart, Users, Boxes, Gift,
} from "lucide-react";
import type { NavEntry } from "./components";

export const NAV: NavEntry[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "orders", label: "Orders", icon: ShoppingCart },
  { id: "customers", label: "Customers", icon: Users },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "catalog", label: "Books", icon: BookOpen },
  { id: "discounts", label: "Discounts", icon: Tag },
  { id: "giftCards", label: "Gift cards", icon: Gift },
  { id: "reviews", label: "Reviews", icon: BadgePercent },
  { id: "messages", label: "Messages", icon: Inbox },
  { id: "settings", label: "Settings", icon: Settings, children: [
    { id: "general", label: "General" },
    { id: "shipping", label: "Shipping" },
    { id: "payments", label: "Payments" },
    { id: "taxes", label: "Taxes" },
    { id: "designer", label: "Design" },
    { id: "notifications", label: "Notifications" },
    { id: "communications", label: "Email sender" },
  ] },
];

export const PAGE_COPY: Record<string, { title: string; description: string }> = {
  overview: { title: "Overview", description: "Sales, orders, and catalog health at a glance." },
  orders: { title: "Orders", description: "Review payments, fulfillment, and shipping for every order." },
  customers: { title: "Customers", description: "Who buys from you: lifetime value, repeat buyers, and customers to win back." },
  inventory: { title: "Inventory", description: "Stock on hand, low-stock and reprint alerts, and quick count corrections." },
  catalog: { title: "Books", description: "Manage titles, pricing, formats, and inventory." },
  discounts: { title: "Discounts", description: "Create and schedule discount codes and automatic offers." },
  giftCards: { title: "Gift cards", description: "Gift cards shoppers bought and ones you issued: balances, history and resending codes." },
  reviews: { title: "Reviews", description: "Moderate customer reviews before they appear on the storefront." },
  messages: { title: "Messages", description: "Messages people send you from the contact form on your website." },
  settings: { title: "Settings", description: "Store identity, shipping, payments, design, and notifications." },
  shipping: { title: "Shipping", description: "Shipping profiles, zones, and rates." },
  payments: { title: "Payments", description: "Payment methods and currency configuration." },
};
