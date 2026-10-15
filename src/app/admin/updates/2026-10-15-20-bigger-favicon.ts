import type { AppUpdate } from "../appUpdates";

export default {
  id: "bigger-favicon",
  date: "2026-10-15",
  title: "A bigger browser tab icon",
  summary: "The built-in lyre icon now fills the whole tab square, with thicker lines, so it stands out more next to other tabs. It shows whenever Studio's Browser tab icon is blank.",
  links: [{ label: "Browser tab icon", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
