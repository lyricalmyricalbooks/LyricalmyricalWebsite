import type { AppUpdate } from "../appUpdates";

export default {
  id: "seo-footer-artists-and-audit",
  date: "2026-11-28",
  title: "Site-wide Artists footer link and Admin SEO Audit",
  summary: "Added an Artists link to the storefront footer (toggleable under Studio › Footer & social links) so every page links to your artist directory, and added an SEO Audit button in Books to flag live books and published pages with short or over-long search descriptions, thin copy, missing photo descriptions, missing ISBN-13s, or missing artist links.",
  links: [
    { label: "Open Books SEO Audit", tab: "catalog" },
    { label: "Footer Artists toggle in Studio", tab: "settings", settingsTab: "designer" },
  ],
} satisfies AppUpdate;
