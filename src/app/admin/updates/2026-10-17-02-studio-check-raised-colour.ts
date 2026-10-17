import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-check-raised-colour",
  date: "2026-10-17",
  title: "Studio control check: one last unsteady result fixed",
  summary: "The automatic check that every Studio control still changes the preview gave different answers for the raised panel colour, depending on whether the grey loading placeholders on book cards were still on screen. It is now recorded by what it reliably changes, so the check stops failing at random. Nothing in the shop or in Studio changes.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
