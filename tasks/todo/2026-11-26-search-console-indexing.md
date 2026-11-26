# Search Console page-indexing issues (26 Nov 2026)

Julian's list, checked URL by URL in Search Console (data dated 15 Nov) and against the live site (26 Nov).

- [x] Read every flagged URL (soft 404 11, crawled-not-indexed 17, noindex 5, robots 2, 404 2, canonical 2, redirect 64).
- [x] Sitemap: 31 URLs, every one 200, self-canonical, no noindex, no redirect. The 64 redirects are old Big Cartel /
      www / port-2083 addresses Google remembers, not sitemap entries.
- [x] Soft 404: old /product, /roots addresses now 301 to live pages; 3 retired products are real 404s; current pages
      render fully for Googlebot (local render as Googlebot smartphone, plus Search Console live test of Cream Show).
- [x] Code: an unknown, empty or hidden `/collections/<slug>` answered 200 with an app shell that then listed every book
      under noindex (a soft 404). Only `/collections/all` keeps the shell now; the rest get the real 404 (`firebase.json`).
- [x] Tests: `scripts/hostingConfig.test.ts`, `scripts/hosting-smoke.mjs` (live check of an unknown collection).
- [x] Docs, release note.
- [ ] CI green, merge, live check: `/collections/nope` = 404, `/collections/zines` and `/collections/all` = 200.
- [ ] Writing for Julian (Studio): returns policy (30 words, flagged soft 404), collection descriptions.

## Review
Nothing in "crawled, not indexed" is a current page: all 17 are old-site addresses (www, :2083, /product, /category,
sort variants) that now redirect or no longer exist. 8 of 9 book pages are indexed. Trade-off: a category that gets its
first book answers 404 to crawlers until the next refresh (same as books since 25 Nov).
