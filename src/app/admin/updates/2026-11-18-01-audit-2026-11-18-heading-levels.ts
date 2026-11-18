import type { AppUpdate } from "../appUpdates";

export default {
  id: "audit-2026-11-18-heading-levels",
  date: "2026-11-18",
  title: "Book titles in the shop grid and the empty checkout read in the right order",
  summary: "This week's check of the live shop found two small heading problems for screen-reader users. On the home page and collection pages, book titles were announced one level too deep because nothing between the page title and the grid named it; they are now announced at the right level. The checkout page with an empty bag had no main heading; its \"bag is empty\" title now counts as one. Nothing changes on screen, in your published design, in your wording or in how payment works. These are code-level checks, not a ranking claim.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
