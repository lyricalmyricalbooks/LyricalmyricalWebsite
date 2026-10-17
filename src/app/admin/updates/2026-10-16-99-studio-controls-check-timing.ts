import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-controls-check-timing",
  date: "2026-10-16",
  title: "Automatic checks run again; Studio control check waits for the bag",
  summary: "Maintenance: the automatic check that changes every Studio control now waits until the preview has drawn the shop, and keeps asking until the shopping bag or pop-up is open, before it tests their controls. On slower test machines it used to check the bag controls before the bag opened and report them as broken. It also repairs the package lockfile a dependency update had left out of step (every automatic check stopped at install) and keeps the test runner on version 4. Nothing in Studio or the shop changes.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
