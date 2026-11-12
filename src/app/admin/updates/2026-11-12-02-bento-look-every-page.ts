import type { AppUpdate } from "../appUpdates";

export default {
  id: "bento-look-every-page",
  date: "2026-11-12",
  title: "Every admin page now matches the Daily desk",
  summary: "Orders, Customers, Inventory, Books, Discounts, Gift cards, Reviews, Messages, Design and Settings now use the same look as the Overview. Each page has a small line above its title that tells you where you are, such as Sell · Orders. Cards and figures are rounded cream tiles, tabs and filters are pills, and buttons and boxes have rounded corners. Order covers and book covers are tiles that lift when you point at them. Only the look changed: every page keeps its own content, and nothing about orders, payments or stock is different.",
  links: [
    { label: "Open Orders", tab: "orders" },
    { label: "Open Books", tab: "catalog" },
    { label: "Open Settings", tab: "settings", settingsTab: "general" },
  ],
} satisfies AppUpdate;
