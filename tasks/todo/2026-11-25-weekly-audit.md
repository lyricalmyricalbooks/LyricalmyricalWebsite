# Weekly SEO, speed and accessibility audit — 25 November 2026

**Asked for:** the scheduled weekly audit: measure the live shop, fix up to three small problems, ship and merge.
**Done means:** live measurements recorded in the PR, up to three behaviour-preserving fixes merged with tests.

## Before starting

- [x] Reviewed `tasks/lessons.md` (add SEO wording, never replace it; ship early; merge when green)
- [x] Read `docs/SEO_CRAWLABILITY.md`, AGENTS.md, last audit PR #900 for last week's numbers; no open Audit PR

## Plan

- [x] 1. Measure live: 9 pages × desktop/phone (PerformanceObserver LCP/CLS/TBT, axe-core 4.10.3), all 31 sitemap URLs
      without JavaScript, the same pages after the app starts, missing-page variants, keyboard walk of header, bag, checkout
- [x] 2. Fix: missing pages (404 view, unknown book/page/artist) carried a self canonical + og:url → `useSEO({ notFound })`
- [x] 3. Fix: missing book address titled "Publication" with no level-one heading → "Page not found" title, `role=heading`
- [x] 4. Fix: artist page share picture alt repeated the page title → the cover photo's own alt (`describedAlt`)
- [x] 5. File: unknown `/collections/<x>` answers 200 with the full catalog (hosting rewrite; bigger than a small fix)
- [x] 6. Leave filed: contrast (#711), About font-swap shift (#712), phone photo weight (#713)

## Verification

- [x] Tests: `seo.test.tsx` (missing page drops and the next page restores canonical/og:url), `BookDetail.pending`
      (title, notFound, heading), `ArtistPage.render` (imageAlt, notFound)
- [x] `pnpm test`, typecheck, lint, `vite build`
- [x] No visual change: the not-found message keeps its `<p>` tag and classes

## Review

One flag on `useSEO` instead of four page-level workarounds: the missing state already existed on each page, so each
passes it through and `seo.ts` owns the head tags. Nothing touches checkout, Studio saves, copy wording or rules.
