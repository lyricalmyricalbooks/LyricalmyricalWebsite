import type { AppUpdate } from "../appUpdates";

export default {
  id: "seo-artists-directory",
  date: "2026-11-28",
  title: "Artists directory page, multi-edition search offers, and faster cover image loading",
  summary: "Added a dedicated /artists directory page linking all credited photographers and artists, updated artist breadcrumbs and structured data to join the shop's site graph, added multi-edition price ranges (AggregateOffer) to book pages, used saved photo descriptions on book cards, and added automatic LCP cover-image preloading to prerendered pages.",
  links: [
    { label: "Open Books", tab: "catalog" },
    { label: "Edit Artist pages text in Studio", tab: "settings", settingsTab: "designer" },
  ],
} satisfies AppUpdate;
