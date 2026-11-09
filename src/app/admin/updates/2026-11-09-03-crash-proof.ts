import type { AppUpdate } from "../appUpdates";

export default {
  id: "crash-proof",
  date: "2026-11-09",
  title: "Fewer dead ends after an update",
  summary: "When a new version of the shop goes live, a shopper who had a page open could hit an error the next time they clicked to another page, because their browser still asked for the old version. The shop now reloads itself once into the new version instead. In the admin, a page that fails to open now shows a short message inside that page with Try again, and the side menu keeps working; before, one broken page replaced the whole admin with an error screen. The book editor and Design studio get a Close button on that message too. If something deeper ever breaks while the shop starts up, shoppers now see a Reload button instead of a blank white page.",
  links: [{ label: "See shop errors", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
