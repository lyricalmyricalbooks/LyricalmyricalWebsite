# Overview: Daily desk bento from the owner's mockup

**Asked for:** "okay do the redesign please" with the zip "Admin overview mockup design" (`Admin Overview v3.dc.html`).
**Done means:** the Overview's first tab is the mockup's bento, the header, tabs and other tabs follow its look, and the
rail/top bar match the mockup's shell; built from real data, checked item by item against the mockup.

## Before starting

- [x] Reviewed `tasks/lessons.md` (build all of a chosen concept; high design bar; Masthead rules — see conflict below)
- [x] Read `src/app/admin/CLAUDE.md` (Riso Press, Pressroom, Riso redesign, Overview board sections)

## Plan

- [x] 1. Pure model `overview/overviewDesk.ts` (running totals, chart scale, biggest order, revenue words, tile deltas, jobs, order pills) + tests
- [x] 2. `OverviewDesk.tsx` + `overviewDesk.css`: revenue tile, Needs you, four stat tiles, What changed, Newest orders
- [x] 3. `OverviewBoard`: eyebrow/title/description masthead, pill tabs ("Today" → "Daily desk"), desk on the first tab; the band below drops the widgets the desk already shows
- [x] 4. What changed rows carry a short delta (`Change.delta`), and its revenue driver now moves the same way as revenue
- [x] 5. Shell: Sell / Promote / Shop headings, icons, rounded active item with tomato offset, tomato count squares, one-word wordmark, top-bar crumb, green "Shop open"
- [x] 6. Release note, area guide

## Verification

- [x] Tests: `pnpm test`; new `overviewDesk.test.ts`, nav grouping test
- [x] Typecheck and lint
- [x] Screenshots (local harness with in-memory data): 1440 light + dark, 900, 390, Sales tab

## Review

Mockup item by item: shell grid, wordmark, app switcher, nav groups/icons/badges, crumb, search, Shop open, View storefront;
eyebrow, title, description, pill tabs; revenue tile (label, legend, hero, pill, copy, step chart with Now/Before, end dot,
sticker); Needs you (count pill, Next up, tinted rows with checkbox squares, Reprint); four stat tiles; What changed (markers,
deltas); Newest orders (avatars, copies, pills, All orders). Deliberate differences: the pills are the existing topic tabs
(the mockup's Money / Marketing / Launch week are boards, still in the Board menu); the period picker stays at the right of the
header; the rail keeps What's new and the account row; the other admin pages keep their own content and look.
Conflict noted: lessons ban eyebrows and a description line under titles, but the owner's own mockup has both, so the mockup wins.
