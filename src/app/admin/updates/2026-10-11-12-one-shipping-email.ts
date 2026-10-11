import type { AppUpdate } from "../appUpdates";

export default {
  id: "one-shipping-email", date: "2026-10-11", title: "One email when a parcel ships",
  summary: "Customers no longer get a second \"Delivery Update: Your order is out for delivery\" email a few minutes after \"Your order is on the way!\". Marking a shipped order out for delivery (or the carrier reporting it) now only updates the order. The \"delivered\" email and the local-delivery emails are unchanged. Takes effect once the Cloud Functions are deployed.",
  links: [{ label: "Open Orders", tab: "orders" }, { label: "Email templates", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
