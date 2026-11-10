import type { AppUpdate } from "../appUpdates";

export default {
  id: "admin-riso-redesign",
  date: "2026-11-10",
  title: "A new look for the admin",
  summary: "Every admin page except Overview and Orders has the new Riso look: bold ink outlines, offset shadows and a cleaner side menu. Books open as a grid of covers (switch to the list any time), Customers starts with four groups you can click, Discounts are coupon cards, Reviews stay in place with an Undo after you approve or reject, and Messages is a two-pane inbox. Design now has its own page with your pages, colours and fonts, and the book editor fills the screen. Overview and Orders keep their layout.",
  links: [{ label: "See Books", tab: "catalog" }, { label: "Open Design", tab: "design" }, { label: "See Messages", tab: "messages" }],
} satisfies AppUpdate;
