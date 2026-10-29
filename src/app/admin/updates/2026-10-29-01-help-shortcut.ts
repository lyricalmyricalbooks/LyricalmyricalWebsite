import type { AppUpdate } from "../appUpdates";

export default {
  id: "help-shortcut",
  date: "2026-10-29",
  title: "Press ? anywhere in the admin to open Help",
  summary: "Press the ? key on any admin page (when you aren't typing in a box or in a pop-up window) to open Help & shortcuts. The list there now also says that Ctrl+S (⌘S on a Mac) saves any Settings page with unsaved changes, not only the design draft.",
  links: [{ label: "Open settings", tab: "settings" }],
} satisfies AppUpdate;
