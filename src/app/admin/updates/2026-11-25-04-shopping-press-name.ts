import type { AppUpdate } from "../appUpdates";

export default {
  id: "shopping-press-name",
  date: "2026-11-25",
  title: "Google Shopping listings name the press",
  summary: "Every book in the Google Shopping file now ends its description with \"Published by Lyricalmyrical Books.\" when the description doesn't already mention the press, and lists the press as the book's Publisher. Someone typing the press's name into Google can then match every book, not only the ones whose blurb happened to mention it. Nothing in your wording is replaced. Google reads the file once a day, so listings update within about a day of this going live.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
