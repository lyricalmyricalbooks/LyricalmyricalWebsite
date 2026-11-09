# Make the website crash proof

**Asked for:** "make sure my website is crash proof"
**Done means:** no error can leave a shopper on a blank page or stuck on a page left open across a deploy, and one
broken admin page never takes the whole admin down.

## Before starting

- [x] Reviewed `tasks/lessons.md` (admin uses Riso pieces, short copy, screenshots before merging, own release note)
- [x] Read the area guides: `src/app/admin/CLAUDE.md`, `src/app/features/site/CLAUDE.md` › Shop errors

## Audit (what already existed)

- Route-level `ErrorBoundary` (resets on navigation), per-section boundaries (`sectionRender.tsx`), Overview widget
  boundaries, client error reporting (`errorReport.ts`), guarded storage reads, the bag drawer's failed-load fallback.

## Gaps found and plan

- [x] 1. Pages left open across a deploy fail to load the next page's code ("Failed to fetch dynamically imported
      module"): reload once into the new build (`lib/staleBuild.ts`, `vite:preloadError` + both boundaries), at most
      once a minute so a real outage can't loop.
- [x] 2. The providers above the route boundary (theme, currency, bag) had no guard: a throw there was a blank page.
      Outermost `<ErrorBoundary bare>` in `main.tsx` (no saved design, so its own view can't fail the same way).
- [x] 3. One admin page crashing replaced the whole admin with the shop's error panel: `AdminPageBoundary` around the
      page content, the book editor and Design studio (Riso `ErrorState`, Try again, Close for full-screen views).

## Verification

- [x] Tests: `staleBuild.test.ts`, `AdminPageBoundary.test.tsx` (jsdom), full `pnpm test`
- [x] Typecheck and lint
- [x] Build
- [x] Screenshot of the admin error state

## Review

Structural fixes only; no checkout, payment or data paths changed.
