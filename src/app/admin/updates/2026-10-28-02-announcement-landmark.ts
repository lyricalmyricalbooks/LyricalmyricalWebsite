import type { AppUpdate } from "../appUpdates";

export default {
  id: "announcement-landmark",
  date: "2026-10-28",
  title: "Announcement bar is now announced by screen readers",
  summary: "The strip above your header was not part of any labelled area of the page, so screen readers skipped past it or read it as stray text. It is now a named region (“Announcement”). Nothing looks different. The name is read aloud only and can be changed in Text & labels › Header › Announcement bar name.",
  links: [{ label: "Open settings", tab: "settings" }],
} satisfies AppUpdate;
