import type { AppUpdate } from "../appUpdates";

export default {
  id: "weekly-audit-missing-pages",
  date: "2026-11-25",
  title: "Missing pages stop naming themselves as real addresses, and artist share pictures get their description",
  summary: "This week's check of the live shop found every page in the sitemap healthy and checkout with a book in the bag free of accessibility problems. Three small fixes: a \"page not found\" screen (for an unknown book, page, artist or address) no longer tells search engines it is the main address for that link, so only real pages carry one. A missing book's address now has the same \"Page not found\" tab title as other missing pages instead of \"Publication\", and screen readers hear its message as the page's main heading. When an artist page is shared, the cover picture is described with that photo's own description from the book's Images tab instead of repeating the page title. Nothing looks different and nothing in Studio changed.",
  links: [{ label: "Open Design", tab: "design" }, { label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
