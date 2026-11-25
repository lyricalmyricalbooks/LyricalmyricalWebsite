import type { AppUpdate } from "../appUpdates";

export default {
  id: "no-empty-page-for-google",
  date: "2026-11-25",
  title: "Book and info pages no longer look empty to Google while loading",
  summary: "Google marked The Hound, Cream Show, Submissions and the returns page as empty (a \"soft 404\") and left them out of search, because it sometimes caught them on the Loading screen. While a page is still loading, visitors and Google now keep seeing the finished page the shop already sent, with its title and description. Google has been asked to visit those pages again.",
  links: [{ label: "Open Catalog", tab: "catalog" }],
} satisfies AppUpdate;
