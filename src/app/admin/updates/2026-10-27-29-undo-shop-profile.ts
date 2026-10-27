import type { AppUpdate } from "../appUpdates";

export default {
  id: "undo-shop-profile",
  date: "2026-10-27",
  title: "Shop settings file change undone",
  summary: "Earlier today the shop started reading its connection settings from a small file when a page opened. That change has been undone at your request, so the shop is back exactly as it was this morning. Nothing you or your customers see was affected either way.",
  links: [{ label: "Open settings", tab: "settings" }],
} satisfies AppUpdate;
