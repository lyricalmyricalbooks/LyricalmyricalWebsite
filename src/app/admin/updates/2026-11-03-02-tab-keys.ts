import type { AppUpdate } from "../appUpdates";

export default {
  id: "tab-keys",
  date: "2026-11-03",
  title: "Jump to the first or last tab from the keyboard",
  summary: "On any admin page with sub tabs, press Home to jump to the first tab and End to jump to the last one, in addition to the left and right arrows. Nothing else looks different.",
  links: [{ label: "Open overview", tab: "overview" }],
} satisfies AppUpdate;
