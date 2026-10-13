import type { AppUpdate } from "../appUpdates";

export default {
  id: "quick-view",
  date: "2026-10-13",
  title: "Shop grid: optional “Quick view” pop-up",
  summary: "Each book in the shop grid can now show a Quick view button that opens a pop-up with the cover, price, description and Add to bag, so shoppers can buy without leaving the grid. Books with several editions or extras send them to the book page to choose. It is off by default: turn it on in Studio › Theme settings › Shop & book pages › Product cards & grid (“Quick view” button). Its words are in Text & labels › Product page.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
