import type { AppUpdate } from "../appUpdates";

export default {
  id: "pdp-book-nav",
  date: "2026-10-23",
  title: "Optional previous / next book links on book pages",
  summary:
    "Like Shopify themes' product navigation, a book page can now end with “Previous book” and “Next book” links, so shoppers can keep browsing without going back to the shop. They follow the same order as the shop grid (your Shop order, then newest) and stay inside the book's shop category when it has one. They only link to books shoppers can already see. They are off until you switch them on in Design › Theme settings › Book page · photos & layout › Extras on the page, so the live shop is unchanged. The words are in Text & labels › Product page.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
