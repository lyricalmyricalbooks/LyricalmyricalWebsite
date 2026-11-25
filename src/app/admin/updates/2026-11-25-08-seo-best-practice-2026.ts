import type { AppUpdate } from "../appUpdates";

export default {
  id: "seo-best-practice-2026",
  date: "2026-11-25",
  title: "Bing hears about new books within minutes, and Google learns the shop's other names",
  summary: "Three additions from a check against current Google and Bing advice. After each storefront deploy, the shop now tells Bing (which also feeds Copilot, DuckDuckGo and ChatGPT search) exactly which pages are new, changed or removed, instead of waiting for Bing to crawl again; Google keeps reading the sitemap. The home page now tells Google other spellings of the shop's name (\"Lyricalmyrical\", \"Lyrical Myrical Books\"), which helps when people search for it written differently; edit them in Studio › Text & labels › Site & sharing › Other names for the shop. And the shop's returns rule, already on every book, is now also stated once for the whole shop, the way Google has preferred since late 2025. On book pages, each artist named on a book is now marked as the same person as their artist page on the shop, so Google can connect the two, and a book's language is given as the standard code Google expects (\"Italian, English\" becomes Italian and English rather than one unknown language). The Bing step takes effect with the next storefront deploy.",
  links: [{ label: "Open Design", tab: "design" }, { label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
