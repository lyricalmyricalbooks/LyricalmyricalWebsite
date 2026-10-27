import type { AppUpdate } from "../appUpdates";

export default {
  id: "discount-save-checks",
  date: "2026-10-27",
  title: "Discounts are checked before they save",
  summary: "Creating, editing or pausing a discount now checks every field has the right kind of value before anything is saved. If one doesn't, the save stops and tells you which field, instead of storing a discount that checkout might later misread. Your existing discounts open and save as before.",
  links: [{ label: "Open discounts", tab: "discounts" }],
} satisfies AppUpdate;
