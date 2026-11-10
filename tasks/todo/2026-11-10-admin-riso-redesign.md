# Admin redesign from the Riso handoff (everything but Overview and Orders)

**Asked for:** "redesign but do not redesign the overview and orders pages please" (handoff zip "Admin dashboard redesign").
**Done means:** the admin shell and every page except Overview and Orders match the handoff mockups, on real data, with
every existing feature still reachable.

## Before starting

- [x] Reviewed `tasks/lessons.md` (build the whole chosen concept in the first PR; compare item by item before merging)
- [x] Read `src/app/admin/CLAUDE.md` (Riso, Pressroom, sub tabs, address bar)

## Plan

- [x] 1. Shell: 248px ink sidebar, logo block, one flat list (no icons, no headings), Design top-level, Settings sub-pages
      indented only while in Settings, tomato mono counts, account footer.
- [x] 2. Top bar: search button that opens a ⌘K palette (all pages listed when empty), "Store live" status, View storefront.
- [x] 3. Riso layer (`riso.css`, scoped `.rp-rs`): offset-shadow cards, tomato primary buttons, box tabs, square chips,
      2px ink inputs, Anton italic 44px titles. Overview and Orders content are left out of the scope.
- [x] 4. Books: grid of cover cards (default) with filter field + chips; list view keeps ordering and bulk tools.
- [x] 5. Book editor: full page with back link, Unsaved chip, Discard / Save, box tabs.
- [x] 6. Customers: four segment tiles (Win back tomato) + table with segment chip.
- [x] 7. Discounts: coupon cards with value stub.
- [x] 8. Reviews: stacked cards (max 860px), Approve / Reject, handled state with Undo, "N waiting".
- [x] 9. Messages: two-pane inbox in one card, ellipsis on long names/subjects, Reply by email, Mark handled.
- [x] 10. Design: new page (Preview site, Open page editor, Pages, Colours, Type).
- [x] 11. Settings: breadcrumb, title, one line, secondary action + Save changes, sub-page tab row, 2-column card grid.

## Verification

- [x] Tests, typecheck, lint
- [x] Local admin with sample data (fake Firestore) screenshotted next to each mockup
- [x] Overview and Orders content compared with `main`

## Review

- Built: shell, Books grid/list, Customers tiles, Discount cards, Reviews queue with Undo, Messages inbox, Design page,
  Settings header + grid, book editor as a full page. Overview and Orders untouched (no file in their folders changed).
- Follow-up in the same PR: Settings header actions Test a label (Shipping › Labels tab), Download tax report (year-to-date
  CSV from the sales report), Send a test email (Emails tab's Send test box); editor "← Books", ink Unsaved changes chip,
  tabs renamed Media / Formats / Custom fields / SEO (other editor tabs kept, they hold live features). Night mode and
  390px phone checked: no sideways scroll; chosen filter chips fixed for night.
- Checks: pnpm test 4137 passed, typecheck and lint clean, screenshots against each mockup.
