import type { AppUpdate } from "../appUpdates";

export default {
  id: "calm-admin-v4",
  date: "2026-11-12",
  title: "A calmer admin, with a side menu on busy pages",
  summary: "The admin has a quieter look: white cards on a soft ground, a lighter sidebar and one clear title on every page. Pages with several views (Overview, Orders, Reviews, Messages, Inventory and Settings) now list them in a small side menu with counts, and the Stock item turns red when books are sold out or need a reprint. Settings pages show all their sections on one page, so nothing hides behind a tab. The Overview opens with one revenue card holding orders, average order and copies sold beside the total, and Inventory is a single card with filters, search and totals together. Only the look and layout changed: orders, payments and stock work as before.",
  links: [
    { label: "Open the Overview", tab: "overview" },
    { label: "Open Inventory", tab: "inventory" },
    { label: "Open Settings", tab: "settings", settingsTab: "general" },
  ],
} satisfies AppUpdate;
