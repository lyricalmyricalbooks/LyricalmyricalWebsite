import type { AppUpdate } from "../appUpdates";

export default {
  id: "real-not-found-for-missing-books",
  date: "2026-11-25",
  title: "Misspelt book addresses now tell Google the page doesn't exist",
  summary: "A made-up or misspelt book, collection or page address used to answer Google with \"page found\" and an empty book template, which wastes the few visits Google gives a new site. Those addresses now answer \"not found\" while shoppers still see the shop's missing-page screen, and a book you publish still opens straight away. About is now marked as the page about the shop itself, and Contact as its contact page, so Google and AI answers link them to Lyricalmyrical Books.",
  links: [{ label: "Open Catalog", tab: "catalog" }],
} satisfies AppUpdate;
