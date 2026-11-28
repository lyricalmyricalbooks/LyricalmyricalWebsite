import type { AppUpdate } from "../appUpdates";

export default {
  id: "gcp-cost-efficiencies",
  date: "2026-11-27",
  title: "Lower monthly Google Cloud usage across background jobs and the storefront",
  summary: "Background checks now skip unchanged work, run on calmer schedules, and avoid duplicate nightly database reads and writes, while the storefront serves exchange rates and card star ratings from the cached catalog file instead of querying the database on every visit. Server schedule and backup changes take effect once the backend update deploys.",
  links: [{ label: "Open General settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
