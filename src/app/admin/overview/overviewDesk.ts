// The Overview's "Daily desk" (owner's bento mockup, 12 November 2026): the numbers and words behind its tiles.
// Pure and tested; OverviewDesk.tsx draws them. Sales come from real paid orders (overviewInsights.ts), the jobs
// from the Needs you model (needsStrip.ts), so the desk never counts differently from the rest of the admin.
import { change, orderDay, orderStatusWords, refundedAmount, type Order, type PeriodTotals } from "./overviewInsights";
import { buildRangeSeries } from "./overviewSeries";
import type { Range } from "./overviewRange";
import { queueOf } from "../fulfillment";
import { needsAction, needsItems, type NeedsInput, type NeedsLink } from "./needsStrip";

export type Dir = "up" | "down" | "same";
const num = (v: unknown) => Number(v) || 0;

/** Whole dollars for a big tile ("CA$210", "CA$1,240"); the exact amount goes in the tile's title. */
export const wholeMoney = (n: number) => `${n < 0 ? "−" : ""}CA$${Math.round(Math.abs(num(n))).toLocaleString("en-CA")}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-12" → "12 Oct". */
export const dayLabel = (key: string) => {
  const [, m, d] = key.split("-").map(Number);
  return m && d ? `${d} ${MONTHS[m - 1]}` : key;
};

/** "the last 30 days" → "last 30 days" (the revenue tile's label already reads "Revenue ·"). */
export const plainPhrase = (phrase: string) => phrase.replace(/^the /, "");

// ── Revenue tile ────────────────────────────────────────────────────────────────────────────────────────────────

export type RevenueSteps = { days: string[]; now: number[]; before: number[] };

/** Revenue added up day by day across the period, and across the period it is compared with (same positions). */
export function revenueSteps(paid: Order[], range: Range): RevenueSteps {
  const points = buildRangeSeries(paid, range, () => 0);
  let a = 0, b = 0;
  return {
    days: points.map(p => p.date),
    now: points.map(p => (a += p.revenue)),
    before: points.map(p => (b += p.prevRevenue)),
  };
}

/** The chart's top and its gridlines: four even steps to a round number at or above the highest point. */
export function chartScale(max: number): { top: number; ticks: number[] } {
  if (!(max > 0)) return { top: 100, ticks: [0, 25, 50, 75, 100] };
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map(f => f * mag)
    // Whole-dollar steps once the top is a few dollars, so rounded tick labels never sit at the wrong height.
    .find(s => s * 4 >= max && (max < 4 || Math.abs(s - Math.round(s)) < 1e-9)) || Math.ceil(raw);
  return { top: step * 4, ticks: [0, 1, 2, 3, 4].map(i => Math.round(step * i * 100) / 100) };
}

/** Four day labels spread across the period (first, two between, last); fewer for a short period. */
export function axisDays(days: string[]): Array<{ index: number; label: string }> {
  if (days.length === 0) return [];
  if (days.length <= 4) return days.map((d, index) => ({ index, label: dayLabel(d) }));
  const last = days.length - 1;
  return [0, Math.round(last / 3), Math.round((2 * last) / 3), last].map(index => ({ index, label: dayLabel(days[index]) }));
}

const net = (o: Order) => Math.max(0, num(o.total) - refundedAmount(o));

/** The period's biggest order, for the sticker on the chart: "#1002 · CA$360 · 10 Nov". */
export function biggestOrder(current: Order[], days: string[]): { id: string; label: string; index: number } | null {
  let best: Order | null = null;
  current.forEach(o => { if (net(o) > 0 && (!best || net(o) > net(best))) best = o; });
  if (!best) return null;
  const o = best as Order;
  const key = orderDay(o.createdAt);
  const at = days.findIndex(d => d >= key);
  const index = at === -1 ? days.length - 1 : at;
  return { id: o.id, index, label: `${o.orderId || o.id} · ${wholeMoney(net(o))} · ${dayLabel(days[index] || key)}` };
}

/** The pill beside the big number: "▲ 31%", "▼ 6%", "New" (nothing before), "Level". */
export function revenuePill(now: number, before: number): { dir: Dir; text: string } {
  const c = change(now, before);
  if (c === null) return { dir: "up", text: "New" };
  if (Math.abs(c) < 0.5) return { dir: "same", text: "Level" };
  return { dir: c > 0 ? "up" : "down", text: `${Math.abs(c).toFixed(0)}%` };
}

/** One sentence under the big number: where it came from and what drove it. */
export function revenueLine(cur: PeriodTotals, prev: PeriodTotals, phrase: string, before: string, money: (n: number) => string): string {
  if (cur.orders === 0) return prev.orders > 0 ? `No paid orders in ${phrase}, against ${money(prev.net)} in ${before}.` : `Revenue shows here as soon as a customer pays.`;
  if (prev.net <= 0) return `${cur.orders.toLocaleString()} paid ${cur.orders === 1 ? "order" : "orders"}, with nothing in ${before}.`;
  const dir = cur.net >= prev.net ? "Up" : "Down";
  if (Math.abs(cur.net - prev.net) < 0.005) return `Level with ${before}: ${money(prev.net)}.`;
  // The driver is whichever of orders and basket size moved the same way as revenue (the bigger, when both did).
  const up = cur.net > prev.net;
  const ordersMove = change(cur.orders, prev.orders) ?? 0, aovMove = change(cur.aov, prev.aov) ?? 0;
  const agrees = (m: number) => (up ? m > 0 : m < 0);
  const byOrders = agrees(ordersMove) && (!agrees(aovMove) || Math.abs(ordersMove) >= Math.abs(aovMove));
  const driver = byOrders
    ? `${up ? "more" : "fewer"} orders: ${cur.orders.toLocaleString()} now, ${prev.orders.toLocaleString()} before`
    : `${cur.aov >= prev.aov ? "bigger" : "smaller"} baskets: ${money(cur.aov)} an order, ${cur.aov >= prev.aov ? "up" : "down"} from ${money(prev.aov)}`;
  return `${dir} from ${money(prev.net)}, ${dir === "Up" ? "thanks to" : "with"} ${driver}.`;
}

// ── Stat tiles ──────────────────────────────────────────────────────────────────────────────────────────────────

/** A tile's foot: "▲ 1 more", "▼ 2 fewer", "▲ CA$50.00", "Same as before". */
export function tileDelta(now: number, before: number, kind: "count" | "money", money: (n: number) => string): { dir: Dir; text: string } {
  const d = now - before;
  if (Math.abs(d) < (kind === "money" ? 0.005 : 0.5)) return { dir: "same", text: "Same as before" };
  const dir: Dir = d > 0 ? "up" : "down";
  return { dir, text: kind === "money" ? money(Math.abs(d)) : `${Math.abs(d).toLocaleString()} ${d > 0 ? "more" : "fewer"}` };
}

// ── Needs you tile ──────────────────────────────────────────────────────────────────────────────────────────────

export type DeskTint = "sky" | "blush" | "mint" | "butter" | "paper";
export type DeskJob = { id: string; text: string; detail: string; tint: DeskTint; warn?: boolean; action?: string; to: NeedsLink };

const JOB_LOOK: Record<string, { detail: string; tint: DeskTint; action?: string }> = {
  pack: { detail: "Paid, waiting for a parcel.", tint: "butter" },
  ship: { detail: "Packed, waiting for a label", tint: "sky" },
  requests: { detail: "Needs a decision", tint: "blush" },
  reviews: { detail: "Readers are waiting to see it", tint: "mint" },
  messages: { detail: "From the contact form", tint: "sky" },
  lowest: { detail: "Reprint advised", tint: "paper", action: "Reprint" },
  soldOut: { detail: "Customers can't buy these", tint: "blush" },
};

/**
 * The Needs you tile: the "Next up" card (the job the flare button does: pack, else ship), the other jobs as rows,
 * and how many jobs are open (the low-stock line is a warning, not a job, so it isn't counted).
 */
export function deskNeeds(input: NeedsInput): { next: (DeskJob & { action: string }) | null; rows: DeskJob[]; open: number | null } {
  const items = needsItems(input);
  const action = needsAction(input);
  const jobs: DeskJob[] = items.map(i => ({ id: i.id, text: i.text, ...(i.warn ? { warn: true } : {}), to: i.to, ...JOB_LOOK[i.id] }));
  const nextId = action ? (action.to.queue === "Ready to pack" ? "pack" : "ship") : null;
  const nextJob = jobs.find(j => j.id === nextId);
  const loading = input.toPack === null || input.toShip === null || input.reviews === null || input.messages === null;
  return {
    next: nextJob && action ? { ...nextJob, action: action.label } : null,
    rows: jobs.filter(j => j.id !== nextId),
    open: loading && items.length === 0 ? null : items.filter(i => i.id !== "lowest").reduce((s, i) => s + i.count, 0),
  };
}

// ── Newest orders tile ──────────────────────────────────────────────────────────────────────────────────────────

/** "Mara Ellison" → "ME"; an email → its first letter; nothing → "?". */
export function initials(name: string): string {
  const words = String(name || "").replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  if (!words.length) return "?";
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export type PillTone = "ok" | "warn" | "bad" | "info" | "neutral";
/** A newest order's status, by the Orders queues: what happens next, or how it ended. */
export function deskOrderPill(o: Order): { tone: PillTone; text: string } {
  const words = orderStatusWords(o);
  if (words === "Refunded") return { tone: "bad", text: "Refunded" };
  if (words === "Partly refunded") return { tone: "warn", text: "Partly refunded" };
  if (words === "Completed") return { tone: "ok", text: "Done" };
  if (words === "Shipped") return { tone: "neutral", text: "Shipped" };
  if (words === "Pre-order") return { tone: "info", text: "Pre-order" };
  if (words === "Needs attention") return { tone: "bad", text: "Needs attention" };
  const q = queueOf(o);
  return q === "Ready to pack" ? { tone: "warn", text: "Ready to pack" } : { tone: "info", text: q };
}

export const copiesIn = (o: Order) => (o.items || []).reduce((n: number, i: any) => n + num(i?.quantity), 0);
