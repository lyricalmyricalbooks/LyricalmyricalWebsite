import type { AppUpdate } from "../appUpdates";

export default {
  id: "shippo-api-version",
  date: "2026-11-26",
  title: "Shipping now always speaks the same Shippo version",
  summary: "Every request to Shippo (carrier rates at checkout, address checks, labels, refunds and tracking) now names the Shippo version the shop was built for. If Shippo changes its default later, your rates and labels keep working the same way. Nothing changes in how you buy labels. This takes effect once the server update deploys.",
  links: [{ label: "Open shipping settings", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
