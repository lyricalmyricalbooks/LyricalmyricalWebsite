import type { AppUpdate } from "../appUpdates";

export default {
  id: "pagination-jumps",
  date: "2026-10-30",
  title: "Jump to the first or last page of a long list",
  summary: "Orders, Books, Customers and Inventory now show First and Last buttons beside Previous and Next once a list runs past four pages, so reaching your oldest or newest entries takes one click.",
  links: [{ label: "Open orders", tab: "orders" }],
} satisfies AppUpdate;
