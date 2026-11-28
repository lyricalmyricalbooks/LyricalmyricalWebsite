import type { AppUpdate } from "../appUpdates";

export default {
  id: "prevent-soft-404-on-load-error",
  date: "2026-11-28",
  title: "Keep prerendered book & artist pages intact if live catalog fetch fails",
  summary: "If Firestore times out or is blocked while a search crawler renders a page, the storefront now falls back to the same-origin storefront-data.json snapshot and keeps the server-rendered book, artist, and custom page HTML intact instead of replacing it with an error message that Google can flag as a Soft 404.",
  links: [
    { label: "Check Google indexing in Books", tab: "catalog" },
  ],
} satisfies AppUpdate;
