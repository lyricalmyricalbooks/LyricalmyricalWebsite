# Real 404 status for unknown book and page addresses

Audit finding (25 Nov 2026): `/books/does-not-exist-xyz` answered 200 with `index, follow` because Hosting rewrote every
`/books/*` and `/page/*` path to `spa.html`; `dist/404.html` was never served.

- [x] Drop books and pages from the `spa.html` rewrite in `firebase.json` (every live book/page has a prerendered file,
      including noindex books and policy pages). Keep collections: `/collections/all` and hidden categories have no file.
- [x] `scripts/hostingConfig.test.ts`: unknown book/page paths have no rewrite; `/collections/all` still does.
- [x] `scripts/hosting-smoke.mjs`: an unknown book expects status 404 with the app shell body.
- [x] Docs: `.github/CLAUDE.md`, `docs/SEO_CRAWLABILITY.md`, `docs/FIREBASE_HOSTING.md`.
- [x] Release note.
- [ ] CI green, merge, then check live: unknown book = 404, real book = 200.

## Review
Known trade-off: a book published between scheduled refreshes (every 15 minutes plus build) answers 404 to crawlers
until its snapshot exists; shoppers still see it because `404.html` is the same app shell. Slugs that cannot be file
names (`routeSafety.mjs`) were already left out of the sitemap.
