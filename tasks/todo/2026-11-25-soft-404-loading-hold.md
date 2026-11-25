# Soft 404 on book and info pages (25 Nov 2026)

Search Console (URL inspection, 24 Nov crawl) marked /books/the-hound, /books/cream-show, /page/submissions and
/page/policy-returns "Soft 404"; the live test renders them fine, so it is intermittent.

Cause: after the prerender hand-over (lib/prerenderedPage.ts, max 5 s, and Google's renderer fast-forwards timers) a page
whose shop data hasn't arrived renders its Loading screen and useSEO swaps the finished head for the default title. A
snapshot taken then is an empty page.

- [x] useSEO `keep`: leave the head as served while the page asks
- [x] BookDetail / PageView: while loading on the landing page, render the served HTML (as App's PageLoading does)
- [x] Tests: BookDetail.pending (hold + not-found still works), seo.test (keep)
- [x] typecheck, lint, full vitest
- [ ] After deploy: Search Console › Pages › Soft 404 › Validate fix

## Review
Smallest change that removes the empty state for crawlers; a real load error still shows Retry, a confirmed missing
page still shows not found + noindex.
