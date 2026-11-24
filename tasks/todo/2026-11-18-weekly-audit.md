# Weekly SEO, speed and accessibility audit — 18 November 2026

**Asked for:** the scheduled weekly audit: measure the live shop, fix up to three small problems, ship and merge.
**Done means:** live measurements recorded in the PR, up to three behaviour-preserving fixes merged with tests.

## Before starting

- [x] Reviewed `tasks/lessons.md` (relevant: add SEO wording, never replace it; ship early; merge when green)
- [x] Read `docs/SEO_CRAWLABILITY.md`, AGENTS.md, last audit PR #889 for last week's numbers

## Plan

- [x] 1. Measure live: 8 pages × desktop/phone (PerformanceObserver LCP/CLS/TBT, axe-core 4.10.3), all 24 sitemap URLs
- [x] 2. Fix: shop-grid card titles skip a heading level (axe heading-order, home + collections, #714)
- [x] 3. Fix: empty-bag checkout has no level-one heading (axe page-has-heading-one)
- [x] 4. Leave filed: colour contrast (#711), About font-swap shift (#712), phone script/photos (#713)

## Verification

- [x] Tests: `pnpm test` plus `MainSite.catalog.test.tsx` and `checkoutLandmarks.test.ts` additions
- [x] Typecheck and lint
- [x] `vite build`; axe on the local build for home, a collection and the empty checkout
- [x] No visual change: tag and classes unchanged, only `aria-level`

## Review

Both fixes use `aria-level` so the tag (and every style rule keyed to it, including the type-scale sizes) stays the
same: changing `<h3>` to `<h2>` would have enlarged the card titles under `[data-fm-store] h2`. Nothing touches
checkout logic, Studio saves or copy.
