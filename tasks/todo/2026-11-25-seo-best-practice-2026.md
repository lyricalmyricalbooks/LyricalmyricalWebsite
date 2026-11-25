# SEO best practice check (25 Nov 2026)

Owner asked: research current SEO best practice and see whether code changes are needed. Much SEO shipped the same day
(prerender, 404s, photos, headings, artist pages, collections, redirects, lastmod, publisher, Organization/About,
noindex, Bing verification, llms.txt), so only genuine gaps.

Sources: Google "Optimizing for generative AI features", "AI features and your website" (Dec 2025), Google's Nov 2025
"More ways to share shipping and returns", return-policy/shipping-policy structured data guides, Bing's IndexNow and
lastmod guidance (2025).

## Plan
- [x] IndexNow after each storefront deploy: key file in `public/`, `scripts/indexnow.mjs` (save live sitemap before
      deploy, send only new/re-dated/removed pages after), two `continue-on-error` steps in `deploy-pages.yml`.
- [x] Organization-level `hasMerchantReturnPolicy` on the home page's BookStore (Google, 2025), from the same
      Text & labels returns window as the book offers.
- [x] `alternateName` on BookStore + WebSite for Google site names, from a new Text & labels field
      (`seoAlternateNames`, default "Lyricalmyrical, Lyrical Myrical Books").
- [x] Round 2 (owner: "find other gaps, especially for google"): book `author` Person carries the artist page's
      `@id` (`artistUrl` option), so book and ProfilePage are one entity; `inLanguage` as BCP 47 codes
      (`languageCodes`: "Italian, English" → ["it","en"]).
- [ ] Not done (needs data or low value): org-level `hasShippingService` (home page has no shipping quote loaded),
      lastmod with time of day (date is valid for Google), `merchantReturnLink`, ProductGroup for The Hound's signed/unsigned editions ("signed" fits none of Google's
      `variesBy` values; the single Offer is the selected edition's price, which is accurate).

## Verification
- [x] Unit tests: `scripts/indexnow.test.ts`, `bookSeo.test.ts` additions.
- [x] Full `pnpm test`, typecheck, lint.
- [x] Built locally and read the home page's JSON-LD.
- [ ] After merge: watch the "Tell Bing which pages changed" step in the next Deploy storefront run.

## Review
See PR description.
