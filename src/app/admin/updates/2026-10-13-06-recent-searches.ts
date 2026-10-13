import type { AppUpdate } from "../appUpdates";

export default {
  id: "recent-searches",
  date: "2026-10-13",
  title: "Search pop-up: shoppers' recent searches",
  summary: "When a shopper opens the search pop-up, it now offers the searches they made before (this browser only, up to five, with a Clear button) above your Popular searches. Turn it off in Studio › Theme settings › Shop & book pages › Search pop-up (“show the shopper's recent searches”); change its words in Text & labels › Search & filters.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
