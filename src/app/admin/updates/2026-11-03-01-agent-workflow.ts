import type { AppUpdate } from "../appUpdates";

export default {
  id: "agent-workflow",
  date: "2026-11-03",
  title: "Changes now follow a plan-check-learn routine",
  summary: "Every change to your shop now starts with a written plan and a read of the lessons learned from your past feedback, and ends only after it has been tested and checked against the live version. Each time you correct something, the lesson is written down so the same mistake isn't repeated. Nothing in the admin or the shop looks different.",
  links: [{ label: "Open overview", tab: "overview" }],
} satisfies AppUpdate;
