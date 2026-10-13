import type { AppUpdate } from "../appUpdates";

export default {
  id: "quick-view",
  date: "2026-10-13",
  title: "Shop grid: “Quick view” pop-up on each book",
  summary: "Shoppers can open a book from the shop grid in a pop-up showing its photo, price, a short description and an edition picker, add it to the bag, or jump to the full page. Books with paid extras, gift-card amounts, box-set parts or a Coming soon date only offer the full page. It is off by default: turn it on in Studio › Theme settings › Shop & book pages › Product cards & grid (“Quick view button”); the words are in Text & labels › Product page.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
