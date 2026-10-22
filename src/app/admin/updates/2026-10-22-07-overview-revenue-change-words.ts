import type { AppUpdate } from "../appUpdates";

export default {
  id: "overview-revenue-change-words",
  date: "2026-10-22",
  title: "Overview: the revenue and visitors lines in What changed read in plain words",
  summary: "Today › What changed opened with \"Revenue down 43% on the 30 days before\" and \"CA$200.00 vs CA$350.00, mostly from fewer orders\". It now reads like the book and country lines below it: \"Revenue fell by 43%\", then \"Mostly from fewer orders (CA$200.00 now, CA$350.00 in the 30 days before; 2 orders vs 4)\". The visitors line says \"Visitors fell by 43%\" with \"120 visitors now, 210 in the 30 days before\". Same figures as before, only the wording changed.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
