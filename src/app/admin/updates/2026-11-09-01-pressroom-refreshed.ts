import type { AppUpdate } from "../appUpdates";

export default {
  id: "pressroom-refreshed",
  date: "2026-11-09",
  title: "Overview leads with what needs you",
  summary: "The Overview now opens with a dark Needs you strip under the title: orders to pack and ship, cancel or return requests, reviews, messages, the book closest to selling out and anything sold out. Each one opens the page that deals with it, and Start packing takes you straight to the orders waiting to be packed. The headline figures now say what moved in plain words, like “CA$96.00 more than yesterday”, instead of a percentage. On Orders, every row ends with its next step as a button (Pack, Ship, Review, Hand over…) that opens the order at that step.",
  links: [{ label: "Open the Overview", tab: "overview" }, { label: "Open orders", tab: "orders" }],
} satisfies AppUpdate;
