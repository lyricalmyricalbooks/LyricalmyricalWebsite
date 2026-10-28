import type { AppUpdate } from "../appUpdates";

export default {
  id: "save-shortcut",
  date: "2026-10-28",
  title: "Press Ctrl+S (⌘S on a Mac) to save settings",
  summary: "On every Settings page, when the dark “unsaved changes” bar appears, you can now save with Ctrl+S (⌘S on a Mac) instead of reaching for the button. It never opens your browser’s “Save page” box over your settings, and it stays out of the way while a pop-up window is open. The Save button shows the shortcut when you hover it.",
  links: [{ label: "Open settings", tab: "settings" }],
} satisfies AppUpdate;
