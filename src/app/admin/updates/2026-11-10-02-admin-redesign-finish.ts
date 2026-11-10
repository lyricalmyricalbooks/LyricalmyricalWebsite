import type { AppUpdate } from "../appUpdates";

export default {
  id: "admin-redesign-finish",
  date: "2026-11-10",
  title: "The rest of the new admin look",
  summary: "Settings pages each get a quick action in the header: Test a label on Shipping, Download tax report on Taxes (this year so far, as a spreadsheet) and Send a test email on Email sender. The book editor has a Books back link, a clear Unsaved changes label, and shorter tab names: Media, Formats, Custom fields and SEO. Chosen filters are easier to see in night mode, and the Customers groups sit two to a row on phones.",
  links: [{ label: "Open Taxes", tab: "settings", settingsTab: "taxes" }, { label: "See Books", tab: "catalog" }],
} satisfies AppUpdate;
