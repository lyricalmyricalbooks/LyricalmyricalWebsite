import type { AppUpdate } from "../appUpdates";

export default {
  id: "bundle-box-editable",
  date: "2026-10-30",
  title: "Edit the “Frequently bought together” box on book pages",
  summary:
    "The box that offers two books together on a book page couldn't be clicked in the Design preview, and its parts had no settings of their own. Now the box, its heading, the two covers, the titles and total, and the Add both button can each be clicked in the preview and adjusted (show or hide, spacing, corners, colours, text size) for computers, tablets and phones, in Design › Theme settings › Product details · content layout. The words stay in Text & labels › Product page. Until you change something the box looks exactly as it does today.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
