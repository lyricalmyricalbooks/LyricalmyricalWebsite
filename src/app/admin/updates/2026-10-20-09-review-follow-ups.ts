import type { AppUpdate } from "../appUpdates";

export default {
  id: "review-follow-ups",
  date: "2026-10-20",
  title: "Two small safety fixes: the shopping bag and the Rich text HTML box",
  summary: "If the shopping bag's code ever fails to load on a shopper's phone (a dropped connection, or a page left open while the site updates), the page now keeps working without the bag instead of showing an error. In Design, a Rich text section's toolbar is now switched off while its HTML box is open, so a click on Bold or a list button can no longer overwrite the HTML you are typing.",
  links: [{ label: "Design", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
