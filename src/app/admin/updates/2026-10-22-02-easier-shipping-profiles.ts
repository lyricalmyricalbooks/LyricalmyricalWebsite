import type { AppUpdate } from "../appUpdates";

export default {
  id: "easier-shipping-profiles",
  date: "2026-10-22",
  title: "Creating a shipping profile takes one step",
  summary: "Settings › Shipping › Profiles › Create profile now opens one window: name the profile, pick a starting point (Canada, US & everywhere else · Canada & US · Canada only · copy another profile · start empty), type the prices for each zone and an optional free-shipping amount. The profile is ready to use as soon as it is created, and the book picker opens straight after so you can tick the books that use it. Each profile also has a Duplicate button, and the list shows where each one ships and its cheapest price. Inside a profile the steps now run in order: where you ship and the prices, rules, books, then a test.",
  links: [{ label: "Shipping profiles", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
