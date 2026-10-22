import type { AppUpdate } from "../appUpdates";

export default {
  id: "pdp-rating-stars",
  date: "2026-10-22",
  title: "Optional star rating under the book title",
  summary:
    "Like Shopify themes' product rating block, a book page can now show its stars, average and number of reviews right under the title (“★★★★½ 4.3 (12 reviews)”). It uses approved reviews only and stays hidden on books that have none, so no book ever shows a made-up rating. Clicking it opens the Reviews tab. It is off until you switch it on in Design › Theme settings › Book page · photos & layout › Extras on the page, so the live shop is unchanged. The words are in Text & labels › Product page.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
    { label: "Reviews", tab: "reviews" },
  ],
} satisfies AppUpdate;
