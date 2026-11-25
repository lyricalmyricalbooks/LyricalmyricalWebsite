import type { AppUpdate } from "../appUpdates";

export default {
  id: "real-not-found-status",
  date: "2026-11-25",
  title: "Mistyped book and page addresses now tell Google they don't exist",
  summary: "A wrong or old book address (for example a typo in a link) used to answer Google as if it were a real, indexable page, which wastes Google's visits and can look like thin content. These addresses now answer \"not found\", so Google drops them and spends its time on your real books. Shoppers still see the same not-found page and suggestions. A newly published book can answer \"not found\" to Google for up to about 20 minutes, until the shop's regular refresh adds its page.",
  links: [{ label: "Open Catalog", tab: "catalog" }],
} satisfies AppUpdate;
