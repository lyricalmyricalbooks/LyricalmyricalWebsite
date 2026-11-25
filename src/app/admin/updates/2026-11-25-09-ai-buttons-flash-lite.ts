import type { AppUpdate } from "../appUpdates";

export default {
  id: "ai-buttons-flash-lite",
  date: "2026-11-25",
  title: "AI buttons answer in seconds on the free Google key",
  summary: "Describe with AI and the Write with AI buttons were still failing. On the shop's free Google AI key, Google's full Flash models are overloaded (they answer \"high demand\" or hang for over 30 seconds), and Gemini 2.5 Flash is closed to new keys. The shop now asks Google's newest Flash-Lite first, which answers in 1 to 3 seconds and reads photos well, and gives up on any model that takes more than 15 seconds and tries the next one instead of failing.",
  links: [{ label: "Open Books", tab: "catalog" }, { label: "AI settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
