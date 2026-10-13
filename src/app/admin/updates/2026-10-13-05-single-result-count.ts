import type { AppUpdate } from "../appUpdates";

export default {
  id: "single-result-count",
  date: "2026-10-13",
  title: "Shop result count: “1 result” instead of “1 results”",
  summary: "When exactly one book matches the shop's search or filters, the count above the grid now reads “1 result”. You can reword it in Text & labels › Search & filters › Result count: exactly one. Only the wording changes; prices and checkout are unchanged.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer", studio: "#designer?tab=copy" }],
} satisfies AppUpdate;
