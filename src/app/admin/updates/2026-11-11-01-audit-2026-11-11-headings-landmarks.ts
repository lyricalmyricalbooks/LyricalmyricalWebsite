import type { AppUpdate } from "../appUpdates";

export default {
  id: "audit-2026-11-11-headings-landmarks",
  date: "2026-11-11",
  title: "Main heading on the shop home page and clearer checkout for screen readers",
  summary: "Last week's hidden main heading only covered a home page built from Home sections; your home page shows the shop grid, so it still had none. It now carries one hidden heading with your site name there too. At checkout, the empty-bag message and the phone Pay bar are now landmarks screen readers can jump to. Nothing changes on screen, in your published design or in how payment works. These are code-level checks, not a ranking claim.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
