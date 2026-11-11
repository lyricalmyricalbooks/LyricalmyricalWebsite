# Weekly SEO, speed and accessibility audit (11 Nov 2026)

**Asked for:** the scheduled weekly audit: measure the live shop, fix up to 3 small items, auto-merge when green.
**Done means:** live numbers recorded in the PR, up to 3 behaviour-preserving fixes merged, bigger items in issues.

## Before starting

- [x] Reviewed `tasks/lessons.md` (no copy rewording; nothing visible changes; ship early)
- [x] Read `docs/SEO_CRAWLABILITY.md`, last audit PR #883 and open `[Audit]` issues #711–#714

## Plan

- [x] 1. Measure home, 3 book pages, a collection, About, 404 (desktop + phone), checkout with a book in the bag
- [x] 2. Check all 24 sitemap URLs (200, indexable, one canonical), robots.txt, JSON-LD, og:image, alt text
- [x] 3. Fix: home page still has no `<h1>` (last week's fix only covered the Home-sections home; live home shows the grid)
- [x] 4. Fix: empty-bag checkout message outside every landmark (axe `region`)
- [x] 5. Fix: phone Pay bar outside every landmark (axe `region`)

## Verification

- [x] Tests: `pnpm test` (new: MainSite.catalog shop-grid heading, checkoutLandmarks)
- [x] Typecheck and lint: `pnpm run typecheck`, `pnpm run lint`
- [x] Behaviour diffed against `main`: new heading test fails on main, passes here; axe on a local build
- [x] `pnpm run test:storefront`, `pnpm run test:studio`, `vite build`

## Review

The home page fix from 4 Nov landed in the Home-sections branch of `MainSite`, but the live home renders the catalog
branch, so the live page kept 0 `<h1>`. The heading is now one constant used by both branches. With a heading in place,
axe now also reports the existing `heading-order` (h1 → card h3) on the home page, the same finding collections already
have (issue #714). Contrast (#711), About font-swap CLS (#712) and phone script cost (#713) are unchanged.
