import type { AppUpdate } from "../appUpdates";

export default {
  id: "sub-tabs-switch",
  date: "2026-11-09",
  title: "New sub tabs with shorter names",
  summary: "The sub tabs under each Settings page, Shipping, Email sender and Inventory now sit in one dark bar, with the open tab as a cream block, so it's always clear where you are. They have shorter names too. General: Status, Shop info, Visitors, Upkeep. Payments: Status, Ways to pay, On the shop. Shipping: Status, Rates, Labels, Pickup & local. Email sender: Emails, Sender, Sent. Inventory: Stock, Inventory app. A red-orange number still means problems to fix and a dot still means unsaved changes. This update also makes the Overview's Needs you strip match the Orders lists exactly (archived orders don't count), say when a count couldn't be loaded, and skip books that have just sold out.",
  links: [{ label: "Open General settings", tab: "settings", settingsTab: "general" }, { label: "Open the Overview", tab: "overview" }],
} satisfies AppUpdate;
