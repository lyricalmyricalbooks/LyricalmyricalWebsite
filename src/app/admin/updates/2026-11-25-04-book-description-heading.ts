import type { AppUpdate } from "../appUpdates";

export default {
  id: "book-description-heading",
  date: "2026-11-25",
  title: "A heading above each book's description",
  summary: "Each book can now have its own heading above the description, such as \"A photobook about Greyhound bus journeys\". Google reads it as the main subject of the page, so it helps the book show up for searches on its theme, not only its title. Add it in Catalog: open a book, then Search engine listing, then Heading above the description. It uses your description heading style from Studio. Leave it blank and nothing changes.",
  links: [{ label: "Open Catalog", tab: "catalog" }],
} satisfies AppUpdate;
