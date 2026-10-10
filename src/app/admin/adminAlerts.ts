import { currentRows } from "./emailLogDisplay";
import { waitingPreorderLines, preorderClockStart } from "../features/site/preorder";
// Admin-wide alerts shown above every admin page (AdminAlerts.tsx). Pure, tested.
// Payment problems come first: money that arrived but isn't recorded, or vice versa.

export type AlertTone = "danger" | "warning" | "info";
export type AdminAlert = {
  id: string;
  tone: AlertTone;
  title: string;
  detail: string;
  orderIds: string[];
  action: "order" | "orders" | "webhook" | "notifications" | "payments";
};

export type WebhookStatus = { lastReceivedAt?: string | null; lastFailureAt?: string | null; lastFailure?: string | null } | null;

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const STRIPE_GRACE_MS = 10 * MIN;   // the webhook normally lands within seconds
const SHIP_LATE_MS = 3 * DAY;
const MANUAL_LATE_MS = 2 * DAY;

const age = (o: any, now: number) => now - Date.parse(o?.createdAt || "");
const paidAge = (o: any, now: number) => now - Date.parse(o?.paidAt || o?.createdAt || "");
// A pre-order can't ship before its release, so its shipping clock starts when the printed
// pre-orders were released (by date or "Ready to ship now"); digital pre-orders don't count.
const shipAge = (o: any, now: number) => Math.min(paidAge(o, now), now - preorderClockStart(o, o?.operations || {}));
const label = (o: any) => o?.orderId || o?.id;
const list = (orders: any[]) => {
  const names = orders.slice(0, 3).map(label).join(", ");
  return orders.length > 3 ? `${names} and ${orders.length - 3} more` : names;
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const hasStripePayment = (o: any) =>
  String(o?.stripePaymentIntentId || "").startsWith("pi_") || String(o?.stripeCheckoutSessionId || "").startsWith("cs_");
const isFinished = (o: any) => ["cancelled", "completed"].includes(o?.status)
  || ["shipped", "out_for_delivery", "delivered", "cancelled", "refunded", "picked_up"].includes(o?.fulfillmentStatus);

function alert(id: string, tone: AlertTone, title: string, detail: string, orders: any[], action?: AdminAlert["action"]): AdminAlert {
  return { id, tone, title, detail, orderIds: orders.map((o) => o.id), action: action || (orders.length === 1 ? "order" : "orders") };
}

export function buildAdminAlerts(allOrders: any[], webhook: WebhookStatus = null, now = Date.now(), emailLog: any[] = []): AdminAlert[] {
  const orders = (allOrders || []).filter((o) => o && o.isTest !== true);
  const out: AdminAlert[] = [];

  const mismatch = orders.filter((o) => o.paymentMismatch && !o.paymentMismatch.resolvedAt && o.paymentStatus !== "paid" && o.paymentStatus !== "refunded");
  if (mismatch.length) out.push(alert("mismatch", "danger", `${plural(mismatch.length, "payment doesn't", "payments don't")} match the order total`,
    `Stripe or PayPal took a different amount than the order expected: ${list(mismatch)}. Review and refund in Stripe before shipping.`, mismatch));

  const reconciliation = orders.filter(o => o.reconciliationPending && o.paymentStatus !== "paid" && o.paymentStatus !== "refunded");
  if (reconciliation.length) out.push(alert("payment-reconciliation", "danger", `${plural(reconciliation.length, "payment awaits", "payments await")} webhook reconciliation`, `Provider evidence needs reconciliation with a signed webhook: ${list(reconciliation)}. Review Payments webhook health before fulfillment.`, reconciliation));

  const requests = orders.filter((o) => o.customerRequest?.status === "open");
  if (requests.length) out.push(alert("customer-request", "warning", `${plural(requests.length, "customer is", "customers are")} waiting on a cancel or return request`,
    `Answer before packing: ${list(requests)}. Open the order to cancel, refund or mark the request handled.`, requests));

  const paidTwice = orders.filter((o) => Array.isArray(o.duplicatePayments) && o.duplicatePayments.length && o.paymentStatus === "paid" && !isFinished(o));
  if (paidTwice.length) out.push(alert("paid-twice", "danger", `${plural(paidTwice.length, "order was", "orders were")} paid twice`,
    `Stripe took a second payment for an order that was already paid: ${list(paidTwice)}. Refund the extra payment in the Stripe Dashboard.`, paidTwice));

  const overLimit = orders.filter((o) => o.discountOverLimit && o.paymentStatus === "paid" && !isFinished(o));
  if (overLimit.length) out.push(alert("discount-over-limit", "warning", `${plural(overLimit.length, "order used", "orders used")} a discount code past its limit`,
    `Two shoppers used the last copy of a limited code at the same moment: ${list(overLimit)}. Decide whether to honour it before shipping.`, overLimit));

  const stuck = orders.filter((o) => o.paymentStatus === "unpaid" && hasStripePayment(o) && age(o, now) >= STRIPE_GRACE_MS && age(o, now) <= 7 * DAY && !o.paymentMismatch);
  if (stuck.length) out.push(alert("unpaid-stripe", "danger", `${plural(stuck.length, "order is", "orders are")} unpaid after starting a card payment`,
    `The customer may have paid but Stripe hasn't confirmed it to the shop: ${list(stuck)}. Open the order to review provider payment and pending webhook reconciliation. Only a verified payment webhook can mark it paid.`, stuck));

  const disputes = orders.filter((o) => o.disputeStatus && ["needs_response", "warning_needs_response"].includes(o.disputeStatus));
  if (disputes.length) out.push(alert("dispute", "danger", `${plural(disputes.length, "payment dispute needs", "payment disputes need")} a response`,
    `Answer in the Stripe Dashboard before the deadline: ${list(disputes)}.`, disputes));

  const refundFailedOrders = orders.filter((o) => o.paymentStatus === "paid" && o.refund?.status === "failed");
  if (refundFailedOrders.length) out.push(alert("refund-failed", "danger", `${plural(refundFailedOrders.length, "refund was", "refunds were")} rejected by the bank`,
    `The customer was told they were refunded but the money did not go back: ${list(refundFailedOrders)}. Refund again or contact the customer before packing.`, refundFailedOrders));

  if (webhook?.lastFailureAt && (!webhook.lastReceivedAt || webhook.lastFailureAt > webhook.lastReceivedAt) && now - Date.parse(webhook.lastFailureAt) <= 7 * DAY) {
    out.push(alert("webhook", "danger", "Stripe's payment messages are being rejected",
      "The last Stripe webhook failed its security check, so paid orders may stay unpaid. Settings › Payments › Webhook health › Reset webhook signing.", [], "webhook"));
  }

  const partial = orders.filter((o) => o.partiallyRefunded && o.paymentStatus === "paid" && !isFinished(o));
  if (partial.length) out.push(alert("partial-refund", "warning", `${plural(partial.length, "order was", "orders were")} partly refunded in Stripe`,
    `Check what still needs to ship before packing: ${list(partial)}.`, partial));

  const inventoryConflict = orders.filter((o) => o.inventoryConflict && !isFinished(o));
  if (inventoryConflict.length) out.push(alert("inventory-conflict", "danger", `${plural(inventoryConflict.length, "captured payment needs", "captured payments need")} inventory reconciliation`,
    `Payment was captured after its stock hold expired: ${list(inventoryConflict)}. Review the provider payment and contact the customer.`, inventoryConflict));

  // A card/PayPal payment arrived but a gift card could no longer cover its share, so the order was
  // NOT marked paid. Refund the payment or settle the difference with the customer.
  const giftCardConflict = orders.filter((o) => o.giftCardConflict && !o.giftCardConflict.resolvedAt && o.paymentStatus !== "paid" && !isFinished(o));
  if (giftCardConflict.length) out.push(alert("gift-card-conflict", "danger", `${plural(giftCardConflict.length, "payment needs", "payments need")} gift card reconciliation`,
    `A payment arrived but the gift card could no longer cover its part, so the order wasn't marked paid: ${list(giftCardConflict)}. Check the gift card in Gift cards, then refund the payment or contact the customer.`, giftCardConflict));

  // Paid gift-card purchases whose cards were never created (the issuing step failed): the buyer has no code.
  const paidAt = (o: any) => Date.parse(o.paidAt || o.updatedAt || o.createdAt || "") || now;
  const giftCardsMissing = orders.filter((o) => o.paymentStatus === "paid" && !o.isTest && !o.giftCardsIssuedAt
    && (o.items || []).some((item: any) => item && item.giftCard === true) && now - paidAt(o) >= 10 * 60 * 1000);
  if (giftCardsMissing.length) out.push(alert("gift-cards-not-issued", "danger", `${plural(giftCardsMissing.length, "paid gift card order has", "paid gift card orders have")} no gift card yet`,
    `The buyer paid but no gift card code was created: ${list(giftCardsMissing)}. Issue the card from Gift cards › Issue gift card and email it, then note it on the order.`, giftCardsMissing));

  const oversold = orders.filter((o) => o.oversold && o.paymentStatus === "paid" && !isFinished(o));
  if (oversold.length) out.push(alert("oversold", "warning", `${plural(oversold.length, "paid order was", "paid orders were")} oversold`,
    `More copies were sold than were in stock: ${list(oversold)}. Restock or contact the customer.`, oversold));

  const late = orders.filter((o) => o.paymentStatus === "paid" && !isFinished(o) && !waitingPreorderLines(o, o.operations || {}, new Date(now)).length && shipAge(o, now) >= SHIP_LATE_MS);
  if (late.length) out.push(alert("ship-late", "warning", `${plural(late.length, "paid order has", "paid orders have")} waited over 3 days to ship`,
    `Oldest first: ${list(late.sort((a, b) => shipAge(b, now) - shipAge(a, now)))}.`, late));

  const manual = orders.filter((o) => o.paymentStatus === "pending" && age(o, now) >= MANUAL_LATE_MS && o.status !== "cancelled");
  if (manual.length) out.push(alert("manual-pending", "info", `${plural(manual.length, "order is", "orders are")} still waiting for a manual payment`,
    `e-Transfer / cash orders with no payment after 2 days: ${list(manual)}. Confirm the payment or cancel the order.`, manual));

  const uncertain = orders.filter(o => o.operations?.labelPurchasePending === true);
  if (uncertain.length) out.push(alert("label-purchase-uncertain", "danger", `${plural(uncertain.length, "label purchase needs", "label purchases need")} reconciliation`, `Check the existing transaction in Shippo before retrying: ${list(uncertain)}. An uncertain purchase may already have charged for a label.`, uncertain));
  // A queued email's newest row is its outcome: one later sent (or stopped) by the retry queue no longer alarms.
  const current = currentRows(emailLog);
  const queuedEmails = current.filter(e => e.status === "queued");
  if (queuedEmails.length) out.push({ id: "email-queued", tone: "warning", title: `${plural(queuedEmails.length, "email is", "emails are")} waiting to be sent again`, detail: "Every sender refused them, so the shop is retrying automatically. Fix the sending setup in Notifications, then use Retry now.", orderIds: queuedEmails.map(e => String(e.outboxId)), action: "notifications" });
  const failedEmails = current.filter(e => ["failed", "bounced", "complained"].includes(e.status) && now - Date.parse(e.at || "") <= 7 * DAY);
  if (failedEmails.length) out.push({ id: "email-failed", tone: "warning", title: `${plural(failedEmails.length, "recent email needs", "recent emails need")} attention`, detail: "Review Notifications delivery attempts and provider events. Resolve the cause before resending; sent status only proves provider acceptance.", orderIds: failedEmails.map(e => String(e.id || e.at)), action: "notifications" });
  return out;
}

// Alerts from the saved store settings (not orders): test mode left on refuses real cards.
export function settingsAlerts(settings: any): AdminAlert[] {
  if (settings?.payments?.testMode !== true) return [];
  return [{ id: "test-mode", tone: "warning", title: "Test mode is on — real cards are refused",
    detail: "Checkout only accepts Stripe/PayPal test payments and orders are marked as tests. Switch it off in Settings › Payments before selling.", orderIds: [], action: "payments" }];
}

// Changes whenever the set of problems changes, so a dismissed alert comes back
// when a new order joins it.
export function alertSignature(a: AdminAlert): string {
  return `${a.id}:${[...a.orderIds].sort().join(",")}`;
}
