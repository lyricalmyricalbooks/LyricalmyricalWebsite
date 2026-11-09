# Sub tabs: ink switch (direction C) and new names

Owner picked direction C (https://claude.ai/artifact/NRoSaz44MZurtuncspS8Rj) on 9 November 2026.

- [x] `Tabs variant="switch"` in `riso/components.tsx`; CSS in the Pressroom layer, night mode, phone slide, focus.
- [x] Used on Settings › General and Payments (`SettingsTabs`), Shipping, Email sender, Inventory.
- [x] Renames (ids and address slugs unchanged): General, Payments, Shipping, Email sender, Inventory; words that named the
      old tabs in alerts, hints and buttons updated (adminAlerts, AdminAlerts, shippingHealth, testSaleWalkthrough, BookEditor,
      Payments › Shippo button, Studio hint for the Google address credit).
- [x] Carries the unmerged review fix for the Needs you strip (PR 884 merged before it was pushed).
- [x] Release note, admin CLAUDE.md note.
- [x] Verify: screenshots (light, night, phone, keyboard focus) from a throwaway harness; full tests, typecheck, lint, build.

## Review
- Other underlined tab rows (Orders queues, Book editor, Overview topics, shipping profile tabs) keep their look on purpose:
  the brief was the sub tabs under a page title.
