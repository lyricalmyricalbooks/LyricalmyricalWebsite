# Storefront (shop pages, checkout, SEO, photos)

Shopper-facing pages, checkout (`src/app/Checkout.tsx` too), SEO and prerendering, photos and the storefront bundle. Every storefront part must be editable in Studio: read the rules under Theme editor in `src/app/admin/studio/CLAUDE.md` before adding one. The repo-wide rules are in the root `CLAUDE.md`.

**New storefront extras live in one folder (25 October 2026).** A line, button or box a Studio switch turns on goes in
`features/site/extras/<name>/`: its component, its tests and a `feature.ts` (`StorefrontFeature`, `extras/featureKit.ts`) listing its
Style controls (group, `after`, sub-section), Text & labels words and click-to-edit regions. `extras/registry.ts` collects every folder
(`import.meta.glob`), and STYLE_GROUPS, STYLE_SUBSECTIONS, COPY_SCHEMA and REGION_GROUPS add them, so a new extra edits none of those
lists by hand. feature.ts holds data only (shopper code reads it). `extras/featureKit.test.ts` checks every folder. Move an older extra
into a folder when you next change it. Moved so far: `pdp-payment-icons`, `pdp-tax-note`, `footer-back-to-top`,
`cart-tab-reminder` (26 October 2026), `pdp-in-bag`, `pdp-free-shipping`, `pdp-ship-by`, `pdp-ask-question`,
`pdp-sale-countdown`, `footer-currency`, `pdp-release-countdown` (27 October 2026), `card-quick-view` (29 October 2026: its
pop-up parts became regions `quickView*` in Catalog & shared content · layout, plus `quickViewBlurbLength`); each move left the four lists identical
apart from the order of `files`. Folders apply in name order, except that a folder whose anchor (`after`, `subsectionAfter`, copy or
regions `after`) names a key or id another folder adds applies after that folder (`orderFeatures` in featureKit.ts; `pdp-free-shipping` anchors on
`pdp-release-countdown`'s keys); a missing anchor, or two folders anchored on each other, throws.

## Standing rules

### Authority and checkout
- Storefront prices, totals, discounts, pickup, ship-by and tax lines are display only; the server prices and charges. Only the order record's `paid` confirms an order.
- Checkout flow steps and landing outcomes are events in `features/site/checkoutFlow.ts`, never new `useState` flags. Step components (`Checkout*Step.tsx`, `CheckoutOrderSummary.tsx`) are display only; state, checks and payment calls stay in `Checkout.tsx`. `checkoutWiring.test.ts` reads those files.
- Add any new shopper-editable order field to `cardAttemptKey`. `createCheckoutSubmission().reset()` runs only from `onPageRestored`. Missing/invalid Stripe keys block payment; never route to hosted Checkout.
- No third-party IP lookup in the browser. Client and server exchange-rate freshness windows and sane bounds stay equal.

### Bundle and data
- The shopper entry stays free of Auth, the full Firestore SDK and `admin/api.ts`: get Lite through `lib/lite.ts` (`await lite()`), never a static Firebase import (`lib/shopperBundle.test.ts`). Never mix Lite and full-SDK refs.
- Animate with `m.*` under `LazyMotion`, never `motion.*`; no CSS `transition-all/transform` on a motion-animated element. New third-party tags load through `lib/afterPageLoad.ts`.
- Shopper book queries filter `status == "published"`; show books through `isLiveBook`. The catalog file (`dist/storefront-data.json`) never carries a field the Firestore path lacks, and both paths share transforms. Catalog triggers never use `retry: true` (`catalogVersion.test.js`).
- Preview and prerender never write. Clocks and countdowns start after mount, never in the prerender.

### Photos and Storage
- Never render `photos[n].url` for a shopper: use `photoSrcSet`/`smallPhotoUrl`. New grids pass `gridPhotoSizes` with their real columns. Frame-filling `<img>`s spread `framingStyle` and render `<PhotoToneDefs>` beside them (`photoFraming.test.ts`).
- Keep `storageImageSweep`'s ladder equal to `BOOK_PHOTO_WIDTHS`. Never upload to a path that is later overwritten. Book `<video>`s start muted with `controls`.

### SEO and links
- Anything that opens another shop page is a real `<a href>`, never a click-only `div`/`button` (`sectionBookLinks.render.test.tsx`).
- Private pages (account, checkout, tracking, previews) are noindex and stay out of the sitemap and prerender. A failed catalog read is never `fresh`, so it never shows "not found" or noindex.
- No fabricated reviews or ratings in JSON-LD. Keep `merchantFeed.mjs` creator names equal to `bookCreators`.
- Live money that changes on screen carries `translate="no"`; never a page-wide `notranslate`.

## Feature notes

Details of each feature live in [`docs/agent-notes/site.md`](../../../../docs/agent-notes/site.md) (read the section before changing that feature; Grep its heading). Sections:
- Public storefront readiness repairs (2 October 2026)
- Checkout order slip (22 October 2026)
- Checkout carrier delivery estimates
- Storefront bundle (9 October 2026)
- Prerendered page hand-over (15 October 2026)
- Storefront loading performance (4 October 2026)
- Stripe checkout payment section (4 October 2026)
- Book SEO pane (5 October 2026)
- Crawlable public HTML
- Collection indexing (7 October 2026)
- Automatic SEO refresh and catalog search controls
- Coming soon books (12 October 2026)
- Search drawer (21 October 2026)
- Pickup availability on book pages (21 October 2026)
- Free-shipping line on book pages (22 October 2026)
- Second photo on hover (22 October 2026)
- Formats on shop cards (22 October 2026)
- Author line on shop cards (23 October 2026)
- Shipping & returns tab on book pages (22 October 2026)
- Ships-by line on book pages (22 October 2026)
- Back to top button (22 October 2026)
- Footer currency picker (22 October 2026)
- Header hides on scroll down (22 October 2026)
- Sale countdown on book pages (22 October 2026)
- Added-to-bag notice (22 October 2026)
- Discount code box in the bag (22 October 2026)
- Order note in the bag (22 October 2026)
- Terms checkbox in the bag (22 October 2026)
- Save for later in the bag (22 October 2026)
- Announcement countdown (22 October 2026)
- Checkout experience + stock-hold tuning (10 October 2026)
- Checkout address finder (12 October 2026)
- High-quality photos (12 October 2026)
- Storage bandwidth (15 October 2026)
- Catalog file on Hosting (15 October 2026)
- Book videos (15 October 2026)
- Page translation (12 October 2026)
- Ask a question on book pages (22 October 2026)
- Pop-up trigger (22 October 2026)
- Sold-out books last (22 October 2026)
- Books load as shoppers scroll (22 October 2026)
- Zoom follows the mouse on book photos (22 October 2026)
- Already in your bag on book pages (23 October 2026)
- Sale savings in the bag (23 October 2026)
- Suggestions in an empty bag (23 October 2026)
- Tab reminder (23 October 2026)
- Release countdown on pre-orders (23 October 2026)
- Announcement bar close button (23 October 2026)
- Tax & shipping note on book pages (23 October 2026)
- Star ratings on shop cards (23 October 2026)
- Shop filters in the address (23 October 2026)
- Read more for long descriptions (23 October 2026)
- Ships-by line in the bag (23 October 2026)
- More by this artist on book pages (23 October 2026)
- Payment icons on book pages (23 October 2026)
- Analytics tags load after the page (27 October 2026)
- Internal links (17 November 2026)
<<<<<<< HEAD
- Artist pages (25 November 2026)
=======
- Heading above the description (25 November 2026)
>>>>>>> origin/main
- Checkout fields, custom pages and footer (moved from the root guide)
