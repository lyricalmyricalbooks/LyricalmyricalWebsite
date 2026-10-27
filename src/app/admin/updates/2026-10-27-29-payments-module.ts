import type { AppUpdate } from "../appUpdates";

export default {
  id: "payments-module",
  date: "2026-10-27",
  title: "Card payments now start from one place",
  summary: "Behind the scenes, the part of the shop that decides which Stripe key and mode (live or test) to use now lives in one place instead of being spread through the server code. Checkout, refunds and payment checks work exactly as before. This prepares the shop to take payments for other presses later without each one holding a secret key.",
  links: [{ label: "Open payment settings", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
