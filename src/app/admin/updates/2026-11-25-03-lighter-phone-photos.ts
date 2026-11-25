import type { AppUpdate } from "../appUpdates";

export default {
  id: "lighter-phone-photos",
  date: "2026-11-25",
  title: "Book photos load lighter on phones",
  summary: "On phones, the big photos on a book page were downloaded a size larger than the screen can show, because the shop asked for the full screen width instead of the photo's real width. Phones now get the copy that matches, which is just as sharp: The Hound's page went from about 1.3 MB to 0.8 MB of photos on an iPhone. Faster book pages also help Google rank them.",
  links: [{ label: "Open Catalog", tab: "catalog" }],
} satisfies AppUpdate;
