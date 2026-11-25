# SEO audit round 2 (25 November 2026)

Follow-up to the 25 Nov measured audit (/mnt/project-files/seo/seo-audit-2026-11-25.html).

- [x] Re-audit a fresh local build: 24 prerendered pages, titles, descriptions, h1, alt, robots, JSON-LD, sitemap, phone picture weight.
- [x] Soft 404: drop `books|collections|page` from the `spa.html` rewrite so an address without a prerendered file gets
      404.html (the app shell) with a real 404. Every published page is prerendered and refreshed every 15 min.
- [x] Update hostingConfig.test.ts and hosting-smoke.mjs; run the smoke on the Hosting emulator.
- [x] Check a book served from the 404 shell still renders fully (book published since the last refresh).
- [x] About → AboutPage (History stays WebPage: Press/Books relationship unconfirmed), Contact → ContactPage, other pages WebPage, all linked by @id to #organization/#website.
- [x] Release note, docs (FIREBASE_HOSTING, SEO_CRAWLABILITY, .github/CLAUDE.md).
- [x] Full tests, typecheck, lint.

## Not changed, and why
- Book-page pictures: srcset/sizes are correct on today's build; the heavy total came from scrolling the whole gallery.
  Only the footer logo is a 1600px file in a 296px slot (46 KB, lazy). Low.
- Titles without the shop name and short descriptions are the owner's own SEO fields (paste-in work).
- Policy pages have no sitemap date: settings text has no per-policy change time. Google treats it as optional.

## Review
Emulator smoke: 31 checks passed, `/books|collections|page/zz-…` → 404, prerendered pages 200. Local check: the 404 shell
still renders The Hound with its own title and `index, follow`; a made-up book shows "Publication not found" with noindex.
