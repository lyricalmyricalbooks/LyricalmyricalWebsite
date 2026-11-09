// The Overview's "Needs you" strip (Pressroom refreshed, 9 November 2026): one ink line under the title that lists
// the jobs waiting right now, each a link to the page that does it, and one flare button for the biggest job.
// Pure and tested; NeedsStrip.tsx draws it. Counts are live (not tied to the Overview's period).

export type NeedsInput = {
  /** Orders in the "Ready to pack" queue. */ toPack: number | null;
  /** Orders in the "Ready to ship" queue. */ toShip: number | null;
  /** Open cancel or return requests. */ requests: number | null;
  /** Reviews waiting for moderation. */ reviews: number | null;
  /** Unread contact-form messages. */ messages: number | null;
  /** The title closest to selling out (first of the reprint watch). */ lowest: { title: string; stock: number } | null;
  /** Print books or editions with no copies left. */ soldOut: number | null;
};

export type NeedsLink = { tab: string; queue?: string };
export type NeedsItem = { id: string; count: number; text: string; warn?: boolean; to: NeedsLink };
export type NeedsAction = { label: string; to: NeedsLink };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function needsItems(i: NeedsInput): NeedsItem[] {
  const out: NeedsItem[] = [];
  const add = (id: string, count: number | null, text: (n: number) => string, to: NeedsLink, warn?: boolean) => {
    if (count && count > 0) out.push({ id, count, text: text(count), to, ...(warn ? { warn } : {}) });
  };
  add("pack", i.toPack, n => plural(n, "order to pack", "orders to pack"), { tab: "orders", queue: "Ready to pack" });
  add("ship", i.toShip, n => plural(n, "order to ship", "orders to ship"), { tab: "orders", queue: "Ready to ship" });
  add("requests", i.requests, n => plural(n, "cancel or return request", "cancel or return requests"), { tab: "orders", queue: "Needs attention" }, true);
  add("reviews", i.reviews, n => plural(n, "review to approve", "reviews to approve"), { tab: "reviews" });
  add("messages", i.messages, n => plural(n, "message", "messages"), { tab: "messages" });
  if (i.lowest) out.push({ id: "lowest", count: i.lowest.stock, text: `${i.lowest.title}: ${i.lowest.stock} left`, warn: true, to: { tab: "inventory" } });
  add("soldOut", i.soldOut, n => `${n} sold out`, { tab: "inventory" }, true);
  return out;
}

/** The one flare button: pack first, then ship; nothing when no parcel is waiting. */
export function needsAction(i: NeedsInput): NeedsAction | null {
  if (i.toPack && i.toPack > 0) return { label: "Start packing", to: { tab: "orders", queue: "Ready to pack" } };
  if (i.toShip && i.toShip > 0) return { label: "Ship orders", to: { tab: "orders", queue: "Ready to ship" } };
  return null;
}

/** True while any count is still loading (null). */
export const needsLoading = (i: NeedsInput) => i.toPack === null || i.toShip === null || i.reviews === null || i.messages === null;
