import type { AppUpdate } from "../appUpdates";

export default {
  id: "empty-collections-not-found",
  date: "2026-11-26",
  title: "Empty or mistyped collection addresses now tell Google they don't exist",
  summary: "A collection address with no books behind it (a typo, an empty category, or one hidden from the menu) used to answer Google as a normal page that then showed every book. Google counted those as \"soft 404\" pages. They now answer \"not found\" to Google, while shoppers still see the same page. Your real collections, and Shop all, are unchanged. A category that gets its first book can answer \"not found\" to Google for about 20 minutes, until the shop's regular refresh adds its page.",
  links: [{ label: "Edit categories in Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
