import type { AppUpdate } from "../appUpdates";

export default {
  id: "artist-pages",
  date: "2026-11-25",
  title: "Every artist now has their own page, so Google can find them by name",
  summary: "Searching an artist's name (for example \"Ian Willms The Hound\") found nothing from the shop, because no page was about the artist. Each photographer credited on a published book now has a page at /artists/their-name, made automatically from the book: the heading \"Ian Willms: photobooks\", a line naming their books, the artist bio, their own website and their books. The artist name on each book page now opens that page and looks exactly as before. The pages are in the sitemap and the summary for AI search; group credits like \"Various artists\" get none. Change the words in Studio › Text & labels › Artist pages, and show or hide each part in Studio › Theme settings › Fine-tune one element at a time › Artist pages · layout & elements. The bio and website come from Books › edit (Artist bio, and Search (SEO) › Artist links). Google lists new pages after its next visit.",
  links: [{ label: "Open Design", tab: "design" }, { label: "See Books", tab: "catalog" }],
} satisfies AppUpdate;
