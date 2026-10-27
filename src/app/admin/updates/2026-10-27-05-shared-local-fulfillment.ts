import type { AppUpdate } from "../appUpdates";

export default {
  id: "shared-local-fulfillment",
  date: "2026-10-27",
  title: "One copy of the pickup and local delivery rules",
  summary: "Checkout, your delivery settings and the server now decide which pickup spots and delivery zones a shopper can choose, and what each costs, with the very same code. A shopper can no longer be offered local delivery at checkout and then told it isn't available at payment because two copies drifted apart. Nothing about your pickup or delivery settings changes.",
  links: [{ label: "Open shipping settings", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
