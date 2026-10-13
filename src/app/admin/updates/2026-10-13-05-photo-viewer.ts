import type { AppUpdate } from "../appUpdates";

export default {
  id: "photo-viewer",
  date: "2026-10-13",
  title: "Product photos: enlarge in a full-screen viewer",
  summary: "Book pages now have an Enlarge button on the main photo. It opens the photos full screen with arrows, keyboard keys and Escape to close. Turn it off in Studio › Theme settings › Shop & book pages › Photos; change its words in Text & labels › Product page.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
