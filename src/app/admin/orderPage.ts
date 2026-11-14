// The order page, concept A "Next step" (owner's pick, 14 November 2026): one status pill in the header and a
// three-part progress bar in place of the Paid badge, the queue badge, the step boxes and the checklist ticks,
// which all said the same thing. Pure, tested.
import type { BadgeTone } from "./riso/components";
import { addressKey, disputeOpen, fulfillmentMethod, packingKey, physicalItems, queueOf, refundFailed, terminal } from "./fulfillment";

/** A paid order waiting only on its address check (no hold, request, dispute or failed refund in the way). */
export function onlyAddressLeft(o: any): boolean {
  if (!o || queueOf(o) !== "Needs attention" || o.paymentStatus !== "paid" || o.isTest || o.operations?.hold || !o.items?.length) return false;
  if (o.customerRequest?.status === "open" || disputeOpen(o) || refundFailed(o)) return false;
  return fulfillmentMethod(o) !== "pickup" && o.operations?.addressReviewed !== addressKey(o);
}

/** The one status word in the order page's header. */
export function orderPill(o: any): { tone: BadgeTone; text: string } {
  if (o?.paymentStatus === "refunded") return { tone: "neutral", text: "Refunded" };
  if (o?.paymentStatus === "refund_pending") return { tone: "warning", text: "Refund in progress" };
  if (terminal(o || {})) return { tone: "neutral", text: "Cancelled" };
  const q = queueOf(o || {});
  if (q === "Needs attention") {
    if (o?.isTest) return { tone: "neutral", text: "Test order" };
    if (o?.operations?.hold) return { tone: "warning", text: "On hold" };
    return onlyAddressLeft(o) ? { tone: "warning", text: "Check address" } : { tone: "danger", text: "Needs you" };
  }
  const words: Record<string, { tone: BadgeTone; text: string }> = {
    "Ready to pack": { tone: "warning", text: "Ready to pack" },
    "Ready to ship": { tone: "info", text: "Ready to ship" },
    "Ready for pickup": { tone: "info", text: "Ready for pickup" },
    "Ready for local delivery": { tone: "info", text: "Ready to deliver" },
    "Awaiting release": { tone: "info", text: "Pre-order" },
    "In transit": { tone: "info", text: "On the way" },
    Unpaid: { tone: "neutral", text: o?.paymentStatus === "pending" ? "Waiting on payment" : "Not paid" },
  };
  if (words[q]) return words[q];
  if (o?.items?.length && !physicalItems(o).length) return { tone: "success", text: "Done" };
  if (o?.fulfillmentStatus === "collected") return { tone: "success", text: "Collected" };
  if (o?.fulfillmentStatus === "delivered") return { tone: "success", text: "Delivered" };
  return { tone: "success", text: "Done" };
}

export type ProgressPart = { key: "address" | "pack" | "ship"; label: string; state: "done" | "now" | "todo" };


/**
 * Check address → Pack → Ship, for a paid parcel or local delivery that is still moving. Pickup orders skip the address.
 * Empty when there is nothing to track (unpaid, cancelled, refunded, digital-only).
 */
export function orderProgress(o: any): ProgressPart[] {
  if (!o || o.paymentStatus !== "paid" || terminal(o) || !physicalItems(o).length) return [];
  const q = queueOf(o);
  const method = fulfillmentMethod(o);
  const reviewed = method === "pickup" || o.operations?.addressReviewed === addressKey(o);
  const packed = o.operations?.packed === packingKey(o);
  const sent = q === "In transit" || q === "Completed";
  const final = method === "pickup" ? (sent ? "Collected" : "Hand over") : method === "local_delivery" ? (sent ? "Delivered" : "Deliver") : sent ? "Shipped" : "Ship";
  const parts: ProgressPart[] = [
    { key: "address", label: reviewed ? "Address checked" : "Check address", state: reviewed ? "done" : "todo" },
    { key: "pack", label: packed || sent ? "Packed" : "Pack", state: packed || sent ? "done" : "todo" },
    { key: "ship", label: final, state: sent ? "done" : "todo" },
  ];
  const shown = method === "pickup" ? parts.slice(1) : parts;
  // The first part not done is the one happening now, unless the order is waiting on something else (hold, pre-order).
  const waiting = q === "Awaiting release" || (q === "Needs attention" && !onlyAddressLeft(o));
  const next = shown.find((p) => p.state === "todo");
  if (next && !waiting) next.state = "now";
  return shown;
}
