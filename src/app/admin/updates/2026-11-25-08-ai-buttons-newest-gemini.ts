import type { AppUpdate } from "../appUpdates";

export default {
  id: "ai-buttons-newest-gemini",
  date: "2026-11-25",
  title: "Describe with AI and the other AI buttons work again",
  summary: "Every Write with AI and Describe with AI button had started failing with \"Google's AI service is busy\", because the shop still asked first for Google's Gemini 2.5 Flash, which Google is retiring on 1 December 2026, and gave up instead of trying another model. The shop now asks for Google's newest Gemini Flash first (directly and through OpenRouter) and moves on to the next model when one is retired, busy or out of allowance, so a retired version can no longer break the buttons. Your saved keys and settings stay as they are.",
  links: [{ label: "Open Books", tab: "catalog" }, { label: "AI settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
