import type { AppUpdate } from "../appUpdates";

export default {
  id: "shopify-seo-parity",
  date: "2026-11-25",
  title: "Old links keep working, and collections get their own Google listing",
  summary: "Three things Shopify does for search that the shop now does too. When you change a live book's web address and save, the old address forwards to the new one by itself, so links already shared keep working. Each shop category has an optional title and description for Google, with a preview, under Studio › Navigation › Shop categories › Edit. And the URL redirects you list in Settings › General are answered by the web server as permanent redirects, which search engines trust most, instead of after the page loads. That last part takes effect with the next storefront deploy.",
  links: [{ label: "Open Books", tab: "catalog" }, { label: "Edit categories in Studio", tab: "settings", settingsTab: "designer" }, { label: "URL redirects", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
