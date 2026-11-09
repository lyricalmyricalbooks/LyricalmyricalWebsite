# Pressroom, refreshed (design direction D)

Owner picked direction D (https://claude.ai/artifact/PhkLDg7HR26ow7NYk6QDgp) on 9 November 2026. Build every item of it.

## Concept items
- [x] Overview: ink "Needs you" strip under the title (orders to pack, orders to ship, requests, reviews, messages,
      the title closest to selling out, sold out) with one flare button (Start packing / Ship orders).
- [x] Overview: headline figures say what moved in words ("$96 more than yesterday"), glyph + word, no % badge.
- [x] Orders list: each row's last column is its next step as a button (Pack, Ship, Answer, Hand over…), opening the order.
- [x] Rail: live counts (Orders, Reviews, Messages, privacy already there) and Settings under one heading (already there).
- [ ] Rail: "3 low" on Inventory. Skipped: needs a books read in the shell every 5 minutes; the strip shows low stock instead.

## Build
- [x] `overview/needsStrip.ts` (pure, tested) + `overview/NeedsStrip.tsx`; `BoardHeader.needs` slot in `OverviewBoard`.
- [x] `overview/trendWords.ts` (pure, tested); headline figure feet use it.
- [x] `orderNextStep.ts` (pure, tested); new last column in `Orders.tsx`.
- [x] CSS in the Pressroom layer of `riso/riso.css`, scoped `.rp:not(.studio-editor)`, night mode through rail tokens.
- [x] Release note, admin CLAUDE.md note.

## Verify
- [x] `pnpm test` (touched suites + full), `pnpm run typecheck`, `pnpm run lint`, `vite build`.
- [x] Screenshot Overview + Orders (fixture harness or test render) at desktop and phone.

## Review
- Built: Needs you strip (light, night, empty, phone checked in screenshots), figures in words, Next step on Orders rows
  and phone cards, board widget renamed "Every open job" so the page has one "Needs you".
- Left out of concept D: the Inventory rail "N low" count (extra reads every 5 minutes); the sales-by-hour and "Selling now"
  panels in the mock-up already exist as board widgets, so nothing new was added for them.
- Checks: pnpm test 607 files / 4126 tests pass (clean `pnpm install --frozen-lockfile`; the stray npm install had broken
  node_modules), typecheck and lint clean, vite build OK. Screens from a throwaway harness (not committed).
