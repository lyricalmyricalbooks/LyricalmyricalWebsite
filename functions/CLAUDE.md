# Cloud Functions, payments, email and server rules

Server side: Stripe/PayPal, webhooks, refunds, stock holds, gift cards, discounts, email, privacy and the anonymous-abuse limits. Never weaken payment, inventory or webhook authority. The repo-wide rules are in the root `CLAUDE.md`.

## Standing rules

### Payment authority
- Orders are created `unpaid`. Only the signature-verified `stripeWebhook` (`markStripeOrderPaid`) marks a Stripe order paid and moves stock, discount use, revenue and gift-card balances. The `status` action and `unpaidPaymentSweep` only record `reconciliationPending` and alert; the fix is resending the signed Stripe event. Other paid paths: verified PayPal capture, `completeOrderWithoutCard` (manual/$0). Never the browser.
- An order is paid only when the provider amount equals the saved `expectedAmountMinor`/`expectedCurrency` (CAD/USD/EUR only, `paymentGuards.js`); a mismatch, or a payment for a cancelled order, sets `paymentMismatch` and stays unpaid.
- Sandbox payments (`stripeMode`/`paypalMode: "test"`) set `isTest` and never touch stock, discounts or revenue, on payment or refund (`sandboxPayment.test.js`).
- `applyOrderRefund` is the one place an order becomes refunded; `revertFailedRefund` the one place a failed refund is undone. Each reverses stock, discount use, revenue and gift cards once. Retries add `refundRetrySuffix` to the idempotency key.
- Guest order access needs the private order key; an order number or payment id is not authorization. Signed-in order reads need `email_verified`.

### Pricing and checkout
- `priceOrder` is the one server price builder for every path (card, PayPal, manual, free). Never trust client totals; the client mirrors (`CartContext.catalogUnitPrice` ↔ `functions/catalogPrice.js`, `capDiscountAmount`, tax in `features/site/taxRate.ts`) are display only and must stay in step.
- `validateDiscountCode` must send every field checkout reads (`discountPayload.test.js`). One discount per order (`pickAutomaticDiscount`); discounts clamp to 0…items value; browser-sent gift lines are dropped.
- Gift cards are debited only inside the paid transaction (`settleGiftCards`), from `chargedRedemptions` (what the live payment was created for), each once via the `giftCards*At` stamps. `total` is what the card/PayPal pays after gift cards.
- A retry must release the shopper's own previous unpaid attempt (`releaseSupersededAttempt`) and refuse with `previous_attempt_paid` when it was paid with the same lines (`sameOrderLines`, client `features/site/orderLines.ts`).
- Box sets have no stock of their own: `promotions.stockLines` expands `components` everywhere stock moves.
- `isPhysicalItem` (admin `isDigitalItem`) is the one digital-vs-physical rule for estimates, returns, labels and publish review.

### Stock
- Stock changes go through `functions/inventory.js` (`readBooks`/`writeStock`), one write per book. Holds (`stockHolds.js`, 30 min, `HOLD_LIMITS` caps) are taken before any checkout settles and fail closed; a shopper's own attempt (`holdOwner`) never blocks them.
- Shipped means `fulfillmentStatus`/`status`, never `trackingNumber` (a bought label sets it before handover). Tracking never moves back (`advancesTracking`).

### Shared rules and generated files
- Shipping engine, zones, discount math, promotions, pre-orders and address rules live once in `src/shared/`; edit there and run `pnpm run build:shared` (never edit `functions/shared/`). Server copies are authoritative.
- Pairs that must match, each with a parity test: `functions/labelVoid.js` ↔ `admin/labelRefunds.ts`; `refundRestock.js` ↔ `defaultRestockOnRefund`; `REQUIRED_PLACEHOLDERS` ↔ `admin/emailTemplateChecks.ts`; `releaseArrived` in `liveBook.ts` ↔ `paymentGuards.js` ↔ `scripts/publicStorefrontData.mjs`.
- Weights are whole grams end to end (`parcelWeight.js`, `parseWeightGrams`).

### Module layout in `functions/index.js`
- New `createStripeCheckoutSession` actions: one line in `CHECKOUT_FUNCTION_ACTIONS`. Groups/endpoints live in factory modules taking index.js's guards (`checkoutPayment.js`, `adminReports.js`, `shippoEndpoints.js`, `shippingLabels.js`, `scheduledJobs.js`…); keep each `exports.<name> =` line in index.js (tests slice between them).
- Factories are built before later `const`s exist: pass function declarations; copy renamed requires exactly; pass names tests reassign late (e.g. `lateSendEmail`).

### Email
- Every anonymous-triggered email claims the shop-wide budget (`claimEmailSend`, `emailThrottle.js`); a new path needs a `CONTACT_LIMITS` purpose (`emailAbuse.test.js`). `sendEmail` takes exactly one plain recipient.
- Queue (`queue: "<kind>"`, server-only `emailOutbox`) only sends that don't retry themselves. Order emails go once via `sendOrderEmailOnce`/`email-claims`; `orderEmails.test.js` pins one customer and one shop email per paid order.
- Template values are HTML-escaped except `items_table`. The newsletter confirmation text stays fixed in code. Anything that mails or counts subscribers skips `status === "pending"` (`mayMail`).

### Security and data
- Secrets live only in admin-only `adminSecrets/*` or Functions secrets; never log or save tokens/keys to public settings.
- Browser HTTP calls use `functionFetch`, server handlers `onBrowserRequest` (App Check). Signed provider webhooks and emailed download links stay outside attestation.
- Anonymous handlers return `publicErrorMessage`, never upstream detail. Rate limits use `clientIpOf`.
- `books` is public only when `status == "published"`: shopper queries must filter on it. Owner-only book fields go in `books/{id}/private/admin`; add new ones to `PRIVATE_BOOK_KEYS` in `admin/bookPrivate.ts` and the migration script (`migrateBookPrivate.test.ts`).
- A new sub-collection goes in `SUBCOLLECTION_GROUPS` (backups). Throttle/limit collections carry `expiresAt` for TTL. Privacy export/erase must cover any new collection holding personal data (`privacyData.js`).
- Check every rules change with `scripts/firestore-rules-emulator.mjs` and extend it.
- Don't change the consent defaults in `lib/consent.ts` (owner's closed decision).

### Deploy
- Rules, indexes and Functions deploy with or before the frontend that needs them. Exception: private book fields need the dual-read frontend, then the migration, then rules.
- A new Stripe event in `REQUIRED_WEBHOOK_EVENTS` needs **Fix webhook** after deploying. Local tests never prove live payments, webhooks, refunds, email or carrier purchases.

## Feature notes

Details of each feature live in [`docs/agent-notes/functions.md`](../docs/agent-notes/functions.md) (read the section before changing that feature; Grep its heading). Sections:
- Cloud Functions (`functions/index.js`)
- Shipping engine
- Discount codes: start date and one-use-per-customer (6 October 2026)
- Customer bug sweep (6 October 2026)
- Bug sweep #2 (6 October 2026)
- Paid-but-unpaid recovery + Riso order tracking (6 October 2026)
- Stripe ↔ shop payment sync hardening (6 October 2026)
- Payments & shipping panel repair (7 October 2026)
- reCAPTCHA / App Check
- Bug sweep #3 — ready for sales (7 October 2026)
- Email abuse budget and proof of owner (10 October 2026)
- Anonymous-abuse hardening (9 October 2026)
- Bug sweep #4 (7 October 2026)
- Readiness fixes from the 5-agent audit (7 October 2026)
- Commerce access, navigation and merchandising (7 October 2026)
- Cart estimates, returns and catalog review (7 October 2026)
- Bug sweep #5 (8 October 2026)
- Bug sweep #6 + shop filters (8 October 2026)
- Bug sweep #7 (8 October 2026)
- Pre-orders (8 October 2026)
- Gift cards, box sets, automatic discounts, add-ons and scheduled sales (9 October 2026)
- Shop errors (25 October 2026)
- Payment-integrity audit fixes (9 October 2026)
- Round-2 payment fixes (10 October 2026)
- Orders, returns and Shippo labels (round 2, PR 8, 10 October 2026)
- Privacy and newsletter (10 October 2026)
- Round-2 security: private book fields, public endpoints, rules (10 October 2026)
- Round-2 digital downloads (10 October 2026)
- Live carrier choices (moved from the root guide)
