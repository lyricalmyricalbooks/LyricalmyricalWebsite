# Calm admin (mockup v4)

**Asked for:** "start the redesign and make it look like v4" · "make sure you follow the mockups"
**Done means:** every admin page uses the v4 look (calm shell, side menu for multi-view pages, 8a Overview, one-card
Inventory, stacked Settings), checked against the mockup item by item, merged with green checks.

## Before starting

- [x] Reviewed `tasks/lessons.md` (build all of a chosen concept in the first PR; compare item by item)
- [x] Read `src/app/admin/CLAUDE.md` (Riso, Pressroom, bento sections)

## Plan

- [x] 1. `riso/calm.css` layer scoped `.rp.rp-calm`, tokens light + dark; `AppShell className`
- [x] 2. Side menu: `Tabs rail`, `RailHost` slot in Dashboard, vertical keys, phone chips; `RAILS` in `nav.ts`
- [x] 3. Settings: `FlatSubTabs` stacks every section; Shipping order + anchors; Store identity first
- [x] 4. Overview: Dashboard header, toolbar only on the board, 8a desk (revenue card + figures, updated line)
- [x] 5. Inventory: one card, toolbar, options popover, cover swatches, footer totals
- [x] 6. Orders, Reviews, Messages rails
- [x] 7. Release note, guide notes

## Verification

- [x] Tests: `pnpm test` (611 files pass; vertical-keys test added)
- [x] Typecheck and lint clean
- [x] Behaviour diffed against `main` (fresh-context review)
- [x] Screenshots 1440 light/dark and 390 for Overview, Orders, Settings, Inventory and the other pages

## Review

Built: everything in v4 that maps to a real admin view. Deliberate differences: alerts stay a full-width band; What's new
stays in the sidebar; the Overview menu uses the real topics, not the mockup's placeholder ones; single-view pages
(Customers, Books, Discounts, Gift cards, Design) get no side menu; no "Order #" menu item; the ship-station desk and the
book editor keep their own tabs; Needs you was removed as in the mockup, its stock signal moved to a red Stock count;
primary buttons keep dark text on red for contrast.
