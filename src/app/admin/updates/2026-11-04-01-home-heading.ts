import type { AppUpdate } from "../appUpdates";

export default {
  id: "home-heading",
  date: "2026-11-04",
  title: "The home page now has a main heading for search engines and screen readers",
  summary: "The home page had no top-level heading when the catalog heading was left blank in Studio. It now carries one hidden heading with your site name (Text & labels › Site name) unless a Home section writes its own heading. Nothing changes on screen or in your published design. This is a code-level check, not a ranking claim.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
