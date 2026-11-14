import type { AppUpdate } from "../appUpdates";

export default {
  id: "order-page-next-step",
  date: "2026-11-14",
  title: "The order page tells you the one next step",
  summary: "Each order now opens with the customer's name, one status word and a thin three-part bar (check address, pack, ship). Below it, one card says what to do next with a single main button. Where it goes and what's in the parcel sit side by side, and the history folds into one line. On phones the main button stays at the bottom of the screen. Labels, payments and refunds work exactly as before.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
