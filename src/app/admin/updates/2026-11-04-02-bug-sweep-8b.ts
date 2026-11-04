import type { AppUpdate } from "../appUpdates";

export default {
  id: "bug-sweep-8b",
  date: "2026-11-04",
  title: "Payment fixes: chargebacks, failed refunds and PayPal",
  summary: "When a customer wins a chargeback, or PayPal reverses a payment, the gift-card part of the order is no longer put back on the card, so the shop doesn't pay twice. A partial refund the bank rejects is now undone: the order no longer shows money refunded that never went back, the copies it restocked come back out of stock, and refunding again works. A PayPal payment from an earlier checkout of the same order now completes the order (or is flagged on the order for a refund) instead of failing, and a second PayPal payment shows under Paid twice. A manual or free payment can no longer revive an order cancelled a moment earlier.",
  links: [{ label: "Open orders", tab: "orders" }],
} satisfies AppUpdate;
