import type { AppUpdate } from "../appUpdates";

export default {
  id: "photo-shadow-colour",
  date: "2026-10-28",
  title: "Pick the colour of the book photo's shadow",
  summary: "When the book page's photo has a shadow, it was always black. A new Image shadow colour control (Design › Theme settings › Book page · photos & layout › Photos) lets you tint it to match your palette. Leave it empty and the shadow stays black, so your shop looks exactly as before.",
  links: [{ label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
