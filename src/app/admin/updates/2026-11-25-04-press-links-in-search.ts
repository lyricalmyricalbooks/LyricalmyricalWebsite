import type { AppUpdate } from "../appUpdates";

export default {
  id: "press-links-in-search",
  date: "2026-11-25",
  title: "Press links no longer open a book's Google summary",
  summary: "When a book description starts with a \"Press:\" line (The Hound, Un Fantastico Altrove), Google and AI assistants used to read \"Press: Macleans Magazine article Musee Magazine\" as the first words about the book. They now start with what the book is about, and the press links are told to Google as articles written about the book, which helps it trust the page. The book page itself looks exactly the same. Link previews on social apps also describe the cover photo instead of repeating the title.",
  links: [{ label: "Open Catalog", tab: "catalog" }],
} satisfies AppUpdate;
