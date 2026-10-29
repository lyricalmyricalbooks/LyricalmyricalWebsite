import type { AppUpdate } from "../appUpdates";

export default {
  id: "quick-view-studio",
  date: "2026-10-29",
  title: "Style every part of the Quick view pop-up",
  summary:
    "The Quick view pop-up that opens from a shop card had a fixed look Studio couldn't reach. Each part of it (the shaded backdrop, the window, the close button, the photo, the title, the price, the short description, the Add to bag button and the link to the full page) can now be clicked in the preview and styled, or hidden, per screen size in Design › Theme settings › Fine-tune one element at a time › Catalog & shared content · layout. You can also choose how much of the description it shows in Book cards in the shop grid › Title & price. Until you change something the pop-up looks exactly as it does today.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
