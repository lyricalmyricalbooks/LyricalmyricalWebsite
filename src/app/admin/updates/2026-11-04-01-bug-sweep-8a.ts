import type { AppUpdate } from "../appUpdates";

export default {
  id: "bug-sweep-8a",
  date: "2026-11-04",
  title: "Bug fixes: tracking, reviews, reports and reminders",
  summary: "Carrier tracking now marks a parcel shipped on its first scan even if you never pressed Dispatch, so the customer gets the shipped email and later a review request, and out-for-delivery and delivered dates are recorded. Approving a review stamps Verified purchase again for real buyers. Losses in CSV downloads stay numbers, so spreadsheet totals add up. Cost prices that fail to save in Inventory stay typed in. The Overview keeps packed and on-hold orders right after its quiet refresh, and quick date-range switches no longer show the wrong visits. A bag reminder can no longer go out twice, and a refused one no longer uses up the day's reminder slots.",
  links: [
    { label: "Open orders", tab: "orders" },
    { label: "Open reviews", tab: "reviews" },
    { label: "Open inventory", tab: "inventory" },
  ],
} satisfies AppUpdate;
