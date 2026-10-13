import type { AppUpdate } from "../appUpdates";

export default {
  id: "quick-view",
  date: "2026-10-13",
  title: "Quick view pop-up in the shop grid",
  summary: "Shoppers can preview a book (photo, price, short description, Add to bag) in a pop-up without leaving the shop, like Shopify's Quick view. It is off by default: turn it on in Studio › Theme settings › Product cards & grid; change its words in Text & labels › Product page.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
