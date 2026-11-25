import type { AppUpdate } from "../appUpdates";

export default {
  id: "hide-book-images",
  date: "2026-11-25",
  title: "Hide a book image from the website without deleting it",
  summary: "Each image in a book's Media tab now has a Hide button. A hidden image stays saved with the book in the admin (faded, with a \"Hidden\" tag) but is left out of the book page, the shop's cards and bag, Google's product details, the Google Shopping feed and the image sitemap. Press Show to bring it back. If the first image is hidden, the next shown image becomes the cover everywhere, and Make cover on a hidden image shows it again. A book always keeps at least one image on show.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
