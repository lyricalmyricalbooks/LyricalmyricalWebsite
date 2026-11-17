import type { AppUpdate } from "../appUpdates";

export default {
  id: "page-heading-for-search",
  date: "2026-11-17",
  title: "Section-built pages now carry their title as the main heading",
  summary: "Pages made only from Studio sections, such as Contact, had no main heading, so Google, AI assistants and screen readers had to guess what the page was. They now get the page's own title as a hidden main heading. Nothing changes on screen, and a section that shows its own main heading still takes its place.",
  links: [{ label: "Open Design", tab: "design" }],
} satisfies AppUpdate;
