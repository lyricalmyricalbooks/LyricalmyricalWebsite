import type { AppUpdate } from "../appUpdates";

export default {
  id: "footer-shop-name-look",
  date: "2026-10-27",
  title: "Choose the size and colour of the shop name in the footer",
  summary:
    "The shop name at the bottom of every page had a fixed size and colour that Studio couldn't change. You can now set its size for computers and for phones, and its colour, in Design › Theme settings › Footer & social links › Footer logo & shop name. Until you pick something the footer looks exactly as it does today.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
