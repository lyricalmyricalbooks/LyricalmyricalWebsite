# Adopt Shopify's SEO practices

**Asked for:** "research how shopify does SEO, make improvments to my website"
**Done means:** the gaps between what Shopify does for store SEO out of the box and what the shop does are listed, and
the ones not owned by another thread are built, tested and merged.

## Before starting

- [x] Reviewed `tasks/lessons.md` (add SEO wording rather than replace; admin copy short; ship early)
- [x] Read the area guides: `.github/CLAUDE.md` › Deployment, `src/app/features/site/CLAUDE.md`, `src/app/admin/studio/CLAUDE.md`

## Comparison (Shopify out of the box → this shop)

| Shopify | Here | Gap? |
| --- | --- | --- |
| Self canonical on every page, query stripped | `canonicalUrl` | no |
| Product, Breadcrumb, Organization/WebSite JSON-LD | `bookSeo.ts` (Book+Product, offers, shipping, returns, reviews, breadcrumbs, CollectionPage/ItemList, BookStore) | no |
| sitemap.xml with product images | `sitemapData.mjs` (images, lastmod) | no (24 URLs: a split index adds nothing) |
| Editable SEO title + description per product and page | Book › Search (SEO), Studio › Pages | no |
| Editable SEO title + description per **collection** | only the category description | **yes** |
| Alt text per image | `BookPhoto.altText` | no |
| URL redirects manager | Settings › General › URL redirects | no |
| "Create a URL redirect" when a product's handle changes | book editor warns "the site cannot redirect them" | **yes** |
| Redirects answered by the server (301) | followed in the browser only, after the page loads | **yes** |
| robots.txt, noindex on cart/checkout/account/search | yes | no |
| hreflang (Markets) | one language | n/a |
| Blog / Article schema, 404, image weight | owned by "Plan SEO improvements" thread | skip |

## Plan

- [x] 1. `redirectsAfterMove(list, oldPath, newPath)` in `features/site/redirects.ts`; Studio page rename uses it.
- [x] 2. Book editor: saving a published book under a new web address adds a redirect from the old one (Shopify's
      default-on checkbox); the confirm dialog says so instead of "cannot redirect".
- [x] 3. Collections: optional "Title on Google" and "Description on Google" per category (Studio › Navigation ›
      categories), used by the collection page's title/description tags.
- [x] 4. Hosting answers the redirect list with real 301s: the build writes `dist/hosting-redirects.json` from the public
      `settings/redirects`; both Hosting jobs merge it into `firebase.json` (`scripts/hostingRedirects.mjs`, fail-safe:
      a problem leaves `firebase.json` as committed). Never claims a live route.

## Verification

- [x] Tests: `pnpm test` (616 files, 4207 tests pass) + new tests for each piece
- [x] Typecheck and lint (clean)
- [x] Hosting emulator (firebase-tools 15.32.1) with a merged redirect: /books/old-test and /BOOKS/OLD-TEST → 301, the live book page stays 200, smoke check passes
- [x] Screenshot of the category editor (Studio fixture) + Studio e2e check

## Review

Three Shopify defaults the shop lacked are built: automatic redirect on a live book's address change, a Google title and
description per collection, and redirects answered by Hosting as 301s. The deploy-step merge can only be proven by the first
real "Deploy storefront" run; it is fail-safe (warns and deploys the committed config). The shop has no redirects saved yet,
so the first run merges nothing.
