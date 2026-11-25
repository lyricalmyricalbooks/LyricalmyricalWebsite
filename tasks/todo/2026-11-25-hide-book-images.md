# Hide book images from the website (25 Nov 2026)

Julian: "give me the feature to hide book images from showing on the website if i so choose".

## Plan
- [x] Store `hidden: true` on a photo (no rules change: photos are a free list on the book).
- [x] One helper, `features/site/shownPhotos.mjs`, used by every shopper-side read: `useSiteData` (shop),
      `publicApi.getBook` (account, tracking), Checkout's catalog, the storefront data file, and
      `scripts/publicStorefrontData.mjs` (sitemap images, Merchant feed, llms.txt). Gift line photo in Functions skips hidden.
- [x] Book editor › Media: Hide / Show per image, faded card with a "Hidden" badge; cover = first shown image;
      Make cover on a hidden image shows it; the last shown image can't be hidden; readiness "Cover image" counts shown.
- [x] Tests: helper, sitemap and feed leave hidden images out.
- [x] Verify: vitest, typecheck, lint, build, Studio fixture screenshot of the Media tab.

## Review
See PR. Hidden URLs are still readable in the book's Firestore document (public read of published books);
they are simply never shown, listed or sent to Google.
