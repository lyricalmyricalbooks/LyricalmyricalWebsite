import type { AppUpdate } from "../appUpdates";

export default {
  id: "shippo-tracking-and-address-v2",
  date: "2026-11-26",
  title: "Typed-in tracking numbers now update on their own, and address checks explain themselves",
  summary: "When you type a tracking number into an order yourself (Canada Post, Purolator, UPS, FedEx, DHL, USPS or Canpar), the shop now asks Shippo to follow it, just like a label you bought here. The order moves to out for delivery and delivered by itself. Chit Chats, Stallion Express and other carriers still need updating by hand. Address checks now use Shippo's newer checker, so a flagged order shows a clearer reason, like a missing unit number. An address Shippo can only partly confirm is left for you to check before packing. This takes effect once the server update deploys.",
  links: [{ label: "Open orders", tab: "orders" }],
} satisfies AppUpdate;
