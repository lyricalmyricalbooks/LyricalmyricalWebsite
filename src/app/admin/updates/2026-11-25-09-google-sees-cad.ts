import type { AppUpdate } from "../appUpdates";

export default {
  id: "google-sees-cad",
  date: "2026-11-25",
  title: "Google always sees prices in Canadian dollars",
  summary: "Google reads the shop from the United States, so book pages showed it US-dollar prices, while the shopping feed and the shipping rates say Canadian dollars. Search engines, Search Console's page check and Google Shopping's crawler now always get Canadian dollars, so the price Google shows matches the feed. Shoppers are unchanged: they still start in the currency of where they are and can switch it themselves. This takes effect with the next storefront deploy.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
