import type { AppUpdate } from "../appUpdates";

export default {
  id: "preorder-test-date",
  date: "2026-11-12",
  title: "A pre-order check no longer trips on today's date",
  summary: "One automatic check of the pre-order shipping rules used the real calendar, so it began failing on the sample book's release day. It now uses a fixed date like its neighbours. The shop and the pre-order rules themselves are unchanged.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
