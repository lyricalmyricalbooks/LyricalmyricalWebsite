import type { AppUpdate } from "../appUpdates";

export default {
  id: "claude-ai-writer",
  date: "2026-11-26",
  title: "Claude can write your drafts, and only spends credits you bought",
  summary: "The AI writing assistant can now use Claude. Save a Claude key from your Anthropic account and choose Quick (the cheapest) or Best writing. Claude only runs on credits you buy ahead, so you are never billed afterwards. When the credits run out, Claude pauses and says so; add credits and press Try again. You can also set a monthly limit here (5 dollars to start), and the card shows what this month has cost so far. While Claude is paused, another saved AI keeps writing unless you switch that off. This takes effect once the server update deploys.",
  links: [{ label: "Open AI writing assistant", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
