# CLAUDE.md

Guidance for working in this repository.

> [!IMPORTANT]
> **Read `AGENTS.md` at the start of every task, before doing anything else.**
> `AGENTS.md` is the companion operating guide: it defines your role, priorities,
> and — most importantly — the **skills/playbooks** you should pick up and apply
> while working in this repo. Re-read it each session (it may have changed) and
> **use the relevant skills from it whenever they apply** to the task at hand.
> Treat its skills as active tools, not background reading. If anything in
> `AGENTS.md` conflicts with this file, follow `CLAUDE.md` for repo facts and
> `AGENTS.md` for how to work, and call out the conflict.

## What this is

An e-commerce storefront + admin for **Lyricalmyrical Books**, a publisher.
It's a single-page React app (the public bookstore and the admin dashboard are
the same SPA), backed by **Firebase** (Firestore, Auth, Storage) and a set of
**Cloud Functions** that handle payments, email, and fulfillment. The UI was
originally generated from a Figma design ("Artsy Website for Publisher").

> Note: `README.md` still documents an older Express `backend/server.js` with a
> password-protected admin. That backend no longer exists — payments,
> fulfillment, and admin auth have all moved to Firebase (see below). Trust this
> file and the actual code over the README's "Backend API + Admin" section.

## Tech stack

- **React 18 + TypeScript**, built with **Vite 6**.
- **React Router 7** (`react-router`) — client-side routing in `src/app/App.tsx`.
- **Tailwind CSS v4** (via `@tailwindcss/vite`) for styling; **shadcn/ui** +
  **Radix UI** primitives in `src/app/components/ui/`.
- **motion** (Framer Motion successor) for animations (MUI/Emotion were removed in October 2026: nothing imported them).
- **Firebase 11** client SDK (`src/lib/firebaseApp.ts` app + App Check; `src/lib/firebase.ts` full Firestore + Auth;
  `src/lib/firestoreLite.ts` shopper Firestore Lite — see *Storefront bundle* below, project
  `lyricalmyrical-web-v2`). The inventory app's project (`lyricalmyrical-37c46`) is reached only by
  Cloud Functions for the inventory app link (see *Inventory app link* below); `src/lib/legacyFirebase.ts`
  is a leftover admin sign-in to it, no longer used for stock.
- **Stripe** for checkout, **Resend** for transactional email, **Shippo** for
  address verification / shipping labels — all wired through Cloud Functions.
- **Vitest** for tests.

## Layout

```
src/
  main.tsx                  App entry
  app/
    App.tsx                 Routes + top-level providers (Theme, Currency, Cart)
    CartContext.tsx         Cart state
    CurrencyContext.tsx     Multi-currency state
    Checkout.tsx            Checkout flow (calls Stripe via Cloud Functions)
    admin/                  Admin dashboard (route /admin/*) — catalog, orders,
                            discounts, reviews moderation, pages, theme editor,
                            analytics, shop settings. `api.ts` = Firestore calls.
                            `Dashboard.tsx` owns the default Reso admin shell;
                            shared cross-page styling lives under `.admin-reso`
                            in `src/styles/theme.css`.
    components/             MainSite, CartDrawer, shared components, ui/ (shadcn)
    features/site/          Storefront pages: BookDetail, CollectionPage,
                            Wishlist, Account, OrderTracking, Search, Reviews,
                            plus constants.ts / storeCopy.ts / types.ts
    lib/                    seo, wishlist, recentlyViewed, functionsBase helpers
  lib/                      firebase.ts, legacyFirebase.ts
  styles/                   Tailwind/global CSS, fonts
functions/                  Firebase Cloud Functions (Node 22, separate package)
  index.js                  All functions (Stripe, webhook, emails, sweeps)
  shippingGeo.js            Shipping zone matching
scripts/                    generate-sitemap, check-readability, verify-admin
firestore.rules / .indexes  Firestore security rules + indexes
storage.rules               Storage security rules
firebase.json / .firebaserc Firebase deploy config (project lyricalmyrical-web-v2)
```

### Routes (`src/app/App.tsx`)
`/` storefront · `/books/:slug` · `/collections/:slug` · `/wishlist` ·
`/account/*` · `/page/:slug` · `/admin/*` · `/checkout` · `/track`

Pages are lazy-loaded via `React.lazy` + `Suspense`.

### Firestore collections
`books`, `authors`, `orders`, `discounts`, `reviews`, `pages`, `newsletter`,
`analytics`, plus a settings doc and audit log. Always check `firestore.rules`
before changing read/write shapes — rules are enforced server-side.

## Commands

```bash
npm install          # install deps
npm run dev          # Vite dev server (localhost:5173)
npm run build        # vite build + generate sitemap -> dist/
npm run preview      # preview the production build
npm test             # vitest run
npm run build:sitemap
npm run check:readability
```

Cloud Functions are a separate package:
```bash
cd functions && npm install
npm run serve        # firebase emulators (functions only)
npm run deploy       # firebase deploy --only functions
npm run logs
```

## Auth & admin access

- Admin login is **Google sign-in**, hard-restricted to
  `lyricalmyricalbooks@gmail.com` (see `src/app/admin/api.ts` and the
  `ADMIN_EMAILS` allowlist + `requireAdmin` in `functions/index.js`). There is
  no password-based admin anymore.
- Cloud Functions verify the Firebase ID token and require a verified admin
  email for privileged endpoints.

## Cloud Functions (`functions/index.js`)

- `createStripeCheckoutSession` — secure Stripe session creation.
  With `paymentElement: true` it creates a server-priced PaymentIntent instead, for the card form
  shown directly on the checkout page (`features/site/StripeCardForm.tsx`, Stripe Payment Element,
  deferred intent); `stripeWebhook` marks those paid on `payment_intent.succeeded` (metadata
  `checkout: "payment_element"`). `body.action` = `status` / `registerPaymentDomain` serve the
  return-page check and the wallet-domain button (no new public functions: the CI deploy account
  can't set IAM on them). Storefront card payment always uses the inline Payment Element;
  older saved redirect settings no longer move the shopper to hosted Checkout.
- `stripeWebhook` — the **only** path that marks Stripe orders paid; it also
  decrements stock, counts discount redemptions, and records revenue. Orders are
  created `unpaid` first.
- Checkout **order note / gift message** (`orderNote` on the order, max 500 chars, enforced in `firestore.rules`): Studio › Style › Checkout page › **Order note / gift message box at checkout** (`showOrderNote`, off by default); words in Text & labels › Checkout; shown to admins in Order detail › Customer.
- `downloadDigitalAsset` — gated digital ebook downloads.
- `onOrderPaid` / `onOrderShipped` — Firestore triggers that send customer/admin
  emails (Resend).
- `abandonedCartSweep` — scheduled recovery email after ~1h.
- **Email retry queue:** `sendEmail({ …, queue: "<kind>" })` parks an email both senders refused in server-only
  `emailOutbox` (rules deny every browser; holds the HTML, so gift codes/download links never reach the client) and
  throws with `err.queued`. `runEmailOutbox` (inside `unpaidPaymentSweep`) retries due entries under a transactional
  lease on a 15 min → 12 h schedule (8 tries, `functions/emailOutbox.js`), then gives up (`status: "failed"`). Order
  emails (`sendOrderEmailOnce`) keep their `email-claims` claim while queued so a re-run trigger never duplicates.
  Recipients/subjects are validated (no CR/LF; a bad address is permanent, never queued); `emailLog` rows older than
  90 days and given-up entries older than 30 are pruned. Admin: Settings › Notifications › **Waiting to send**
  (Retry now / Stop via `sendTestEmail` actions `emailQueue`/`retryEmail`/`cancelEmail`, summary only). Don't queue
  sends that already retry themselves (webhook-missed alert, abandoned cart, daily digest); back-in-stock is
  queued (`backInStock`) because its trigger only runs on a restock.
  Each try is bounded (nodemailer 15–20 s timeouts, Resend raced at 20 s with an idempotency key `<queueId>:<from>`),
  the sweep runs the queue after the payment checks with a 30 s budget (`timeoutSeconds: 300`), and a delivered entry is
  marked `status: "sent"` before it is deleted, so a failed cleanup never resends. Entries carry `orderId`/`giftCardId`
  and `toLower`: `staleOrderEmailReason` drops an order email whose order was refunded/cancelled/paid since, a disabled
  gift card's code is never sent, a retried gift card stamps `emailedAt`, and privacy export/erase include the queue
  and that address's `emailLog` rows. Stop refuses (409) while a send holds the lease. `currentRows` (newest row per
  `outboxId`) feeds Needs attention and the admin alerts.
  Templates: unknown `{{placeholders}}` send as blank, `{{items_table}}` only fills the body, the gift-card `{{code}}` line is re-added if removed
  (`REQUIRED_PLACEHOLDERS`, mirrored in `admin/emailTemplateChecks.ts`), buttons need an http(s) link. Send test uses
  the editor's unsaved words and branding.
- **Shop alerts & Gmail check:** `loadNotificationSettings` returns `shopAlerts { newOrder, shipped }` (on unless
  `settings/notifications.shopAlerts` turns them off; an older `new_order_admin.enabled` is honoured) — Settings ›
  Notifications › **Emails to the shop**. Gmail sending › **Check connection** = `sendTestEmail` action `verifyGmail`
  (nodemailer `verify()`, nothing sent). Email branding goes through `risoAccent` (#hex only) and `safeLogoUrl` (https,
  escaped) in `emailTheme.js` and its admin mirror. Customer and shop emails are gated separately (pausing
  "Order Paid"/"Order Shipped" never stops the shop copy). Shipped (carrier) parcels send only the shipping email; "out for delivery" and "delivered" (admin buttons or
  Shippo tracking) send nothing (owner's request). Pickup (`ready_for_pickup`) and local delivery
  (`out_for_delivery`, `delivered`) send the Delivery template without carrier lines (`localMethodOf` reads
  `fulfillment.method`, then `fulfillmentSelection.method`). Refund emails use `refundEmailFacts` (`emailMoney.js`):
  none for a lost dispute, gift-card refunds named, manual refunds in the charged currency; a partial refund
  (`refundedAmountMinor` rising while paid) sends `partialRefund_<minor>`. Sandbox gift-card purchases email only
  the shop (`[TEST]`, one copy).
- **Email delivery log:** every `sendEmail` attempt (sent or failed, with a plain-English reason from
  `functions/emailErrors.js`) is written to the admin-only `emailLog` collection and listed in
  Settings › Notifications › **Recent deliveries**. Customer and shop-copy sends are attempted
  separately, so a rejected customer address never suppresses the admin notification.
- `onBookRestocked` — emails shoppers in `stockAlerts` (created from the sold-out product page's
  "Notify me when back in stock" box, `features/site/BackInStockForm.tsx`) when a book/variant goes
  0 → available. Studio › Style › Book page · photos & layout › **Notify me when back in stock** toggles the box;
  its words are in Text & labels › Product page.

- `unpaidPaymentSweep` (every 15 minutes) — records pending reconciliation and emails the shop when Stripe
  shows a successful payment but the order is still unpaid 10 min–7 days later (`functions/paymentSweep.js`);
  stamps `paymentAlertSentAt`. Never marks Stripe orders paid — resend the verified webhook event from Stripe.
  It reads the Stripe mode/keys once per sweep (`readStripeKeys`, passed as `keys` to `retrieveOrderPayment` /
  `checkStripeReversal`; sweep clients time out after 20 s; a failed read falls back to per-call reads).
- `nightlyFirestoreBackup` (03:17 Toronto) and Settings › General › Backups & export › **Back up now**
  (`createStripeCheckoutSession` action `backupNow`, admin) share `runFirestoreBackup`: (1) the managed export to
  `backups/YYYY-MM-DD/export` (needs **Cloud Datastore Import Export Admin** on the Functions service account; refused =
  PERMISSION_DENIED) and (2) the Functions' own copy of every document (`functions/backupJson.js`, `backups/<day>/json/`
  `<collection>.ndjson.gz` + `_group_private` + `manifest.json` last; no extra role; skips `rate-limits`). Either one = a
  good backup; the next run checks the previous export's operation. A `runningSince` lock stops overlapping runs; manual
  runs are 5 min apart and limited to 45 s. Restore the copy with `scripts/restore-json-backup.mjs` (dry run first),
  the export with `gcloud firestore import`. A new sub-collection name goes in `SUBCOLLECTION_GROUPS`.
  Each copy also writes `backup.json` (every document in one file, stored gzip-encoded so browsers save plain JSON);
  the card's **Daily backups** list and **Download** use action `backups` (`op: list | download`, `functions/backupAdmin.js`,
  15-minute signed link). The restore script accepts that downloaded file too.

**Email sending:** `sendEmail` sends through Gmail SMTP (nodemailer, account `lyricalmyricalbooks@gmail.com`) first, because the shop has no Resend-verified domain. The Gmail app password is entered in Settings › Notifications › **Gmail sending** (`admin/GmailSendingCard.tsx`) and stored in the admin-only `adminSecrets/gmail` doc (never in public `settings/*`). If it is unset or Gmail fails, sending falls back to Resend (`onboarding@resend.dev` only reaches the account owner).

Secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`,
`SHIPPO_API_TOKEN`) are stored as Firebase Functions secrets, not in the repo.

## Shipping engine

`functions/shippingEngine.js` (server, authoritative) and `src/app/features/site/shippingEngine.ts`
(display mirror) turn profiles → zones → rates into checkout quotes; `shippingEngine.parity.test.ts`
keeps them identical, so change both together. Rate `type`: flat | order | weight | percent | free |
pickup, plus conditions (order total / cart grams / item count), `freeOver`, `handlingFee`; profiles
add `freeShippingOver`, `handlingFee`, `defaultItemWeightG`. The server charges the quote matching
the customer's `shippingMethod` (else cheapest) and rejects unservable destinations; profiles with no
zones fall back to legacy flat `calculateShipping`. Live Shippo quotes can be enabled for an explicit
country allowlist in Settings › Shipping › Carrier & labels; all other countries use the regular
profile/zone path. Selected live quotes are fetched and validated again server-side so the charged
amount matches checkout. Admin UI: Settings › Shipping › profile editor (Profile rules, Test this
profile, rate dialog).

**Weights are metric (18 October 2026).** Book/edition weights are entered in g or kg only (`WEIGHT_UNITS`); older
"1 lb"/"8 oz" values still parse identically (`parseWeightGrams`), open in grams (`splitWeight`) and are saved as whole
grams by the book editor (`withMetricWeights`) and CSV import (`metricWeightValue`). Shoppers see `metricWeight`
(`features/site/metricWeight.ts`). Every Shippo parcel, order line and customs item is sent in grams
(`functions/parcelWeight.js`, fallback 680 g a copy); the label dialog asks for grams (`suggestedParcelWeightGrams`).

## Theme editor

> [!IMPORTANT]
> **The default Admin → Settings → Design editor is the new Studio editor**
> (`src/app/admin/studio/StudioEditor.tsx`; left rail **Page layout / Theme settings /
> Text & labels / Navigation / Pages**). It is the **only** designer: the old `ThemeEditor.tsx`,
> `ThemeEditorPro.tsx`, `ThemeEditorBuilder.tsx`, `NewSectionLibraryModal` and `?editor=legacy` no
> longer exist. **Add or change every theme/design feature in Studio** — the user only sees Studio.
> The Studio 2.0 roadmap (navigation overhaul, Shopify-level features) is in `docs/THEME_EDITOR.md`. Shop categories (the storefront category bar) are edited in Studio › **Menus** ›
> **Shop categories**. They can also be created while editing a book in **Categories & tags**;
> that catalog workflow publishes the category immediately and synchronizes Studio's working copy.
> Custom pages (About, Journal…) also live only in Studio › **Pages** tab
> (`studio/StudioPages.tsx`); there is **no** separate Pages screen in the admin nav — do not
> re-add one. New pages join the storefront header by default, and their public
> routes render the themed storefront header. Walkthroughs must use Studio's
> labels, not legacy legacy-editor tabs.

Studio › Menus › Shop categories has a searchable category manager with explicit
Edit/Delete, descriptions, optional images, visibility, parent placement and order.
Counts show direct assignments (including aliases); parent roll-ups and the
automatic PUBLICATIONS all-books view are separate. The picker reads the entire
catalog, including drafts and records without createdAt. Category details follow
Save draft/Publish; book assignments have an explicit live Save action, use the
published category name, and cannot target unpublished categories. Bulk writes
read fresh tags in an atomic transaction (up to 400 books), touching only
categories/genres/updatedAt. Deletion keeps all books, promotes children and offers
keep/remove/move assignments, refreshing membership before and after cleanup.
For larger categories, use Edit › Assigned here in groups of up to 400 first.
**Find anything:** the Studio top bar **Find** button (or Ctrl/Cmd+K) searches every Style control, Text & labels
string, Menus panel, page, section and action (`studio/studioSearch.ts` + `StudioSearch.tsx`; `goToResult` in
`StudioEditor.tsx` navigates). It indexes `STYLE_GROUPS` and `COPY_SCHEMA`, so new controls are findable with no extra
work — give them clear labels. It also lists the parts of the previewed page and books, opens on commands for the current selection
(`contextCommands`), then Recent and Shortcuts; `>` searches commands only (`paletteGroups`). **Auto-fit for phones** (`studio/autoMobile.ts`) fills phone/tablet values from the
desktop design: Sections tab › *Auto-fit page for phones*, or section › Layout & style › *Phone & tablet layout*.

Studio's Sections outline supports sortable sections and blocks. Canvas clicks
open their inspector; **Edit mode** selects content and **Browse mode** lets
storefront links and controls work. **Style** has searchable controls with
**All pages / This page only** scope for supported visual groups. Save draft,
Publish and local unsaved recovery are separate actions. **My themes** (Style › Theme look) can be renamed, duplicated, downloaded as a file and re-imported. History provides
non-destructive snapshot Preview and Restore to draft; change-aware dialogs
guard Publish/Discard. Reusable/copyable sections, scheduled visibility,
phone overrides, canvas reordering and pre-publish checks also live in Studio. These live in
`studio/StudioEditor.tsx`, `StudioOutline.tsx`, `StudioInspector.tsx` and
`useStudioPersistence.ts`; `themeWrite.ts` replaces complete design maps when
saving so removed page overrides do not reappear. The iframe receives an atomic
`STUDIO_PREVIEW_STATE` snapshot of the unsaved design, settings, books and
published pages, keeping colors, menus and newly created page content live
across preview navigation without another Firestore read. Delivery uses both
`postMessage` and a same-origin message-event fallback so iframe load timing
cannot leave the canvas showing the published design. `buildPreviewState` makes the
snapshot clone-safe (`toCloneable` strips `_lastDoc` Firestore snapshots — they made
`postMessage` throw `DataCloneError` and silently froze the preview once books loaded).
In preview, `useSiteData` keeps the snapshot's books/pages/settings on `window.__studioPreviewState`
so a late Firestore load never overwrites them; chrome outside that pipeline (cookie banner,
boot splash) uses `useLiveDesign()`. **Preview in new tab** (Studio top bar) opens a full-screen
top-level `?preview=true` window: Studio posts the same snapshot on `BroadcastChannel("studio_preview")`
and `features/site/previewTab.ts` (started in `main.tsx`) re-dispatches it as a window message, answers
`PREVIEW_READY`, and keeps `?preview=true` on in-app navigation. Unsaved Studio › Pages edits ride
along in the snapshot (`withDraftPage`) without being saved.
**Preview follows every edit (12 October 2026):** any change to the draft clears a Themes/Version history preview
(`themePreview`/`historyPreview`), so the canvas never keeps a previewed look over an edit. Opening a page in Studio › Pages
switches the canvas to `page:<slug>` (`StudioPages` `onShow`). `rememberPreviewSnapshot` (`previewTab.ts`, first in
`main.tsx`) stores every snapshot on `window` before React mounts, so lazy pages start from it; the route `ErrorBoundary`
clears its error on the next snapshot in preview; spacing drags use pointer capture so a release outside the frame still
ends the pause on preview updates (`inlineEditingRef`).
**Preview clicks and links (12 October 2026, round 2):** the bridge reports its route on every load (`route()` at init);
Studio ignores the page it asked for (`samePreviewPage` vs `previewUrlRef`) and otherwise follows it, mapping `/` to the
catalog when `showHero` is off and a template-less book link to the book's alternate (`previewRoute` options). Editable words
outside a section fall through to element selection; a clicked repeated part is kept (`pickedEl`). The canvas/edit maps
cover `headerSections` and `overlaySections`. "cookie" is a Studio pop-over (`STUDIO_OVERLAYS`; the preview never writes
consent). Checkout's Pay does nothing in `?preview=true` (`coPreviewNoPay`). Outline rows show `sectionPreviewNote`.
**Preview audit (12 October 2026, round 3):** a Style control's `defaultValue` must equal what the storefront draws for an
unset key (`styleDefaults.test.ts` compares `?? true` / `!== false` / `|| "x"` / `?? n` fallbacks; Studio's default design wins).
The default **Reference** header (`usesReferenceHeader`, every layout but Modern) renders `menus.header`, sticker pills and only the
Navigation links values the owner set (`ownNavLinkStyle`), logo alignment and `navGap`; its categories come from
`referenceNavCategories` (also used by Shop categories' "Not in the shop header" note). Checkout in the preview with an empty bag
uses a display-only sample line (`previewSampleCart`, never `setCart`); the preview never writes abandoned carts. Shop text a
storefront part falls back to (footer About → `settings.info.description`) goes through `shopCopyFallback`, which
`StudioCopyField` shows as the default. `[data-fm-checkout]` background skips `.fm-bag` when the bag has its own.
**Button audit (12 October 2026):** Studio toast Undo buttons go through `undoAction()` (undoes only the change it names);
the checkout `<form>` blocks Enter-submission from text inputs (only Pay submits); Orders bulk actions act only on visible
rows (selection is pruned to `filteredOrders`); Books-page inline stock uses `inventoryApi.adjustStock`; My themes refuse
to save past `MAX_SAVED_THEMES` instead of dropping the oldest. New shopper words from the audit are in Text & labels.

Preview canvas actions resolve section ownership and block arrays from the
current draft, including global sections and dynamic `page:<slug>` templates.
Linked compositions inherit source children when a placement has no child
override. Studio Pages stays mounted across editor tabs; unsaved page edits are
protected on exit, typing during a save is retained, and Ctrl/Cmd+S saves the
active page. Page-load failures expose Retry. Pre-publish checks inspect global
and nested content, and identify image-size and contrast review as manual checks.

Studio also supports three-level recursive composition blocks through the
**Flexible composition** section. Groups can contain text, image, button, or
more group blocks; the active desktop/tablet/mobile preview controls local
alignment, visibility, and CSS-grid coordinates. Any configured block can be
promoted to a linked shared block and inserted in another block-capable section;
shared content updates everywhere while placement stays local. The preview
supports section and block drag/reorder plus schema-derived inline editing for
safe text fields.

Studio's announcement, header, navigation and footer are listed in **Page layout**'s Header / Footer groups
(the separate Shared layout tab was retired in 1.5; old `tab=shared` links open Page layout). In Edit mode, double-click plain text in the
iframe (or focus its edit hook and press Enter), then choose **Done** to commit
one undoable draft change or **Cancel** / Escape to restore it. Typing keeps the
preview stable; Save, Publish and Exit wait until the edit finishes. Announcement,
wordmark, masthead and footer labels edit their existing Studio fields. Linked
block text updates its shared source while placement stays local. Unsupported rich content
and templated labels open the inspector instead of flattening their content.
Browse mode restores normal interaction and removes editing focus hooks.

Studio canvas tools include a contextual section/block toolbar (Edit, Move up/down,
Duplicate, Hide, Delete and supported Add block). Plain-text clicks select on the
canvas without opening the inspector; Edit opens it. Structural actions on inherited
shared children stay unavailable, while their text edits still update the source.
Double-click supported rich-content fields for bold, italic, underline, links,
paragraph/heading style and alignment. Unsupported embeds/styles keep the inspector
path; formatted commits are sanitized and one undoable draft action.
**Spacing** exposes padding handles and renderer-supported gap handles. Dragging snaps
to 4px (Shift = 1px), arrow keys adjust values, and Escape cancels. The active preview
size controls desktop/tablet/phone scope; Reset removes that size's overrides. Numeric
spacing fields also live in Layout & style. The shared renderer applies padding once
at the content box and carries the same responsive overrides onto the storefront.

**Media library (2.4):** Studio's **Media** rail tab (`studio/StudioMedia.tsx`) manages admin-only Firestore
`media/{id}` records (`admin/mediaApi.ts`); `uploadMediaImage` (`studio/mediaUpload.ts`) stores WebP copies at
480/960/1600 px under `assets/media/<id>/`. Image fields get **Choose from library** (`studio/mediaPicker.tsx`), and
their **Upload image** adds to the library once it is readable (Theme settings images too). A picture placed in a
section/block field keeps its plain URL plus a public `${field}__media` record; Theme settings images (logo, share
image, favicon, placeholder) get the URL only (plain `<img>`, written through the scoped `onChange`). The
record is defined in `features/site/mediaRef.ts`; section renderers draw images with
`components/ResponsiveImage.tsx` (`srcset`/`sizes`/`width`/`height`/lazy; `fetchpriority="high"` in the home/custom
page's first section) and render plain URLs exactly as before — new `<img>`s in `SectionComponents.tsx` should use
it too. Where-used/replace/filters are pure in `studio/mediaLibrary.ts`; Delete refuses a picture still used in the
draft, live design, a page, My themes or a retained Version history snapshot (`snapshotUses`; versions re-read first). **Deploy Firestore rules (`match /media/{mediaId}`) and Storage rules with the
frontend**; until then Media shows "isn't switched on yet" and fields keep URL + plain upload.

**Studio repairs (0.2):** every Studio image upload uses `uploadStudioImage` (`studio/mediaUpload.ts`) — never write
uploads outside a Storage folder `storage.rules` lets the admin write (`admin/storagePaths.test.ts`). Linked shared
blocks resolve centrally in `SectionList`; each section renders inside `SectionBoundary`. Phone/tablet widths come
only from `features/site/breakpoints.ts` (phone ≤767px, tablet ≤1023px). Scheduled designs and campaigns
are published by the server (`functions/themeSchedule.js`, 3.5). Save draft overwrites `theme-versions/draft-latest`; Publish adds a version.

**Private drafts (0.4):** Studio's unpublished draft is in admin-only `themes/workspace` (`draft`, `rev`) and
My themes in `savedThemes/{id}`; never add draft or theme data back to public `settings/website`. All Studio
saves go through `admin/themeStore.ts` (revision-checked; `ThemeConflictError` → merge or the conflict dialog).
Admin tools that change one design field outside Studio call `draftFieldUpdate`. Shopper code reads settings
with `adminApi.getPublicSettings()`, never `getSettings()` (which also reads admin-only key flags).
There is no public fallback any more (1.7): the first open copies an older public `draftDesign`/`savedThemes` across once and removes them; refused access raises `ThemeStoreUnavailableError` and Studio says so. `themeWrite` never writes a draft to `settings/website`. The fixture/tests swap storage with `setThemeBackend` (saves are recorded as `saveDesign`).

**One design resolver (0.5):** storefront code must resolve page designs only through
`features/site/designModel.ts` (`layerDesign`, or the `resolve*Design` helpers in `surfaceDesign.ts`) — never
`{ ...design, ...design.storefront }` by hand. Shop structure (`ROOT_ONLY_KEYS`) always comes from the root; `copy` and
`regions` merge per entry. Studio "All pages" writes go through `writeDesignValue` (sets root, clears page
overrides); "This page only" writes set the page surface. `designModel.property.test.ts` guards this against the
published design snapshot.

**Studio interaction rules (1.2):** never use `window.confirm/prompt/alert` in Studio — undoable actions run at once
with `say("ok", text, { label: "Undo", run })`, permanent ones use Riso `useConfirm`, names use `usePrompt`. Name every
edit: `change(fn, { label, coalesce })`. Add shortcuts to `studio/shortcuts.ts` (the cheat sheet reads the same table).
Studio messages: failures go through `studio/friendlyError.ts` (never show `err.message`), warnings and delete-with-Undo use `say("warn", …)` (stays until dismissed).
Link into Studio with `studioHash()` from `lib/studioLocation.ts` (`/admin#designer?…`); What's new links can carry `studio`.

**Pickers & catalog sources (2.3):** section/block fields of kind `link`, `book`, `books`, `category`, `page`, `video`,
`font` render Studio pickers (`studio/StudioPickers.tsx`, pure choices in `studio/pickers.ts`, data from
`StudioPickerProvider` in `StudioEditor`). They save the same strings as the old text boxes (hrefs like `/page/<slug>`,
`/collections/<slug>`, `/books/<storefront slug>`; comma-separated slugs; category names) — no migration, `siteHref` still
adds the sub-path. Never add a url-like section/block field as `text` (`sectionFieldKinds.test.ts`). Catalog sections pick
books only through `features/site/merchandising.ts` `selectBooks` / `sectionBookQuery` / `pickBook` (Studio: **Which books**
= all · featured · books I pick · shop category · newest · on sale · pre-orders, plus **Order**); without
`productSource`/`productSort` the result equals the old one (`catalogSources.test.ts`, `catalogSources.render.test.tsx`).

**Page structure (1.3/1.4):** Studio › Page layout lists the page the preview actually rendered — Header · Page · Footer ·
Pop-overs — from the bridge's `STRUCTURE` scan (`studio/pageStructure.ts`, `StudioStructure.tsx`). Any new storefront part
appears there automatically once it carries `data-studio-target` / `regionProps` and a `data-studio-label`; put header parts
inside `<header>`, footer parts inside `<footer>` and pop-overs in a `role="dialog"`. A new click-to-edit target needs a
name in `studio/targetLabels.ts` (its test fails otherwise). A new pop-over Studio should open goes in `STUDIO_OVERLAYS`
and listens with `useStudioOverlay`.
Section rows have a right-click menu (copy/paste section, copy/paste style, move to another page, save for reuse) and
Ctrl/⌘-click multi-select with a bulk bar; blocks move between sections of the same kind (row button, or drag in the
preview). Use `moveSectionTo` / `moveBlockTo` / `updateSectionsById` (`studio/studioWorkflow.ts`) for any new move or
bulk edit — never splice section arrays by hand.

**Finding your way (16 October 2026):** the breadcrumb under the top bar is the full path (workspace › page or category ›
section › block, every level but the last clickable, `role="link"`), and **← Back** / Alt+← returns to the previous place:
`studio/placeHistory.ts` (pure) records places from StudioEditor's own state (Find, preview clicks, Show on page, rail, page
picker), folds changes within 700 ms, caps 20 and never restores a deleted section/page. Find anything (`studioSearch.ts`)
reads plain words: synonyms/UK-US spellings, phrase rewrites, typo correction ("Showing results for…"), categories rank above
single controls, every result carries its click path (`trail`), and a miss offers suggestions + Browse buttons; pin new
owner queries in `studioSearch.test.ts`. Page layout's structure rows have **Style** / **Words** shortcuts (`onOpenTarget`).
**View website** (top bar) opens the shop in a `?preview=true` tab fed the plain draft (never Add-section try-outs, theme or
brand-kit previews) plus `studioStatus` (unsaved/draft/live); `DraftPreviewBanner` (only in that top-level tab; words
Text & labels › Site & sharing › `draftPreview*`) says which, or that Studio is closed and it shows the live shop.
**Workbench & navigation (Studio 3.0 phase 1, 15 October 2026):** `studio/StudioWorkbench.tsx` is docked under the preview
(tablets/computers; phones keep the Health dialog). Its tabs: **Health** (`HealthFindings` from `StudioHealth.tsx`; open it with
`openHealth()`, never `setChecksOpen` directly), **Changes** (undo steps; jump with `jumpBy` in `studioModel.ts`; draft vs live
via `summariseDiff`, only while open) and **Setup** (`studio/setupChecklist.ts`, pure). Its open state and tab live in
`studioUiState.ts`. Shortcuts: `G` then a letter for workspaces (`GO_KEYS`), `W` Workbench, `A` Add section, `[`/`]` sections;
`StudioBreadcrumb.tsx` shows Page › Section › Block.
**Design scales (3.0 phase 2):** Theme settings › Design scales (`tokens`, `features/site/designTokens.ts`, emitted by
`storefrontOverridesCss`): type scale → `--fm-step-0…5` (fluid clamp; section h1–h4), spacing unit + phone multiplier
(sections' Layout › Space above and below = `spacingStep`, `sectionStepCss`), corner set (`--rp-card-radius`), focus ring
width, field focus border, pressed buttons. All off until chosen; a section's own values still win.
**Arrange on page (3.0 phase 3):** Flexible composition › Content › *Arrange on the page* → Studio posts `GRID_ARRANGE`; the
preview's `studio/gridBridge.ts` overlay (move area, resize corner, arrow keys) answers `GRID_PLACE` in pixels and
`studio/gridPlacement.ts` (`applyGridMessage`) writes `block.grid[device]` as one undoable change. Layers = `grid[device].z`;
rotate/size/see-through = `block.responsive[device]` (`compositionLook`).
**Motion (3.0 phase 4):** section › Style › Motion (`components/sectionMotion.ts`: `revealBlocks`, `staggerStep`, `motionDuration`,
`motionDelay`, `blockHover`, `parallax`, `sticky`, `stickyTop`, `motionOffOnPhones`). Blocks hide only while `MotionWatcher` has
armed the section (`data-motion="armed"`); never under reduced motion; Page animations off removes it. Studio's **Play this
section's motion** posts `MOTION_REPLAY`.
**Block library (3.0 phase 5):** add blocks through the picker (`studio/StudioBlockPicker.tsx`, choices + clipboard + the
preview-only `__studio-block-candidate` in `studio/blockLibrary.ts`; outline Add <block>, inspector Add block…, canvas + Block).
Copy/paste blocks only between sections of the same type. Studio › Pages › New page offers starters (`studio/pageStarters.ts`,
drafts with [prompts]). Header/footer follow `elementSchemes.header` / `.footer` (`data-fm-header`, `data-fm-footer`); a
Theme settings address field is `kind: "link"` (picker), never `text`.
**Check every page (3.0 phase 7):** Workbench › Health › **Check every page** (`studio/StudioSiteHealth.tsx`, pure
`studio/siteHealth.ts`) audits each kind of page (`healthRoutes`) in a hidden see-through frame fed the canvas's unsaved
snapshot, one at a time (scrolled through once so reveal animations finish), with `auditDocument` (read-only); the frame is
removed after each page. A new page kind belongs in `healthRoutes`; preview pages must never write (Account skips its
customer record under `inEditorPreview`). Section background pictures from the Media library use `features/site/backgroundSources.ts` (`--fm-bg-img`
per breakpoint, read by `bgStyle`); plain URLs are unchanged. Run history is localStorage only.
**Brand kit (3.0 phase 6):** `studio/StudioBrandKit.tsx` + pure `studio/brandKit.ts` (logo colours → palettes with guaranteed
contrast, `PERSONALITIES`, `brandKitDesign`); previews through `brandChoice` in `sendPreviewState`, applies as one `change`
("Apply brand kit"). Anything it writes must be a `STYLE_GROUPS` key (`brandKit.test.ts`). Opened from Setup (`go: { kind: "brand" }`),
Theme actions › Brand kit… and Find anything. The rest of the Studio 3.0 roadmap (tokens, free placement, motion,
block library, brand wizard, site-wide Health; AI/languages/A-B need the owner's go-ahead) is in `docs/THEME_EDITOR.md`.

Studio is a Shopify-style theme editor under `/admin`. **Read
`docs/THEME_EDITOR.md` before changing it** — it has the architecture map, the
section/block contract, and the Studio 2.0 roadmap.

- `src/app/admin/studio/` — Studio itself: `StudioEditor.tsx` (shell, top bar, rail, preview
  wiring), `StudioOutline.tsx` / `StudioInspector.tsx` (sections and blocks), `styleSchema.ts`
  (every Theme settings control), `settingsMap.ts` (where controls live), `studioModel.ts`
  (immutable design ops + undo), `previewBridge.ts` / `canvasBridge.ts` (in-preview editing),
  `useStudioPersistence.ts` (Save draft / Publish / recovery).
- `src/app/admin/ThemeEditorExtensions.tsx` — the `SECTION_REGISTRY` (41 section types),
  `getSectionFields`/`getBlockFields`, the shared field editors (`SectionFieldEditor`,
  `BlockFieldEditor`) and the per-section **Layout & style** panel (`SectionSettingsPanel`).
  It also exports `buildPageTemplates(pages)` — static `PAGE_TEMPLATES` plus one
  dynamic `page:<slug>` template per published custom page
  (`design["page:<slug>"].sections`, rendered by `PageView` with fallback to the
  shared `design.page.sections`).
- `src/app/components/SectionComponents.tsx` — the storefront section renderers
  (one per registry type; registry and renderers are now at parity).
- `src/app/components/sectionRender.tsx` — shared renderer: `SectionList` maps a
  section to its renderer **by name** (`(Sections as any)[section.type]`),
  `TemplateSections` renders `design[templateId].sections` for a page-type
  template, `GlobalSections` renders `design.globalSections`, and section
  wrappers emit stable `data-fm-section` / `data-section-id` hooks for preview
  click-to-edit, scoped per-section CSS, and template-aware preview selection. Used by MainSite and every standalone page
  (product/collection/page/cart all render their template's sections — milestone A).

> [!IMPORTANT]
> **After every theme-editor change, end your reply with a plain-English navigation
> walkthrough** of how to find and use the new/changed feature in the actual admin
> UI — not just a code/file summary. The user has said they find the theme editor
> hard to navigate, so this is required, not optional, even for a small change.
> Use the real on-screen labels (tab names, accordion titles, button text) as a click
> path a non-developer can follow, e.g.:
> - "Homepage → click a section on the canvas → **Design** tab → scroll to **Effects**"
>   (shadow/radius/blur/hover effect/shape dividers/magnetic buttons/text gradients —
>   these live in the per-section **Design** tab, via `SectionSettingsPanel`).
> - "Homepage → click a section → **Content** tab → any image field → **Image style**"
>   (focal point/filter/overlay/hover zoom — collapsed by default under image fields).
> - "Homepage → click a section with blocks (Multicolumn, Row, Pricing Table, etc.) →
>   **Content** tab → open a block → the list field (Links/Buttons/Features)" (drag
>   handle to reorder, "Add" button to append a row).
> - "Menus → Header or Footer tab → sub-links and (if Mega menu is on) column links
>   now drag-reorder with the grip handle."
> - "Just double-click text directly in the live preview pane" (inline canvas
>   editing — dashed outline on hover, Escape to cancel; no panel involved).
> - "Colors → scroll to **Checkout & Cart**" (accent/background/input radius +
>   automatic WCAG contrast badges once a color is set).
> Since `/admin` requires real Google sign-in restricted to one account, agents
> cannot screenshot the live authenticated UI themselves — write the walkthrough
> from the actual on-screen labels in the code (accordion `title`s, tab labels,
> button text), not from memory or guesswork.

> [!IMPORTANT]
> **Everything shopper-facing must be editable in Studio — nothing "built into the site".**
> Any storefront element (box, row, link, heading, text) needs a Studio control to hide/show it
> and its words in Text & labels (`COPY_SCHEMA`). Add the toggle to `STYLE_GROUPS` in
> `studio/styleSchema.ts` (default = current behaviour) in the same change that adds the element.

> [!IMPORTANT]
> **Every design must be fully editable in Studio.** Each theme-library preset
> (`studio/themeLibrary.ts`) may only set keys that have a Studio › Style control in
> `STYLE_GROUPS`: top-level keys go through `THEME_APPLIED_KEYS`, everything else in the preset's
> `global`. `studio/themeLibrary.test.ts` fails on any preset key with no control, and
> `features/site/studioCoverage.test.ts` fails on any design key the storefront reads without one.
> Add the control in the same change as the design key — never allowlist around the test.

> [!IMPORTANT]
> **Every aspect of the public website must be editable in the designer (Studio).** No hard-coded
> colours in storefront code: use a design key (`design.x || "#hex"`) or a theme variable
> (`var(--token, #hex)`) — the hex may only be a fallback. Every section default needs a Content
> field (lists are edited as blocks). `features/site/designerCoverage.test.ts` enforces both,
> alongside `studioCoverage`, `storeCopy.coverage`, `studioTargets` and `themeLibrary` tests.
> Tailwind colour classes count too: every one the storefront uses (incl. `hover:`/`focus:`/
> `group-hover:`/`selection:`/`md:` variants) must be listed in `features/site/storefrontColorClasses.ts`,
> which `colorUtilityCss` in `themeTokens.ts` re-points at a Studio token (greys → text/muted/surface,
> black → overlay/page colour, hues → accent/success/warning/danger). `designerCoverage.test.ts` fails
> on an unlisted or unmappable class — add it to the list rather than hard-coding a colour.

**Page pictures (October 2026):** Studio › Pages edits the body with `studio/PageBodyEditor.tsx` (Quill + an `hr` divider blot,
video embeds, align/indent). Pictures (Add pictures, Choose from library, paste, drag-and-drop) upload through
`uploadPagePicture` (media library when on, else `uploadStudioImage`) onto their own line; never store `data:` pictures —
Save uploads any left (`features/site/pageBody.ts` `pastedImageSources`/`replaceImageSources`). Selecting a picture edits its
`width` (`IMAGE_SIZES`), line `align` and `alt`. `page.seoImage` (Sharing image) feeds `useSEO` in `PageView`, else the body's
first picture (`firstBodyImage`). `PageContentSection` styles Quill's `ql-align-*`/`ql-indent-*`, `iframe`, `hr` and `s`.

**Full width + shop filter bar (15 October 2026):** Style › Layout & spacing › **Use the full screen width** (`fullWidth`, off by
default) makes `contentMaxWidth` / `catalogHeaderMaxWidth` (`features/site/headerNav.ts`) return "100%" for the header, shop grid,
book page, footer, secondary nav and custom pages (`PageView` passes `headerWidth: "full"`); use those helpers for any new storefront
column, never `containerWidth` directly. Style › Shop page heading & filters › **Shop filter bar** (`showShopFilterBar`,
`shopFilterBarCounts` off, `shopFilterBarInStock` on, font/outline/chosen colours) renders `.fm-filter-bar` beside the catalog
heading in `MainSite` (All · `shopFilterBarCategories` = visible categories with no visible children · In stock, sharing the
catalog's `inStockOnly`); the heading has `catalogHeading{Font,Size,SizeMobile,Case,Color}` (`.fm-catalog-heading`). CSS and fonts
come from `features/site/shopFilterBar.ts` through `StorefrontOverrides`; words are Text & labels › Catalog (`catalogAllCategories`)
and Search & filters (`filterInStock`, `filterBarAria`).

**Custom pages share one look:** Studio › Style › **Custom pages** (`page*` design keys, `sitePageStyle`
in `PageView.tsx`) sets eyebrow, title size/case/colour, text size/colour, alignment and column
width for every custom page. Each "Page content" section follows it unless its **Style this page on
its own** switch (`ownStyle`) is on; pages without that section render the same component. Default is the Riso "Ruled" layout (Option D): no small "Page" label (`pageShowEyebrow`
off), the title lined up with the header (`pageWidth: "header"`, same width as the `StoreHeader` row), a line
under it (`pageShowRule`, `pageRuleColor/Width/Spacing`) and a readable text column (`pageTextMeasure`: readable 62ch · comfortable 75ch · wide 90ch · full column; `pageTextWidthPx` > 0 sets an exact width and wins; section fields `textMeasure`/`textWidthPx`). Title
font/size px (desktop + phone)/weight and top spacing are `pageTitleFont`, `pageTitleSizePx*`, `pageTitleWeight`,
`pageTopSpacing`; the Page content section has the same fields for "Style this page on its own".

> [!IMPORTANT]
> **Sentences that reach shoppers indirectly are copy too.** Error messages (`new Error("…")`),
> notices (`setNotice`/`setError`), `window.prompt`, SEO titles/descriptions, template-literal
> `aria-label`/`alt`s and renderer word-fallbacks must all come from `getCopy()` (Studio › Text & labels —
> groups *Checkout*, *Order tracking*, *Reviews*, *Sections*, **Site & sharing**) or, inside
> `SectionComponents.tsx`, from `sectionFallbacks.ts` (`fb("Type.field")`, each backed by a Content
> field; use `??` so clearing a field blanks it). `noHardwiredMessages.test.ts` and
> `components/sectionFallbacks.test.ts` enforce this; `designerCoverage.test.ts` also rejects literal
> `rgb()/rgba()/hsl()` (use `rgba(var(--accent-rgb, …), a)` or a design key). Behaviour numbers
> (low-stock thresholds, recently-viewed count, search-result cap) and the no-photo placeholder image
> are Studio › Style controls read with `designNumber()` / `placeholderImage()`. Site name, default
> title/description and share image live in Text & labels › **Site & sharing** and Style › Logo &
> wordmark › **Share image**; `lib/seo.ts` reads them via `setSiteIdentity` (published by `useSiteData`).
> No sample books or announcements are shown to shoppers; empty sections show their "how to fill me" sample
> only in the Studio preview (`sampleInPreview`/`sampleHtml`, guarded by `components/noSampleContent.test.tsx`).
> Footer policy link/page titles are Text & labels › Footer (`policyTitle*`).

**Click-to-edit in the preview:** sections carry `data-fm-section`; every other storefront region carries `data-studio-target="style:<groupId>|copy:<Group>|menus:<panel>|pages"` + `data-studio-label`. In Edit mode the preview bridge (`studio/previewBridge.ts`) outlines it, and a click selects that part (`STUDIO_ELEMENT`): the right-hand inspector opens it with **Words · Style · Layout · Visibility** tabs (`studio/elementCatalog.ts` picks the existing controls, `StudioElementInspector.tsx` renders them) — no pop-up menu. **Open in Theme settings** still reaches the full category (`openTarget`). New storefront regions must carry a target — `studioTargets.test.ts` checks every target points at a real panel.

**Category drop-downs:** a shop category can sit under another (`parentId`, Studio › Menus › Shop categories ›
**Sits under**, one level deep — `navItems.ts` `parentOf`/`childCategories`). A parent with sub-categories renders as
`features/site/NavDropdown.tsx` in every header (All + each sub-category); `bookInCategory(book, cat, allCats)` makes a
parent include its sub-categories' books. Books are filed in Books › edit › Organize (chips show `Parent › Child`).
Style › Navigation links has the drop-down controls (`navDropdown*`, `navFlatSubcategories`); the "All" word is
Text & labels › Header (`navDropdownAll`). `/collections/:slug` renders `MainSite` (same header/footer) opened on that
category — the standalone `CollectionPage` is no longer routed.

**One storefront shell:** `MainSite` renders a single Riso header/footer for every view; the Home view swaps the catalog grid for `design.heroPage.sections`. Studio › Sections (Home) › **Show a Home page** toggles `showHero` (off = open straight on the catalog). The legacy hero header/`HeroCarousel` were removed — don't re-add a second header.

**One header & footer (Studio 2.0 · 2.1):** `features/site/StoreHeader.tsx` is the only storefront header and
`features/site/StoreFooter.tsx` the only footer. MainSite passes `shop={…}` (in-page category picking, logo → Home,
masthead layout, logo alignment, sticker pills, transparent header, wishlist count, light/dark toggle, Ctrl/⌘+K);
product and custom pages use page mode (routed links). Wishlist, account, order tracking and 404 render inside
`StoreChrome` (header + footer around the page; its title bar becomes a plain row via `useInStoreChrome`), switched by
Style › Header & announcement bar › **Show the shop header & footer on wishlist, account, order tracking and missing
pages** (`showStoreChromeOnUtilityPages`, default on). Checkout keeps its own `checkoutHeader`. Add header/footer
features there only — `storeChrome.parity.test.tsx` checks every Studio hook against `__fixtures__/storeChromeHooks.json`
and fails if another file renders the navigation `<header>` or `footerPanel`; refresh the fixture
(`UPDATE_STORE_CHROME_HOOKS=1`) only for an intended hook change.

**Shop card title & price:** Studio › Style › **Book cards in the shop grid** has colour, size (desktop + phone), weight, font and letter-spacing controls for the card title and price (`productTitleColor`, `cardTitle*`, `productPriceColor`, `cardPrice*`), plus the boxed-tag and old-price colours. `features/site/cardTypography.ts` turns them into CSS (emitted by `StorefrontThemeStyle`); cards opt in with the `fm-card-title` / `fm-card-price-wrap` / `fm-card-price` / `fm-card-price-tag` / `fm-card-price-old` classes — the shop grid, collection, wishlist, search, related-books and recently-viewed cards and the **Product grid** / **Product showcase grid** sections do. When a Style card colour is set it wins over a section's own colour; empty = the section's colour. Add those classes to any new book card — `features/site/cardClasses.test.tsx` renders every section with sample books and fails on a book title without `fm-card-title`.

**Section groups (2.2):** three every-page section lists, all root-only: `headerSections` (under the header),
`globalSections` (above the footer) and `overlaySections` (pop-up) — rules in `features/site/sectionGroups.ts`, rendered by
`GroupSections` in `sectionRender.tsx` (`StoreHeader` renders the header group and `PopupSections`). Write any section list
with `writeSections` (`studio/studioWorkflow.ts`); a group is a plain array. The pop-up waits for the cookie answer, then
Style › **Pop-up** (delay, how often, position, width, shading, colours, hide on phones); in the preview it opens only on
request. Announcement bar messages (`announcements`, link + show-from/until Toronto days) are edited in Theme settings ›
Header & announcement bar › **Announcement messages**; without a list the single `announcementText` is unchanged. Header
links with sub-links have **Show sub-links as a mega menu (columns)** + featured card in Navigation › Header menu.

**Section library (2.6):** Add section is a panel in Page layout (`studio/StudioSectionLibrary.tsx`); pointing at a card
shows it on the page through a preview-only `__studio-candidate` section (`studio/sectionLibrary.ts` `withCandidate` —
never saved). The canvas toolbar's **+ Section above / below** sends `INSERT_AT`. A registry entry's `bestIn`
(`{ group | template, note }`) powers **Add it there instead**. Thumbnails are code-drawn (`studio/sectionThumbs.tsx`; map
new types in `KIND`). Saved sections and shared blocks are renamed/deleted there (`deleteSharedBlock` bakes content into
placements). Product-page sections can read the current book with `useSectionPage()` (`components/sectionCopy.ts`).
Newsletter forms sign up through `features/site/newsletterSignup.ts` and never write from the preview.

**Custom book fields + dynamic sources (2.7):** field definitions are in public `settings/bookFields` (Books › edit ›
**More details** edits them and each book's answers in `book.custom`; `features/site/bookFields.ts`). A section/block field
can be connected to a page detail — saved as `{ "$dyn": "book.custom.series" }` or `{{book.title}}` tokens — and
`SectionList` resolves it with `resolveDynamicSettings` (`features/site/dynamicSources.ts`) from `SectionPageContext`
(book: `BookDetail`, category: `MainSite`, page: `PageView`), so renderers only ever see plain values. Never render a raw
setting value in Studio UI without `displayValue()`; code reading setting values as text must tolerate `$dyn` objects.
Section › Visibility › **Hide when a connected detail is empty** (`hideWhenEmpty`). Studio's Content tab offers
**Connect to a detail…** (`studio/StudioConnect.tsx`).

**Alternate templates (2.8):** extra book/collection page layouts — list in root-only `design.alternateTemplates`, each on
surface `productPage~<id>` / `collectionPage~<id>` (`features/site/templateAlternates.ts`; layered storefront → default →
alternate by `designModel`). Books pick one with `book.templateId` (Books › edit › Categories & tags › **Book page
template**), categories with `category.templateId` (Navigation › Shop categories › Edit). Studio: Page layout › template
card (New template from this one / Rename / Delete); the preview URL carries `?template=<id>`. Collection alternates carry
sections only. Use `bookTemplateSurface` / `categoryTemplateSurface` / `sectionsSurface` — never read `design.productPage`
directly for a book's sections.

**Product information as blocks (2.9):** the buy card is the ordered list `productInfoBlocks` (on `productPage` or an
alternate template) — rules in `features/site/productBlocks.ts`, rendered by `renderBlock` in `BookDetail.tsx`, edited in
Page layout › **Buy box blocks** (`studio/StudioProductBlocks.tsx`). No list = the hand-written card exactly
(`productCard.parity.test.tsx` + `__fixtures__/productCardDom.json`); a new buy-card piece needs a built-in block type and a
parity fixture refresh. `heading` and `buy` are required. Buy-card visibility reads `regionDesign` (the shown template).

**Version history 2.0 (3.1):** Theme actions › **Version history** (`studio/StudioHistory.tsx`) keeps each Publish (last 30
unpinned), `draft-latest` and named, pinned **checkpoints** (`adminApi.saveThemeCheckpoint` / `updateThemeVersion` /
`deleteThemeVersion`; pinned rows are never pruned, max `THEME_PINNED_LIMIT` 20; `draft-latest` can't be renamed or pinned).
**Compare** uses `studio/designDiff.ts` `diffDesigns` (labels from `STYLE_GROUPS`, `COPY_SCHEMA`, the registry and templates;
sections matched by id) and **Use this version's** applies `restoreItem` as one named `change`. Publish/Discard dialogs list
`summariseDiff` lines. New structured design keys with their own editor belong in `designDiff.ts` `STRUCTURAL` so they get
a readable name. Studio's `confirmNode`/`promptNode` render last so questions asked from inside a dialog open on top.

**Live sync (3.2):** while Studio is open, `useStudioPersistence` follows the private working copy (`watchWorkspace`;
the fixture fakes it with `__studioFixture.remoteSave(draft, { publish })`). `decideRemoteChange` (pure, `studioWorkflow.ts`)
ignores revisions not newer than this tab's, takes another tab's save when nothing is unsaved here, and otherwise shows the
**This design was saved in another tab or device** banner (Bring in / Use their version / Later). Remote drafts go through
`normalize` before any comparison. Never auto-overwrite unsaved edits.
**Save conflicts (October 2026):** `resolveSaveConflict` (`studioWorkflow.ts`) gives the dialog both outcomes, each keeping every
change only one side made (`Keep mine` wins the shared setting, `Use the other version` takes theirs there; neither throws the other
side's other edits away). A conflict during **Publish** never publishes: even a clean merge is only restored into the draft with a
message, and the owner presses Publish again after reviewing it (only Save draft auto-saves a clean merge). `draftFieldUpdate`
(shop categories, Under construction wall) now bumps `rev` in a transaction (`action: "field"`), so other open Studios follow it
through live sync and a stale Save/Publish conflicts instead of reverting the value. Studio re-reads the live design
(`adminApi.getLiveDesign`) when it opens and when the Publish/Discard dialog opens; Discard writes the freshly read live design.

**Studio Health (3.3):** Theme actions › **Studio Health** runs `studio/healthAudit.ts` `auditDocument` on the preview
iframe's own document (contrast, picture descriptions/size/weight, link names and targets, tap targets, headings, fonts,
page size, title/description) and lists findings with **Show me** / **Edit this part** (owner = the bridge's node key,
`ownerOf`). New storefront parts are covered automatically when they carry the usual `data-fm-section` /
`data-studio-target` hooks. The audit only reads the DOM; never change the preview from it except the brief Show me outline.

**Themes workspace + share previews (3.4):** Studio › **Themes** (`studio/StudioThemes.tsx`) lists the live theme, the draft,
My themes and presets with `ThemeThumb` drawings; Preview uses the canvas only (`themePreview` state, like History's
preview). Share links are `previewTokens/{token}` (admin writes; public `get` by exact token while unexpired — never list);
the storefront reads them only through `features/site/themePreview.ts` + `publicApi.getThemePreview`, never caches the
shared design, keeps it noindex and out of analytics (`trackingGuard`, `useSiteData`), and always shows
`ThemePreviewBanner`. Deploy `firestore.rules` with the frontend for share links to work.

**Scheduling & campaigns (3.5):** Studio › Theme actions › **Schedule publishing…** (`studio/StudioSchedule.tsx`,
`studio/themeSchedule.ts`) writes admin-only `themeSchedule/{id}`; `functions/themeSchedule.js` (run inside
`unpaidPaymentSweep`, every 15 minutes) publishes due entries into `settings/website.design` and switches campaigns back
at their end unless a later Publish happened. Never put scheduled designs in the public settings document, and never
apply schedules in the browser. Times are entered in Toronto time and stored as UTC ISO.
The Toronto clock is `features/site/shopTime.ts` (shared by Studio and the storefront); a nonexistent spring-forward time is refused
by `scheduleProblems` (never moved earlier). Section **Show from / Show until** (`sectionInWindow`) read zone-less values as Toronto time
via `shopInstant`. When a schedule starts or a campaign ends, `functions/themeSchedule.js` keeps the fields edited live outside Publish
(`LIVE_ONLY_KEYS`: `categories`, `showUnderConstruction`) from the current live design, unless the scheduled design itself changed them
(`liveBase`, recorded by `addThemeSchedule`; a started campaign records `appliedLiveOnly`). Media Delete also checks scheduled designs,
a running campaign's `revertDesign` and unexpired share links (`adminApi.listStoredDesigns`, `storedDesignUses`). Deploy Functions with the frontend.

**Performance (Phase 4):** compare designs with `designEqual` (`features/site/designEqual.ts`), never `JSON.stringify`, and
keep normalisers identity-preserving (return the same object when nothing changes) so edits share structure. Heavy Studio
derivations (Find index, "changed" counts) are computed only while their panel is open. Storefront sections from the third
on use `content-visibility: auto` (`lazySections`, default on; not in preview, groups or fixed bars) — a new section with
a fixed-position bar belongs in `LAZY_EXCLUDED_TYPES`. `components/sectionPerformance.test.tsx` caps section DOM size.

**Colour schemes (2.5):** Studio › Theme settings › **Colour schemes** (`StudioColorSchemes.tsx`, pure edits in
`studio/colorSchemeOps.ts`) edits `design.colorSchemes` — ten roles (background, surface, text, muted, accent, onAccent,
border, buttonBg, buttonText, link) with a live swatch and WCAG badges. `features/site/colorSchemes.ts` `schemeCss()`
(emitted first by `StorefrontOverrides`) writes `[data-scheme="<id>"]` variables using the existing token names;
`SectionList` sets `data-scheme` from the section's Style tab › Colour scheme (`colorSchemeId`). `design.elementSchemes`
(`cards` → `.fm-card`, `buyCard` → `.fm-pdp-card`, `cartDrawer` → `.fm-bag`) applies a scheme to those parts, and while
it does their own colour controls give way (`elementScheme()` in `cartDrawerStyle` / `productPageStyle`) — every new
book-card root needs the `fm-card` class. Schemes saved before 2.0 (no `v: 2`) keep their old background/text-only look
until a colour is edited (render-equivalence guard in `colorSchemes.test.ts`). Header/footer schemes wait for 2.1.

**Product page (catalogue card):** `features/site/BookDetail.tsx` renders the Riso "catalogue card" layout —
breadcrumb, thumbnail rail + framed photo + "Fig. n" caption, one bordered buy card (tag, title, price,
stock line | formats, qty, Add to bag, wishlist, share), then Description / Details / Reviews tabs (or
accordions) with Details as a label | value record. Every piece is a Studio › Style › **Book page · buy
box & details** control (inactive Description/Details tabs and closed accordions render `hidden` so crawlers and the prerender
read them; reviews stay lazy and Studio's preview skips the hidden copies) (`pdp*` keys, turned into CSS by `features/site/productPageStyle.ts`, `fm-pdp-*`
classes); its words are in Text & labels › Product page (`pdp*` copy keys). The main photo and the enlarged viewer are one swipeable,
snapping strip (`features/site/PhotoCarousel.tsx`: native scroll-snap for touch, mouse drag via `dragPlan`); the viewer
renders into `<body>` (`createPortal`, inside a `data-fm-store` wrapper). Dots under the photo: `pdpPhotoDots`. The old trust-signal lines
(`productTrust*`, `showTrustSignals`) were removed at the owner's request — don't re-add them.

**Every Style control must reach every surface (and the preview iframe):** the card title/price and small-print CSS comes from one place, `features/site/StorefrontOverrides.tsx` (`storefrontOverridesCss`). `StorefrontThemeStyle` renders it, and so do `MainSite`'s `TypographyTokens` and `BookDetail` — any new storefront root that injects its own token `<style>` must render `<StorefrontOverrides>` too. `storefrontOverrides.test.ts` fails on a surface that skips it and on any `STYLE_GROUPS` control that nothing on the storefront reads (wire it or delete it — don't allow-list). Custom code (Style › Custom code) is injected by `features/site/customCode.ts` on public pages only — never in the preview, checkout or admin.

> [!IMPORTANT]
> **Studio controls must reach the shop (16 October 2026, after an audit found ~30 dead controls).** A control that
> exists only in the schema, or whose CSS another rule beats, is a bug the owner finds by clicking it. Rules:
> - **Every control is in `scripts/studio-control-baseline.json`** with what it does to the Studio fixture preview
>   (`visible` / `css-only` / `dom-only`), or `none: <reason>` naming the state or setting it needs (a full bag, hover,
>   another switch). `studioControlBaseline.test.ts` fails on a missing, stale or reasonless entry; CI job
>   **studio-controls** (`pnpm run test:studio-controls`, ~15 min) changes every control in the browser and fails when one
>   that worked stops. After adding or changing a control run `AUDIT_UPDATE=1 node scripts/studio-control-audit.mjs`
>   (or `AUDIT_ONLY=<group ids>` locally first) and commit the baseline. Never mark a working control `none` to get green.
> - **Write CSS that wins where it lands:** the Riso look (`RISO_STOREFRONT_CSS`) and Fine-tune element CSS use
>   `!important`; Tailwind classes set their own line height/tracking/size per element. A site-wide value must move the
>   Tailwind variables (see `shopTypography.ts`) or target the element with enough specificity, and an element's own
>   setting must beat the theme reset (`:not([style*="border-radius"])`, `:not(#fm-studio)`). A default value must draw
>   exactly as before (parity tests).
> - **One reader per key:** when two surfaces read the same keys (MainSite `resolveTypography` vs `StorefrontThemeStyle`),
>   give them the same priority. A key read only in one layout or state says so in its label.
> - **Buttons land somewhere:** every Studio button that opens settings goes through `openTarget` (or marks its panel with
>   `data-studio-panel`); one that opens nothing calls `reportDeadStudioLink` and fails `pnpm run test:studio`, which clicks
>   every part's Style / Words / inspector buttons on Home and a book page.
> - The audit report is `docs/STUDIO_CONTROL_AUDIT.md`; re-run the audit for a large Studio change and update it.
> - **Reviving a dead control starts at Off (owner's choice, 16 October 2026):** when a control never drew, its saved value was
>   never seen, so wire a new key that defaults to today's look (`sectionGap`, `cardShadowDepth`, `showCollectionBreadcrumbs`)
>   instead of switching the old saved value on. A Style control that a Fine-tune element setting beats goes in
>   `studio/fineTuneConflicts.ts` so Studio says so; on All pages a field notes the previewed page's own value (`fieldPageOverride`).

**Photo shapes:** Studio › Style › **Book cards in the shop grid** has **Image shape (proportions)** (12 ratios, 3:4 … 21:9 … 9:16 — `PHOTO_RATIOS` in `features/site/photoShapes.ts`, also used by the Product grid / Product showcase grid / cover carousel sections) and **Image outline** (`photoOutline`: arch, window, pill, circle/oval, leaf, hexagon, octagon, diamond, cut corners, slanted). The product page has its own **Photo shape** / **Photo outline** (`productImageAspect`, `productPhotoOutline`; "Same as shop grid" by default). Outlines are CSS from `photoOutlineCss` (via `StorefrontOverrides`); new photo frames opt in with `fm-photo-frame` (shop cards) or `fm-photo-frame-pdp` (product photos).

**Shopping bag (cart drawer):** `components/CartDrawer.tsx` is a Riso "order slip" — ruled header, free-shipping
meter, numbered line items (photo, title, per-copy price, line total, qty stepper, Remove), "Complete your collection"
card, then Subtotal / Shipping / Total ledger, trust badges and checkout button. Every piece is a Studio › Style ›
**Cart drawer (shopping bag)** control (`cartDrawer*` keys + `showFreeShipBar`/`showCartTrustBadges`; the bar's amount comes from Settings › Shipping,
CSS from `features/site/cartDrawerStyle.ts`, `fm-bag-*` classes); words are Text & labels › Cart. Each region carries
its own click-to-edit target (Bag heading, Free-shipping bar, Bag line items, Bag suggestion, Bag total & checkout).

**Small print:** Studio › Style › **Small print & labels** (`smallPrint*` keys, `features/site/smallPrint.ts`) sets a minimum size, colour, case, letter spacing and font for every tiny `text-[8px]…text-[11px]` label at once. **Smallest text on phones** (`phoneMinTextSize`, default 12, 0 = off; `phoneMinText`) floors those labels and the phone card title/price below 768px.

**Element inspector (1.5):** clicking a built-in part (preview or Page layout) opens it in the right-hand inspector — Words (the strings shown inside it, else its whole Text & labels group), Style, Layout (per previewed device) and Visibility (none for `required` regions). Controls come from `STYLE_TARGET_FIELDS` / the region manifest / its `style:` targets (`elementCatalog.ts`); `elementCatalog.test.ts` fails if a clickable part opens nothing or a style category is unreachable (site-wide ones are `GLOBAL_STYLE_GROUPS`). Theme settings › element focus ("Editing: <label>") still exists via **Open in Theme settings**. Sections get **Content · Style · Layout · Visibility** tabs from `studio/sectionStyleSchema.ts` (`StudioSectionStyle.tsx`; the old hand-written `SectionSettingsPanel` is gone — `sectionStyleSchema.test.ts` pins its keys), including **Hide on tablets** (`hideOnTablet`, 768–1023px).

**Fonts:** Studio › Style › **Typography** has Google Fonts pickers (heading, body, header & menu `navFont`, logo `wordmarkFont`) fed by the curated list in `features/site/fonts.ts` (Riso trio Anton / Archivo / DM Mono first; `googleFontHref` uses only weights each family serves).

**Riso Noir storefront:** the public site defaults to the Riso Press look on black with white text
(`src/app/features/site/risoNoir.ts` → `RISO_NOIR_TOKENS`, `withRisoNoirDefault`; theme-library
preset `lyricalmyrical-riso-noir`). `RISO_STOREFRONT_CSS` in `themeTokens.ts` must stay token-driven
(no literal hex — `themeTokens.test.ts` enforces it). Colour triplet variables (`--fg-rgb`, `--accent-rgb`,
…) are **comma-separated** (`255, 255, 255`) so `rgba(var(--x-rgb), a)` is valid. Every shopper-facing
string goes through `getCopy(design, key)` with a `COPY_SCHEMA` entry (`storeCopy.coverage.test.ts`
guards this); print-treatment knobs live in Colors › **Printed-paper look (Riso)**, element toggles in
Additional › **Show or hide whole features**.

**Section contract:** the storefront looks up renderers by the registry `type`
string. A registry type with **no identically named renderer renders nothing**
("added but doesn't show up"). Adding a section = registry schema **+** matching
renderer **+** storefront mapping **+** library entry **+** verify on the live
storefront. Theme data persists as `design` (live, public `settings/website`) and the private
draft in `themes/workspace`, both written only through `admin/themeStore.ts`.

## Deployment

- **Frontend** → **Firebase Hosting** (`https://lyricalmyrical-web-v2.web.app`, site at the root `/`) via
  `.github/workflows/deploy-pages.yml` (display name "Deploy storefront"; file name kept for `keep-refresh-alive.yml`) on push
  to `main` and every 15 minutes when published content changed. The cutover from GitHub Pages happened in October 2026
  (`docs/FIREBASE_HOSTING.md`). Jobs: `build-hosting` (no secrets; **Site address** step = repository variable `SITE_URL` or
  the web.app default, must be `https://host` with no folder and never github.io; build, `carry-previous-assets`, emulator smoke
  test, `dist` artifact; `scripts/siteAddressCheck.mjs` refuses a `SITE_URL` missing from `ALLOWED_ORIGINS` and a custom one that
  doesn't serve the shop yet) → `deploy-hosting` (downloads `dist`, `firebase deploy --only hosting` with the pinned CLI and
  `FIREBASE_HOSTING_SERVICE_ACCOUNT` (Firebase Hosting Admin only), else `FIREBASE_SERVICE_ACCOUNT`; fails without either; live
  smoke test) → `redirect-old-address` (push/manual only: `scripts/build-pages-redirect.mjs` publishes forwarding pages to GitHub
  Pages). Both Hosting jobs run only on `main` and while the repository variable `FIREBASE_HOSTING_ENABLED` is `true` (keep it
  true; it is the emergency stop). Vite `base` defaults to `/` and `SPA_FALLBACK` to `shell`; every `SITE_URL` default (build
  scripts, `vite.config.ts`, `build-pages-redirect.mjs`, `functions/index.js` email links), the workflow fallback and
  `index.html`'s address must agree (`scripts/siteAddress.test.ts`). Still use `import.meta.env.BASE_URL` for links.
- **The old address forwards.** GitHub Pages (`…github.io/LyricalmyricalWebsite/…`) serves only forwarding pages
  (`scripts/pagesRedirect.mjs`, inlined with `toString()`): `index.html`, `404.html` and one page per prerendered route (200 +
  canonical to the new page, `<noscript>` refresh, `no-referrer`). `movedUrl` keeps path, query and `#hash` (emails already sent:
  `/track?orderId&key`, unsubscribe, `/checkout?cartId=`, `/admin#orders/<id>`) and decodes the old `?/…~and~` form. It also
  hands over, in `#lm-move=<base64url JSON>`, the old origin's bag and wishlist (once per browser, `lm:moved`; gift-card lines
  stay behind), on `/checkout?order_id=X` that order's `order-access:X` key (plus `attempt` when it was the tab's
  `fm_last_checkout_order`, so a retry still meets "earlier attempt already paid"; an oversized bag never drops the key), and
  the referrer's host (`from`; the forwarding page sends `no-referrer`). `features/site/movedState.ts` (`takeMovedState`, first
  thing in `main.tsx`) strips the hash, fills only an **empty** bag through `sanitizeCart` and **refuses gift-card lines** (a
  crafted link could otherwise name who receives a paid card's code), merges the wishlist, restores the key/attempt only for the
  matching `order_id`, and sets `referral_source` (`lib/referralSource.ts`, shared with App.tsx) only with analytics consent. The forwarding pages are replaced only after the Hosting deploy and its
  live check succeeded. Never point `SITE_URL` back at github.io.
- **Firebase** (Firestore rules/indexes, Storage rules, Functions) →
  `.github/workflows/deploy-firebase.yml` (needs `FIREBASE_SERVICE_ACCOUNT`
  secret), or manually: `npx firebase-tools deploy --only
  firestore:rules,firestore:indexes,storage,functions`. It never deploys Hosting. It appends `SITE_URL` (repository variable,
  validated) to `functions/.env.lyricalmyrical-web-v2` and, before deploying, checks that the email-link address answers with its
  64-hex `seo-published-fingerprint.txt` (so emails never point at a dead address; manual runs can pass `skip_site_check`
  during a hosting outage).
- **Firebase Hosting config** (`firebase.json` `hosting`): `cleanUrls` (prerendered `books/<slug>.html` answers at `/books/<slug>`),
  `trailingSlash: false` (301s to the slash-less canonical), one anchored **regex** rewrite of app routes to `spa.html`, **no
  catch-all** (unknown URLs get `404.html` = the app shell, a real 404 that still renders the editable missing page),
  `/assets/**` immutable, pages and root xml/txt `no-cache`, nosniff, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN` (Studio
  frames the shop; no CSP/COOP), `X-Robots-Tag: noindex` only on `/spa` and `/404`. Use `regex` sources and never give one path
  two values for a header (`scripts/hostingConfig.test.ts`, which also checks every `App.tsx` route is rewritten). A new
  top-level route needs the rewrite regex too. `vite.config.ts` `spaFallbackBase` writes `spa.html` (clean shell, before the
  prerender replaces `index.html`) and `404.html` as the shell (`scripts/spaFallback.mjs` `fallbackFiles`; `SPA_FALLBACK=redirect`
  rebuilds the old Pages redirect until the cleanup step); its `canonicalHost` plugin inlines `scripts/canonicalHost.mjs` after
  `<meta charset>` so `*.firebaseapp.com`/`*.web.app` visitors move to `SITE_URL`'s host. `scripts/hosting-smoke.mjs` checks
  statuses, redirects, bodies and headers in the Hosting emulator (CI and `build-hosting`) and on the live site after each
  deploy; live runs try failing checks again for about 3 minutes (`scripts/retryChecks.mjs`, `LIVE_RETRY_WAITS_MS`) because
  the CDN can serve the previous release for a while (run 804 failed 3 s after release); the emulator run never retries. `ALLOWED_ORIGINS` includes web.app (not firebaseapp.com) and, for tabs opened before the move, github.io (remove in the
  cleanup step); it already lists lyricalmyricalbooks.com/www for the shop's own domain later (`docs/FIREBASE_HOSTING.md`).
- **Old Big Cartel addresses (15 October 2026):** `firebase.json` `redirects` lists each old `/product/<name>`, `/category/<name>`
  and page address as an exact 301 to an absolute `https://lyricalmyricalbooks.com/...` page (one hop). No `/product/**` or
  `/category/**` catch-all: an unknown old address answers 404 (Google reads a redirect to a listing as a soft 404; Hosting can't
  send 410 without a function). Add a book's old address when one turns up. `/cart` is an app route (shop with the bag open,
  `CartRoute` in `App.tsx`) with `X-Robots-Tag: noindex`, and robots.txt must not disallow it. `scripts/seo-url-check.mjs` checks
  sitemap URLs (200 + self canonical), old addresses and /cart on the live site after each deploy (report only).
  Collection pages' single `<h1>` is the category name, with an intro from the category description or Text & labels ›
  Collection & wishlist pages › `collectionIntro*` (`features/site/collectionIntro.ts`).
- **Own domain (`docs/CUSTOM_DOMAIN.md`, ready, not switched):** the switch is Firebase Hosting › Add custom domain
  (apex `lyricalmyricalbooks.com`, www redirecting to it) + repository variable `SITE_URL=https://lyricalmyricalbooks.com`
  + Deploy Firebase, then Deploy storefront. Both workflows lower-case `SITE_URL` first. `moveToCanonicalHost` also moves
  the www/bare twin of SITE_URL's host; `stampSiteAddress` (in the `canonicalHost` Vite plugin) rewrites index.html's
  built-in web.app address (`DEFAULT_SITE_URL`) to SITE_URL; after the switch `hosting-smoke.mjs` checks web.app and
  firebaseapp.com still forward and warns when the www twin doesn't.

**No cancelled runs (12 October 2026).** Merging PRs in quick succession used to cancel the earlier runs (red marks on `main`).
`ci.yml` now cancels only superseded *pull request* runs (group per PR number / commit on main). `deploy-pages.yml` uses one group
per run and never cancels; `firebase-first` checks whether the run's commit is still the head of `main` and, if not, finishes green
as "superseded" without building (that check is now its own `newest` job); `deploy-hosting` re-checks right before `firebase deploy` and `redirect-old-address` only runs
when it deployed. `scripts/hostingConfig.test.ts` forbids `cancel-in-progress: true`. Only the workflows' first real run proves this.
**Deploy ordering contract (October 2026).** Rules, indexes and Functions go live before the frontend that needs them.
`deploy-pages.yml`'s `firebase-first` job, on a push to `main`, lists the changed files (GitHub compare API) and, when any
path watched by `deploy-firebase.yml` changed (keep its regex identical to that workflow's `on.push.paths`), waits for the
`deploy-firebase.yml` run of the same commit and fails unless it succeeded. `build-hosting` runs alongside it (building
publishes nothing) and only `deploy-hosting` `needs` it, with `needs.firebase-first.result == 'success'` (October 2026:
saves the ~2 min backend wait on backend pushes). `build-hosting` caches Chromium and the npx firebase-tools download
(`actions/cache`); `deploy-hosting`, which holds the key, restores no cache (editing `firebase.json`, including its `hosting` block, therefore also redeploys the backend first). A failed Firebase
deploy therefore stops the frontend; fix the backend and re-run, or start the storefront by hand (`workflow_dispatch` and the schedule
skip the wait). A later push that changes no backend file is not held back by an earlier push's Firebase deploy.
`deploy-firebase.yml` pins `firebase-tools` (`FIREBASE_TOOLS_VERSION`) and no longer passes `--force`, so it never deletes
console-made indexes or functions missing from the repo (delete deliberately: edit `firestore.indexes.json`, or
`firebase functions:delete`). The one thing `--force` used to do for CI, the Artifact Registry cleanup policy, is a separate
best-effort step (`functions:artifacts:setpolicy`). **Scheduled refresh keep-alive:** GitHub disables scheduled workflows in
a public repo after 60 days without repository activity, and Studio/admin edits are not repo activity.
`keep-refresh-alive.yml` runs monthly and calls `PUT /actions/workflows/{id}/enable` (needs `actions: write`) for
`deploy-pages.yml` and itself, warning when it finds one disabled. Prerender: a book/page slug that cannot be a file name
(`scripts/routeSafety.mjs`) is skipped with a warning and left out of the sitemap instead of failing the build. The
published-content fingerprint (`publicStorefrontData.mjs`) also covers Toronto-date sale/pre-order state and approved
reviews. Workflow changes can only be verified by their first real run.
**Stale-asset safety (October 2026):** Firebase Hosting (like Pages before it) replaces the whole site per deploy, so HTML cached from the previous deploy
pointed at deleted hashed CSS/JS and rendered unstyled. `scripts/carry-previous-assets.mjs` (workflow step after the build)
writes `dist/asset-manifest.txt` (this build's `assets/` only) and copies back the files the live list names, keeping one
older generation; it only warns on failure, and refuses HTML answers (a host's 404 page) as an asset or list. The
`check-published-change.mjs` marker must be a 64-hex digest (`isFingerprint`), so an HTML page means "rebuild". `index.html`'s first inline script reloads once (per minute, sessionStorage
`lm:stale-asset-reload`) when the site's own stylesheet/script or a lazy chunk (`vite:preloadError`) fails to load.

### Release banner (removed)

The admin Overview no longer shows a "System status & recent release" card, so there is
nothing to update after a deploy. Don't re-add it unless asked.

## Inventory app link (11 October 2026)

The shop and the inventory app (`lyricalmyricalbooks/lyrical-inventory`, Firebase project `lyricalmyrical-37c46`) share sales
and stock; the contract is `docs/INVENTORY_LINK.md` (same file as the inventory repo's `docs/website-link.md` — change both).
**The inventory app is the master count** for every linked edition; nothing here is a payment path.
- **Transport:** Functions open a second Admin SDK app on `lyricalmyrical-37c46` (`functions/inventoryLinkStore.js`, the only code
  that touches it) with their own service account, which the owner grants **Cloud Datastore User** there once.
- **Sales → app:** `onOrderInventoryPush` (any write to `orders/{id}`) and the 5-minute `inventoryLinkSweep` write
  `websiteOrders/{orderId}` in the inventory project. `functions/inventoryLink.js` `orderFootprint` counts physical copies of
  linked editions per order (box sets as their parts, minus `restockedItems`/`partialRestockedItems`), never what `writeStock`
  happened to do. The website's own record `inventoryPushes/{orderId}` (server-only, deny-all rule) is written first; links are
  frozen per order line. Orders count from the owner's start day (`startDay`, then a backfill). Section 3 › **Send older orders too**
  moves it earlier only (`startSales` again): `markPastOrders` stamps `websiteLink/website.pastFromAt` first (informational), then the
  backfill restarts. A later day is refused. The app brings every order in by itself (no "Bring them in" step): sales typed in
  by hand are linked, unclear ones wait under Needs you; its Storage check proves each book moved to Firestore intact.
- **Stock → website:** the app publishes `websiteStockFeed/{book}`; for each linked edition the sweep sets
  `max(0, min(feed.base − Σ inventoryPushes.net[book], feed.onHand))` (`stockPlanFor`), per book in one transaction that skips a
  book changed after the run started, with an `inventoryLog` row (reason "Inventory app"). Automatic runs (owner switch, every
  15 min) hold big changes, untracked books and books with no print run; the owner's confirmed preview applies them.
- **Postage from the app:** `app.shipment` on the inbox doc → `applyAppShipment` attaches tracking (`trackingSource:
  "inventory-app"`, `order-operations.externalLabel`) or dispatches with `externalDispatchProblem` (`functions/fulfillmentGuard.js`,
  parity with admin `dispatchProblem` in `dispatchGuard.parity.test.ts`; stricter on open cancel requests). `labelProblem` refuses a
  second website label. Refusals reach the app (`shipmentReply`) and the admin alerts (`shipmentIssues`).
- **Shared piles:** editions of one book linked to the same inventory book (signed/unsigned) share their copies
  (`functions/stockPools.js`): `readBooks`/`stockChanges` move every edition of the pile, `reserveStock` holds against it.
- **Counting on / no count:** a confirmed Apply turns `trackInventory` on for an `untracked` row even when `to === from`.
  A matched book with no count (`no-feed`, drop-down shows no "(N on hand)") is one the inventory app hasn't published;
  the app moves books left in its old storage over by itself on open (`_fbAdoptBook`).
- **Linked stock is read-only on the website:** `inventoryApi.adjustStock` refuses (`reason: "linked"`), `adminApi.updateBook` keeps live
  stock (`lockLinkedStock`), the editor/catalog/edition dialog show "Counted in the inventory app", CSV import skips it.
- **Admin:** Inventory › **Inventory app link** (`InventoryLinkPanel.tsx`, pure helpers `inventoryLink.ts`): connect → match books →
  send sales → preview/apply stock → automatic. Server ops are `createStripeCheckoutSession` `action: "inventoryLink"`
  (`functions/inventoryLinkAdmin.js`). Link state is admin-read `systemStatus/inventoryLink`; alerts in `adminAlerts.ts` `inventoryLinkAlerts`.
- **Safety rules from the first review (follow-up PR):** stock is applied only when the catch-up recorded every order that may
  have changed (`catchUp` `complete`; a full page resumes from `catchUpResumeAt`) and any re-send after new matches finished
  (`relinkBatch`, cursor `relinkCursor`). App labels are refused while `operations.labelPurchasePending`. Confirmed Apply turns
  `trackInventory` on only when every edition is a matched printed one (`untracked-mixed` hold otherwise); a `_` link on a book now
  sold in editions holds (`now-has-editions`). Removing matches never needs the inventory app (Unmatch all). Order detail ›
  **Remove the inventory app label** (`fulfillmentAction("clear_app_label")`). Waiting orders age by `pendingSince`.
- **Deploy** Firestore rules + Functions with the frontend. Local tests use in-memory fakes (`functions/inventoryLink.fakes.mjs`);
  they don't prove the IAM grant, the deployed trigger or the inventory app's import.

## Riso Press admin design system

`src/app/admin/riso/` implements the published **Riso Press design system**
(artifact https://claude.ai/artifact/MvJwSgL7vE4vExRKaC9Gph): newsprint/ink palette, flare
`gold` primary fill with **ink** text (never lighten it), `gold-text` for flare words,
square corners, 2px ink outlines on objects and hairlines inside lists, flat offset
shadows by day, warm-grey night mode, Anton / Archivo / DM Mono, status = glyph + word.
If tokens change there, update `riso.css` to match.

- `riso.css` — semantic `--rp-*` tokens (light + night) and every `rp-*` component
  class; reduced motion, 44px coarse-pointer targets, visible focus, print.
- `components.tsx` — AppShell, Sidebar, Topbar, PageHeader, Breadcrumbs, SectionCard,
  SectionHead, MetricCard, buttons, IconButton, TextField/TextArea/SelectField/
  SearchField, Toggle, Checkbox, StatusBadge, DataTable (row states, sticky head),
  FilterBar, Pagination, Tabs, TabBar, Dialog/Drawer/ConfirmDialog (focus trap, Escape,
  focus restore), `useConfirm()`, ActionMenu, Toast, SyncChip, Empty/Loading/ErrorState,
  SaveBar. `shellParts.tsx` — GlobalSearch, ActivityLogDialog. `nav.ts` — nav config.
- `src/app/lib/useFocusTrap.ts` — shared by admin dialogs and the storefront cart drawer.
- **Sidebar:** `sidebarItems(NAV)` (`riso/nav.ts`) shows each Settings child as its own top-level item (`settings/<page>`,
  own icon, `section: "Settings"` heading); `NAV` keeps the nested shape for page titles and admin search. What's new
  (`admin/WhatsNew.tsx`) is a one-line sidebar button (latest title, unread dot via localStorage `lm:whats-new-seen`)
  that opens every note in a Dialog.
  Settings › **Email sender** is the one email page (`settingsTab: "notifications"`, `NotificationEditor`); the old
  `communications` id/route (`#settings/communications`) opens the same page and is no longer a separate menu item.

**Admin address bar:** the page on screen lives in the hash (`admin/adminRoute.ts`, pure + tested): `#orders/<id>`,
`#settings/payments`, `#customers`, `#gift-cards/<id>`, `#designer?…` (Studio). `Dashboard.tsx` reads it at boot and on
Back/Forward, writes it on every page change (switching orders replaces, new pages push) and names the browser tab.
Back/Forward never close the book editor or Studio (the address is put back). Add a new admin page to `ADMIN_TABS`.

**Migrated (built from these components):** shell, Login, Reviews, Activity Logs,
Orders list + detail, Overview, Books catalog, Discounts, Settings › General,
Payments, Shipping (profiles/zones/rates + dialogs), Notifications (+ Inventory sync). `Dashboard.tsx` renders migrated pages
outside the legacy wrapper via its `migrated` flag — add new ones there.

**Overview layout = widget board (18 October 2026)** (`AnalyticsDashboard.tsx` loads the data and owns the masthead/period
control; `OverviewBoard.tsx` draws the board; pure model `overviewBoard.ts`, tested): seven fixed topic bands (`BANDS`: today, sales,
titles, traffic, search, customers, stock) of widgets (`WIDGETS`, 51) on a 12-column grid (S/M/L/XL = 4/6/8/12, height auto/short/tall).
A widget always lives in its own topic's band (`normalizeBoard` moves it back), so analytics stay grouped. Bands and widgets fold
(a folded widget mounts nothing, so it loads nothing); *Fold everything*, per-band *Fold widgets*, Edit board (grip drag within the
band, ← →, sizes, ⋯ menu, band ↑ ↓ / Hide topic, Undo/Redo), Add widgets tray, full view (`Open full view`, Esc) and *Explore all N*
per topic. Panels show one card each through their `only` prop (`OverviewSales/Marketing/Customers/Stock`; ids are the widget type,
`kpis` for custKpis/stockKpis); `CardInWidget` hides a SectionCard's own title/fold inside a widget. Chart and figure widgets are `multi`
(own `config`: metric/grain/compare, figures). Carts, back-in-stock sign-ups and Search Console are read once per board through
`overviewShared.ts` `sharedLoad` (Refresh clears it). Boards (templates `TEMPLATES`, max 12) are saved in localStorage `lm:overview-board`
and admin-only `adminPrefs/overviewBoard` (`overviewBoardStore.ts`, `{ data: JSON string, updatedAt }`, newer copy wins; deploy the
`adminPrefs` rule). A new analytics panel = a `WIDGETS` entry in the right band + its `only` id (`overviewBoard.test.ts` checks both).
Everything sales-related (revenue net of partial refunds, orders, AOV, **conversion = paid orders ÷ visits**, chart revenue)
comes from real paid non-test orders (`overviewInsights.ts`); the webhook-bumped `analytics.orders/revenue` are not read.
Orders and traffic share calendar-day windows (`periodKeys`, UTC day keys like the `analytics/<date>` docs); all orders/books are
loaded (`getAllOrders`, `getAllBooks`), traffic via `getDailyAnalytics` (400 days). Traffic maths is in `overviewTraffic.ts` (pure, tested).
Marketing/Customers/Stock load carts and back-in-stock sign-ups only when opened.
**Storefront signals** (`funnelApi` in `lib/commerce.ts`, guarded by `lib/trackingGuard.ts`: analytics consent, not Studio preview, not a signed-in
admin): daily `analytics/<date>` docs get `increment()` merges for `visits`, `funnel`, `categoryViews` plus `sources`, `devices`
(from `trackSession`), `bookViews` (`trackProductView`) and `searches`/`noResults` (`trackSearch`, personal-looking terms dropped via
`cleanSearchTerm`). `firestore.rules` caps those maps and lets only the admin read `analytics`. **Deploy rules before the frontend.**
New panels say "Not recorded yet" until data exists — never a made-up zero.

**Not yet rebuilt** (still legacy markup, styled by the scoped compatibility layer in
`theme.css` under `.admin-reso[data-admin-theme="reso"]`, which maps old dark utilities
and violet/blue accents onto Riso tokens): Taxes/Communications
(not in the nav) and the theme editor's panels. The Book editor and catalog are Riso components plus `admin/books.css`.
**Admin UX pass (19 October 2026):** top bar `ShopStatusMenu` (`riso/shellParts.tsx`: Shop open/closed/Checkout paused, Close/Open
the shop through the existing confirm, Store status settings); Help and appearance are also in the avatar menu; search opens from a
magnifier on phones. `AdminAlerts` sorts urgent first and folds after two. `DataTable` `stackOnPhone` turns rows into cards at ≤767px;
Riso buttons take `busy`. Settings pages group cards with `admin/settingsLayout.tsx` (`SettingsTabs` sub tabs, one `SettingsGroup` panel per topic,
`HowTo`, `friendlyError`); Email/Reviews/Messages errors go through
`admin/plainError.ts`, sign-in errors through `admin/loginError.ts` — never show raw `err.message` in admin. The order page lays itself
out by its own width (container query on `.fw-detail` in `fulfillment.css`).
**Sub tabs (owner's preference, 20 October 2026):** split a long admin page into sub tabs (Riso `Tabs` + `TabPanel`) rather than
one long scroll: Settings › General / Payments (`SettingsTabs`), Email sender (Emails · Sending setup · Deliveries), Inventory
(Stock · Inventory app link). Panels stay mounted (`hidden`), so unsaved edits survive a switch and one SaveBar covers every tab;
mark a tab with edits with `unsaved`. Tab ids must be unique on the page (`rp-tab-<id>`). Overview and Design are out of scope.
Never wrap `rp-*` chrome in `.admin-light` — its `aside button` / `input` rules override
it. Don't add new compat rules for new work; compose the components instead.

## Verification

- **CI** (`.github/workflows/ci.yml`) runs `pnpm test`, `pnpm run typecheck`, `vite build`, the Studio browser
  checks (`pnpm run test:studio`) and the Studio control check (`pnpm run test:studio-controls`) on every PR.
- **Studio fixture:** `pnpm dev` then open `/studio-fixture.html` — the real Studio with in-memory data
  (`studio/fixture/fakeStudioApi.ts`; writes are recorded in `window.__studioFixture.calls`, nothing reaches
  Firestore). `pnpm run test:studio` drives it in Chromium (`CHROMIUM_PATH` to reuse an installed browser,
  `STUDIO_SHOTS=dir` for screenshots). Extend `scripts/studio-e2e.mjs` when Studio behaviour changes.
  `pnpm run typecheck` (`scripts/typecheck-ratchet.mjs`) fails when any file gains type errors over
  `scripts/typecheck-baseline.json`; after fixing errors run it with `--update` to lower the baseline.
- `npm test` (vitest, node env): includes the registry/renderer parity test, nav,
  discount-state, order-status/CSV, cart-quantity and the **theme draft/publish
  separation** test (Firestore mocked) — a draft/discard must never write `design`.
- `tsconfig.json` (strict off, `noEmit`) exists for type-checking only; Vite does not use it.
- Use `pnpm install` (the lockfile pins `react`/`react-dom` 18.3.1, which are optional peer deps —
  a plain `npm install` leaves them out). Vitest also runs `functions/*.test.js`, so run
  `npm ci` in `functions/` first.
- Older page-level visual checks used a throwaway harness that mounts a page with mocked
  `adminApi` data (not committed). Screenshots: `docs/screenshots/riso/`.

## Security notes

- **Secret keys live only in admin-only `adminSecrets/*`** (`stripe`: `secretKey`/`testSecretKey`,
  `resend`: `apiKey`, `gmail`: `appPassword`). `admin/privateKeys.ts` strips them from every
  `settings/website` / `settings/notifications` write (`adminApi.updateSettings`, `saveNotificationSettings`);
  the UI only sees `*Stored` flags. Opening Settings moves any legacy public copy automatically.
  Functions read `adminSecrets` first (`withPrivateStripeKeys`, `readAdminSecret`), then legacy settings, then
  Functions secrets. Keys ever entered before this change were public — rotate them.

## Conventions & gotchas

- Path alias `@` → `src/` (see `vite.config.ts`).
- `package.json` `pnpm.overrides` pins `@grpc/grpc-js` ≥1.14.6 and `protobufjs` ≥7.6.5: every `firebase` release (to 13.0)
  still asks for `@grpc/grpc-js ~1.9`, which has a high advisory. Only Firestore's Node build loads it, never the browser.
  Keep the override until `@firebase/firestore` moves on. Functions run on firebase-admin 14, which has no
  `admin.firestore()` / `admin.auth()` namespace API: `functions/adminSdk.js` rebuilds that shape from the modular
  entry points (index.js, inventoryLinkStore.js and the restore/migration scripts get `admin` through it; the handler
  tests' fakes pass through unchanged). CI's "Cloud Functions load like the deploy" step requires `functions/index.js`
  on every PR, so a package update that breaks loading fails before merge instead of in Deploy Firebase.
- `@types/react` is 19 while React is 18.3: React 18 renders `inert` only from `""` (see `inertWhen` in `StudioEditor.tsx`).
- `figma:asset/...` imports resolve to `src/assets/` via a custom Vite plugin;
  `ImageWithFallback` in `components/figma/` handles broken images.
- The site lives at the root of its Firebase Hosting address, but builds can still use a sub-path (`SITE_BASE`) — be
  careful with absolute paths/links; prefer router-relative navigation and `import.meta.env.BASE_URL`.
- Money/checkout logic is security-sensitive: never trust client-computed totals
  for the authoritative charge — the Stripe session/webhook path is the source
  of truth.
- shadcn/ui components in `src/app/components/ui/` are generated primitives;
  prefer composing them over hand-rolling new UI.
- Tests live next to source as `*.test.ts` (e.g. `features/site/*.test.ts`).

## Your job after every change
After completing any code enhancement, end your turn with a short "Next moves" list: 5 genuinely high-value suggestions for improving the app, ranked best-first.
Each suggestion is one or two lines:
- **What** — a concrete, specific action (e.g. "Debounce the catalog search box" instead of "improve performance").
- **Why** — the payoff (e.g. a sale not lost, a faster screen, a bug avoided).
- **Effort** — quick / medium / larger.

Then offer to do the top one right away.

### What makes a suggestion good here
- Tied to what just changed. First ask yourself: did this edit open an edge case, risk a lost or wrong save, or leave an obvious next step? Lead with that.
- High-leverage, not generic. Skip boilerplate best-practice filler.
- Specific. Name the file, function, or screen.
- Honest. If nothing is genuinely worth doing, say "nothing pressing" and stop.
- No repeats. Don't re-pitch anything already declined this session.

### Constraints every suggestion must respect
> [!IMPORTANT]
> - **Stack:** React 18 + TypeScript + Vite single-page app; no new frameworks or servers.
> - **Serverless Backend:** Firebase (Firestore, Auth, Storage, Cloud Functions) and static hosting on Firebase Hosting (GitHub Pages only forwards the old address). No server or secret keys in client code.
> - **Shopper safety:** never weaken checkout, payment, inventory or webhook authority.

### Angles worth scanning each time
Bug / edge case the change introduced · the next logical feature · draft/publish & save robustness · Firestore data integrity · the speed of a slow screen · keeping catalog and ledger consistent.

## Pull Requests
- When asked for "a new pull request", "new PR", or similar: **create it immediately** from the current branch.
- Do NOT investigate merge status, git history, or ask clarifying questions.
- Action: Push branch with `git push -u origin <branch>` then create PR via GitHub MCP.
- Use a descriptive PR title based on the feature/fix being implemented.
- **After a PR is merged, start the next change on a brand-new branch and open a new PR** — never push commits onto a merged branch to revive it.
- **Merge your own PRs automatically (owner's standing instruction, 12 October 2026).** Open the PR ready for review (not
  draft), wait for its checks (`test`, `studio-browser`, `studio-controls`, `release-note`) to finish, and merge it yourself (merge commit,
  pinned to the head SHA) once every check is green and GitHub reports no merge conflict. Never merge with a red, pending
  or missing check; fix the failure first (bring `main` in, re-run the tests) and push. Merging to `main` deploys the live
  shop. GitHub's own "Allow auto-merge" is off in the repository settings, so the agent does the merge.

## General Principles
- Prefer action over investigation when intent is clear.
- If the user asks for something, assume they know what they want.
- Only ask clarifying questions if the request is genuinely ambiguous.

Live carrier choices show up to five distinct Canada Post methods, cheapest first, using the lowest quote for each service. Server quote selection sorts prices before resolving duplicate service names.

## Studio organization

Studio organization milestone: Page layout, Theme settings, Text & labels, Navigation and Pages
use readable navigation with page context. Theme settings and text browse by category; search spans
categories and Find anything/click-to-edit opens the owning category. The page outline searches
section and nested-block content, expands matching sections, numbers original positions and offers
Expand/Collapse all and explicit Move up/down actions. Section reorder is disabled while searching to preserve the complete stack.
The toolbar keeps page/device, undo/redo, draft state, Save draft and Publish visible; Theme actions
holds preview, history, checks and guarded discard. Inspector device context distinguishes shared
content from responsive layout overrides. Existing draft/publish persistence is unchanged.

**Friendlier settings homes (October 2026).** `studio/settingsMap.ts` (pure, tested) decides *where* controls
appear; it never adds or removes one. Theme settings opens with a **Where is it on the shop?** map (`SHOP_MAP`, jumps to a heading),
then three bands (`THEME_HEADINGS` `band`): **Parts of your shop, top to bottom** (Top of every page · Shop & book pages ·
Bag, checkout & accounts · Custom pages & features · Bottom of every page · Pop-ups & notices — the order a shopper meets
them), **Whole-site look** (presets, colours, typography, buttons, layout, motion, Riso, design scales, small print) and
**Advanced** (folded **Fine-tune one element at a time** + Custom code). Category titles are plain shop words (Book cards in
the shop grid, Book page · buy box & details…); `settingsMap.test.ts` rejects jargon in them. Part cards have **Show on page**
(`CATEGORY_PAGES` names the preview page or pop-over; Studio opens it and selects the part from the structure scan). Each category card has a one-line description (`GROUP_BLURBS`)
and a **● N changed** badge. **Theme presets & saved themes** and **Payment icons** are categories now
(`EXTRA_STYLE_CATEGORIES`; click-to-edit `style:paymentIcons` opens it). Big categories split into short collapsible
sub-sections (`STYLE_SUBSECTIONS`; unlisted keys fall into **More settings**, so a new control always shows);
Find anything opens the sub-section holding the field (`fieldFocus`). Fields that differ from the default
design show **Changed from default** + **Reset to default**, and **What I've changed** lists them all.
Text & labels uses the same home (`TEXT_HEADINGS`, `TEXT_BLURBS`, "Text I've changed"); long groups (Checkout,
Order tracking, Customer account, Product page, Cart) open as short sub-sections (`TEXT_SUBSECTIONS`, regex by key,
leftovers in **More words**; a new key always shows). Find anything indexes region fields once (desktop entry,
tagged tablet/phone) instead of per device. Page layout shows
**Add section**, **Auto-fit page for phones** and a **Section tools** menu (copy / paste / save for reuse);
saved sections are picked from Add section › **Your saved sections**. A dismissible **How Studio works** card
(Theme actions › Show Studio tips) orients first-time use. `settingsMap.test.ts` fails if any Style category,
text group or field stops being reachable — place new STYLE_GROUPS / COPY_SCHEMA groups under a heading.

## Public storefront readiness repairs (2 October 2026)

Public product links retain unique slugs and use immutable book IDs when slugs collide; catalog records are never rewritten. The storefront reads the entire paginated catalog and the sitemap uses the same route resolver. Unknown URLs show editable recovery content. Custom pages share the support/policy footer, with **Show page footer** in Studio > Style > Custom pages.

Phone navigation (`MobileStorefrontNav`, shared by the homepage and standalone page/product header) defaults to a sideways-scrolling row of tabs (`mobileNavStyle: "tabs"`, size `mobileNavTabSize`); a category with sub-categories is a `NavDropdown` tab like the desktop header. Studio > Style > Header & announcement bar > **Phone navigation style** switches to the keyboard-accessible disclosure menu (`"menu"`, label Text & labels > Header > **Mobile menu**). **Show phone navigation** controls visibility; existing header visibility controls apply inside both. Missing-page visibility controls live in Style > Custom pages; words remain in Text & labels > Custom pages & 404.

Checkout rejects placeholder/wrong-mode publishable keys and disables payment until an inline Stripe Element is ready. Teardown is idempotent and exception-safe. Admin payment readiness reports invalid keys. Server totals and webhook-only Stripe-paid-order/inventory authority are unchanged. A production payment is still unverified until the owner configures valid Stripe credentials and completes a sandbox order, webhook, refund, email and fulfillment walkthrough. Public placeholder content still needs owner review.


## Publisher fulfillment desk (2 October 2026)

Orders reads the full paginated catalog of orders and private `order-operations` records.
Queues: Needs attention, Ready to pack, Ready to ship, In transit, Completed, Unpaid and All orders; oldest first.
Address review, country/province diagnostics, customer-confirmed corrections, item packing checklists, holds,
parcel presets (browser-local), batch packing with individual results, combined pick lists and separate packing slips
prepare orders for explicit tracked dispatch. Labels never dispatch an order. Terminal/refunded orders cannot be prepared.
Payment remains webhook-controlled; the order detail no longer offers Mark as paid. New internal notes and operational
history live in admin-only `order-operations`, never the guest-readable order. Older public activity is not migrated.
Private document ID reads and collection listing need no composite indexes. Deploy Firestore rules before the frontend.
Deploy updated Functions with the frontend: label requests recheck preparation and claim money-spending purchases
transactionally; uncertain purchase failures stay locked for Shippo reconciliation to prevent duplicate charges.
Address correction is disabled after label purchase. Stripe totals, inventory and refund authority are unchanged.

## Fulfillment workspace UX repair (2 October 2026)

Order detail uses one sequential FulfillmentWorkbench: shipping address, books to pack, shipping/dispatch.
Only the current step exposes its primary action; completed address details expand in place. Parcel setup
and tracked dispatch use focused Riso dialogs; preset naming is collapsed. Holds and refunds are under
More order actions, with refund details and explicit final confirmation. Customer/payment summaries are
secondary; activity and internal notes are collapsed. Phones render order cards and a Work queue selector,
with Filter & sort in a dialog. Batch packing asks for confirmation and retains per-order outcomes.
The private operations, label purchase safeguards, payment authority and server data contracts are unchanged.

### Public designer coverage (2 October 2026)

Wishlist, Customer account and Order tracking have Studio canvases and section stacks. `features/site/storefrontRegions.ts` owns the public region manifest, responsive styling and click-to-edit hooks; its categories are generated in `studio/styleSchema.ts`. Attach `regionProps` in every supported renderer layout when adding optional public elements. Required commerce/consent regions support presentation controls without hide toggles. Merge page-only regions with root settings, preserve product overrides over catalog defaults, and keep phone overrides in `autoFitRegions`. `docs/THEME_EDITOR.md` records the page-by-page ownership and authenticated/live verification limits. Local validation reasons and public order statuses use Text & labels; provider diagnostics must not bypass editable recovery copy.

## Checkout carrier delivery estimates

Live checkout shipping quotes preserve Shippo `estimated_days` and `duration_terms` for each
customer address, parcel and service. Missing carrier timing has no invented 3-7 day fallback.
Checkout displays carrier transit estimates after dispatch rather than calculating an arrival
promise from the order date; carrier terms stay separate from numeric days. Labels for transit
and unavailable timing are editable in Studio > Text & labels > Checkout. Static profile estimates
retain their existing Studio-controlled presentation. Deploy the updated `getShippoRates` Function
with the frontend. Live carrier response verification is separate from fixture-based tests.


## Responsive public element editing (4 October 2026)

Studio > Theme settings groups built-in public elements in a searchable element browser,
including hidden elements and conditional states. Selecting one opens only that element's
controls for the active desktop/tablet/phone preview, with an Edit words shortcut. Spacing
on each side, margins, dimensions, borders, typography, colors, optional visibility and
supported image cropping/grid columns are editable at each size. Tablet inherits desktop;
phone inherits tablet. Per-field resets and Reset size styling remove overrides in one
undoable draft change; All pages / This page only retain unrelated region settings.
Auto-fit for phones includes side spacing and uses tablet values where provided.
Required purchase, consent and recovery controls have presentation controls without hide
switches. Responsive visibility preserves the element's original flex/grid display.
Newsletter heading/description/form/button/status, search input/close/result rows/covers,
and individual review titles/body/authors/dates/states have explicit click-to-edit regions.
Text & labels displays effective defaults, preserves intentionally blank copy, and offers
Reset to default. Inline text uses the same page-aware writer so stale page copy cannot
shadow the new value. Copy changes preserve unrelated labels on other pages.
Local fixture checks do not certify authenticated Firestore publishing or live commerce.

Preview canvases retain their selected viewport width (1200px desktop, 820px tablet,
390px phone) in a scrollable canvas, so narrow editor windows cannot activate the
wrong breakpoint while the owner edits a different device.

## Storefront bundle (9 October 2026)

The shopper entry bundle must stay free of Firebase Auth, the full Firestore SDK and `admin/api.ts`.
Storefront reads/writes use **Firestore Lite** (`lib/firestoreLite.ts` `liteDb` + functions from
`firebase/firestore/lite` — never mix its refs/snapshots with the full SDK) via `lib/publicApi.ts`
(books, settings, pages, shipping profiles, visits; `adminApi` re-exports these). Admin, Checkout and
Account keep the full SDK from `lib/firebase.ts`. Shopper code that needs the signed-in user calls
`restoredUser()` / `loadAuth()` from `lib/authSession.ts`, which loads Auth only when the browser may hold a
saved sign-in. Storefront animations use `m.*` from `motion/react` under the `LazyMotion` +
`MotionConfig reducedMotion="user"` wrapper in `App.tsx` (engine in `lib/motionFeatures.ts`, domAnimation:
no layout/drag); don't put CSS `transition-all`/`transition-transform` on an element motion animates.
The prerender blocks Lite's REST writes (`documents:commit`). Check with `npx vite build`: the `index-*.js`
entry was ~205 KB gzipped after this change.
**Firebase loads on first use (15 October 2026):** shopper code gets Firestore Lite through `lib/lite.ts`
(`const { doc, getDoc, liteDb } = await lite()`), never a static import from `firebase/firestore/lite`,
`lib/firestoreLite` or `lib/firebaseApp`; `functionFetch` loads App Check the same way and `authState` lives in
`lib/authState.ts`. That keeps Firebase + App Check (~50 KB gzip) out of the entry (`index-*.js` ~176 KB gzip);
`lib/shopperBundle.test.ts` fails on a static import in the shopper modules.

## Prerendered page hand-over (15 October 2026)

The landing page's server-rendered HTML stays on screen until the app can draw the same page with data
(`lib/prerenderedPage.ts`): `main.tsx` keeps `#root`'s HTML and starts `preloadSiteData()`; App's Suspense fallback
(`PageLoading`) re-shows that HTML instead of `BootSplash`; `MainSite`/`BookDetail`/`PageView` are wrapped in
`whenPrerenderedReady` (their code resolves once the shop data is in, max 5 s) and `useSiteData` starts from that read
(`preloadedSiteData`). Pages mounted during the hand-over skip their entrance animation (`arrivedPrerendered`: MainSite
cards, `SectionReveal`); the first navigation ends it. Never in the Studio preview or a share preview. The snapshot
(`captureDocument`) loads Google Fonts as preload+onload (deduped) and shows SkeletonImage photos (`data-fm-fade`,
`data-fm-skeleton` removed). The first shop cards load eagerly (`priority`, first two `fetchpriority="high"`).

## Storefront loading performance (4 October 2026)

Storefront components share one catalog/settings/published-pages bootstrap request, including
in-flight loads and route remounts. Successful display data is reused for 30 seconds; the next
mount after that refreshes it. Failed requests remain retryable and session-cached content
stays visible during refresh. The session cache is read only when a hook mounts, rather than
on every render. Studio snapshots still override backend data. Authoritative checkout prices,
stock validation and webhook payment handling are unchanged.


## Stripe checkout payment section (4 October 2026)

Checkout inserts `features/site/StripePaymentSection.tsx` with Stripe's actual
Payment Element fields inside the page. The method radio label is separate from
those interactive fields. Payment requires a valid mode-matched publishable key
and an Element-ready event. Missing/invalid keys block payment; they never route
to hosted Checkout. Legacy `stripeRedirect` design values are ignored and the
redirect control is removed from Studio. Failed/stalled loading offers an inline
Reload payment form action before a payment attempt; the form stays on checkout.
Studio > Style > Checkout · Stripe payment section owns responsive panel,
selector, card badges and recovery layout; required payment/recovery controls
cannot be hidden. Text & labels > Checkout owns all labels, badge text and retry
copy. Existing form background, padding, radius and fonts continue to apply.
Server totals and webhook-only Stripe-paid-order/inventory authority are unchanged.
Checkout submission locks synchronously before asynchronous field validation,
disables payment-method switches while processing, and retains the lock during
provider navigation. Failed validation/service calls release it for correction.
Actual field display can be verified without submitting a payment; authenticated
sandbox payment, webhook, refund and email verification remain separate.

Stripe field appearance follows Studio checkout field background, text, border, font, accent and corner-radius controls inside the secure iframe. Riso defaults use square, visibly outlined idle fields with accent focus outlines and danger outlines for invalid fields; payment tabs share the same border treatment.


## Book SEO pane (5 October 2026)

Catalog > Edit book > Search (SEO) owns `metaTitle`, `metaDescription` and optional
HTTPS `seoImage`, saved with the book through the existing admin-only write path.
A custom search title is used exactly; blank fields use catalog content and the
published Studio Site & sharing defaults. The pane previews the effective title,
plain-text description, collision-safe canonical URL and sharing image, and offers
content checks, catalog-default reset and a deployed-URL Rich Results Test link.
Checks are guidance, not a ranking score. Catalog copy and URLs are never bulk rewritten.

`lib/bookSeo.ts` supplies book metadata and Product + Book JSON-LD. The public
PDP uses its displayed currency, price and selected-edition availability, including
backorders. No reviews/ratings are fabricated. `lib/seo.ts` updates canonical and
social URLs on router navigation, strips query/fragment parameters, clears stale
sharing images, and marks previews and private account/checkout/tracking pages noindex.
`index.html` has no fixed homepage canonical that conflicts with product routes.

`build:sitemap` lists published book/page routes, escapes URLs and removes personal
pages. Book/page fetch failures fail the build instead of silently dropping their
URLs; the optional legacy collections endpoint may be unavailable and is reported.
Robots paths follow the deployment sub-path; Google reads robots.txt at the origin
root, so a project-folder robots.txt alone is not an origin-wide crawl restriction.
Private pages also use noindex metadata. Rebuild/deploy the sitemap when catalog
routes change. No new Firestore collection, rule, index or Function is required.

Verification covers focused SEO regression tests, the complete Vitest suite,
production build with public catalog reads, and local desktop/phone fixture checks
for preview/edit/save/reset and rendered PDP metadata. Fixture save evidence is not
live Firestore persistence. Google rankings/indexing and a live Rich Results Test
remain external verification. Firebase Hosting answers prerendered product routes directly with 200 and unknown
URLs with a real 404 (the old GitHub Pages SPA 404 redirect is gone). After deployment submit the sitemap and inspect
URLs in Search Console.

## Discount codes: start date and one-use-per-customer (6 October 2026)

Discounts › New/Edit has an optional **Start date** (code is refused server-side until that day; a **Scheduled**
tab lists them). **One use per customer** is now enforced by `assertDiscountNotUsedByCustomer` in
`functions/index.js` (paid orders with the same code + email; checkout lower-cases `customer.email`
on the order). Both checks run in `fetchValidDiscount` / both checkout paths; totals and webhook authority are unchanged.

## Customer bug sweep (6 October 2026)

- **Prices:** USD/EUR shoppers see the CAD price × today's rate everywhere (`CurrencyContext`), which is what the
  server charges. Stored `usdPrice`/`eurPrice` are reference-only (Books › edit › Pricing says so). `catalogUnitPrice`
  in `CartContext.tsx` mirrors the server's unit-price rule. A sale price counts only when it is above 0, and a variant
  with no price can't be added. One-click adds (wishlist, bag suggestion, "Add both") pick an in-stock edition via
  `features/site/buyable.ts`.
- **Checkout shipping:** until the shopper picks a rate, the best current quote stays selected, including after the
  address changes the quotes. With no option selected, the summary shows Text & labels › Checkout › `coShipChoose`
  instead of "Free". The IP country lookup only fills a form nobody has touched yet. BOGO "% off" uses `bogoPercent`
  (client `checkoutFulfillment.ts`, server `functions/localFulfillment.js`): missing means 100.
- **Abandoned carts:** `firestore.rules` limits browser writes to the cart fields and blocks `notified*`, and a
  recovered cart can't be reopened. `abandonedCartSweep` rebuilds items and prices from `books`, escapes the text,
  skips carts older than 7 days and sends one reminder per address ever (`abandoned-cart-throttle`, no TTL on those records,
  server-only), plus a shop-wide cap of 25 reminders per Toronto day (`abandoned-cart-throttle/_daily`,
  `nextDailyCount`); the email uses only a plain first name from the cart (`reminderFirstName`, else "there"). Deploy rules and functions together.
- Order tracking accepts `#`/spaces in order numbers (`features/site/orderNumber.ts`).

## Bug sweep #2 (6 October 2026)

- **Payment integrity:** checkout accepts only CAD/USD/EUR (`functions/paymentGuards.js`). Stripe and PayPal store
  `expectedAmountMinor`/`expectedCurrency` when the payment is created, and the webhook/capture marks an order paid
  only on an exact match. A mismatch sets `paymentMismatch` and the order shows in Orders › Needs attention.
- **Stock** changes go through `functions/inventory.js` (`readBooks`/`writeStock`), one write per book, so two
  editions in one order both count. Oversells set `oversold: true`.
- **Buyable books:** the server refuses draft, archived and future-dated books, and bare lines for books sold in
  editions (`purchaseProblem`). The storefront shows only `isLiveBook` books (`features/site/liveBook.ts`, also used by
  the sitemap) outside a real Studio preview. Order item names come from the catalog.
- **Emails:** `compileEmailTemplate` HTML-escapes every value except `items_table`. Manual-payment instructions come from
  settings, not the order.
- **Checkout:** tax uses `features/site/taxRate.ts` (same matching as the server). E-book-only carts ask only
  country/province. A server-refused discount is removed with its reason (`coDiscountRejected`). PayPal has its own
  option (`coPaypalOption`). A failed PayPal capture returns to checkout. Discount dates follow the Toronto calendar day.
- **Consent:** `lib/consent.ts` `consentAllows()`. Declined analytics stops funnel/visit/referral tracking and custom code.
  Declined marketing stops abandoned-cart capture.
- Section links typed as `/path` get the site sub-path (`siteHref`). Category nav memoises on content. Untracked
  inventory never shows SOLD OUT.

## Crawlable public HTML

**Richer book listings (8 October 2026):** Book JSON-LD adds `bookFormat`, `numberOfPages`, `datePublished`, `bookEdition` (selected edition wins) and `gtin13` (only a check-digit-valid ISBN-13, `isbn13`) — blank fields are omitted. Fallback meta descriptions end on a word (`snippet`); custom ones stay exact. `useSEO` sets `max-image-preview:large` on indexable pages, drops empty `og:image`/`twitter:image` (card falls back to `summary`), adds `og:image:alt`, optional `product:price:*`/`product:availability` (PDP passes `product`), and removes index.html's no-JS fallback `#seo-jsonld-static`. PDP photos use each photo's Media alt text, falling back to Text & labels `bookPhotoAlt`.

**Creators and share image (12 October 2026):** the editor's "Author / contributors" box is `book.subtitle`; `bookCreators` (`lib/bookSeo.ts`) reads it (else legacy `authorName`), splits lists and drops group credits ("Various artists", "AA.VV.", "A x B"). Book JSON-LD `author` lists those Persons (a legacy `authorName` still wins), `autoBookSeo` uses them, and a book with no `metaTitle` gets `defaultBookTitle` — Text & labels › Site & sharing › `seoBookTitleByline` ("{title} by {author}") while that is ≤ 50 characters, else the plain title (BookDetail and the Search (SEO) pane preview agree). Home/collection `useSEO` images are `design.shareImageUrl`, else the first published book's cover — never `settings.assets.profileUrl` (the default settings' 100px stock photo). PDP thumbnail `<img>`s carry the same `bookPhotoAlt` fallback as the main photo (their buttons keep their aria-label).

**Artist links (18 October 2026):** Books › edit › Search (SEO) › **Artist links** saves `book.creatorLinks` (`[{ name, url }]`, public,
http(s) only, ≤10, cleaned by `creatorLinks` in `lib/bookSeo.ts`). `creatorPeople` gives each credited creator (`bookCreators`, else
`authorName`) `url`/`sameAs` from links with the same name (case-insensitive); links naming nobody in the credit become `contributor`.
The Details tab lists them as followed links (Style › Book page · photos & layout › `showPdpArtistLinks`, label Text & labels ›
Product page › `specArtistLinks`). `seoChecks` adds `creator` (listing names the artist) and `creatorLink` for books with a named creator.

**Google indexing + feed artists (18 October 2026):** Books › More catalog actions › **Google indexing** (`admin/GoogleIndexDialog.tsx`,
pure `admin/googleIndex.ts`) sends the home page and every sitemap-eligible book URL (≤30) to `searchConsole` `op: "inspect"` (URL
Inspection API, same metadata token; URLs must sit inside the property, `inSite`) and links each to Google's `inspectionResultLink`
(Request indexing exists only in Search Console's own UI). The Merchant feed titles add "by <artists>" and `g:product_detail` Author rows
(`creatorNames` in `merchantFeed.mjs`, kept equal to `bookCreators` by `merchantFeed.test.ts`).

**Press profile + llms.txt (18 October 2026):** `bookStructuredData` takes `shopUrl`: the offer's seller, and a `publisher` that
names the shop (`namesShop`), become the home page's `#organization` @id (`shopRef`); other publishers stay plain names. The home
BookStore adds `email`, a town-only `address` (never the street) and `sameAs` = Style social links + Text & labels › Site & sharing ›
`seoProfiles` (`profileLinks`, https only). `scripts/llmsTxt.mjs` (written by `generate-sitemap.mjs`, checked by `hosting-smoke.mjs`)
publishes `/llms.txt`: shop summary, live indexable books with artist/format/pages/language/ISBN (no prices), published pages, policies.

**Rich results (October 2026):** pages emit one JSON-LD `@graph` — home BookStore+WebSite, book Product/Book + breadcrumb + star rating from approved reviews only (`reviewsApi.listApproved`, shared with the reviews section), collection CollectionPage/ItemList, page breadcrumbs (`lib/bookSeo.ts`, `docs/SEO_CRAWLABILITY.md`). The sitemap lists book photos as `image:image`.

Production builds render the public sitemap into real HTML route documents via
`scripts/prerender-storefront.mjs` (see `docs/SEO_CRAWLABILITY.md`). Home, book,
custom-page and collection routes use the actual published storefront DOM;
account, wishlist, checkout, tracking and admin routes are excluded. Chromium is
installed by the storefront workflow. Snapshots update on deployment; rerun Deploy storefront
after publishing catalog or Studio changes. Browser storage and settings objects
are never serialized; render-time Firestore writes/analytics are blocked. Payment
and inventory authority remain live and unchanged. Install Chromium locally with
`pnpm exec playwright install chromium` before `npm run build`.

Public SEO/catalog pagination uses document IDs so records without `createdAt` are included consistently with the sitemap. Admin sorting is unchanged. HTML builds decline analytics/marketing consent and require completed custom-page content.

## Paid-but-unpaid recovery + Riso order tracking (6 October 2026)

- `markStripeOrderPaid` (functions/index.js) applies Stripe paid-order mutations only when called by
  `stripeWebhook` after signature verification (stock, discount usage, downloads, analytics and amount checks,
  idempotently). Status requests require an authorized customer/admin identity or the order's private access key;
  they retrieve that order's saved Stripe payment and record `reconciliationPending` when provider evidence
  indicates payment. The 15-minute `unpaidPaymentSweep` records the same evidence and alerts the owner.
  Neither path marks a Stripe order paid or changes stock, discount usage or revenue. Review webhook health
  and resend the signed Stripe event before fulfillment. PayPal, manual/offline and free-order paths remain available.
- Order tracking (`features/site/OrderTracking.tsx`) is a Riso order slip (`features/site/trackingStyle.ts`,
  `fm-track-*`, token-only). An unpaid Stripe order re-checks automatically and offers **Check payment again**
  (Text & labels › Order tracking › `trackRecheck`, `trackRechecking`, `trackStillUnpaid`).

## Stripe ↔ shop payment sync hardening (6 October 2026)

- `functions/stripeRecovery.js` (pure, tested): `modesToTry` looks up an order's payment in the Stripe account it
  was created in (`order.stripeMode`) and then the other one — sandbox orders used to be checked with the live key
  and silently stayed unpaid. `retrieveOrderPayment` in `index.js` is used by the status check and the sweep.
- `stripeWebhook` verifies against the Functions secret **and** endpoint secrets saved in admin-only
  `adminSecrets/stripeWebhook` (`live`/`test`), and settles any `payment_intent.succeeded` carrying
  `metadata.order_id` (either checkout path). It records `adminSecrets/stripeWebhookStatus` (last event / last signature failure).
- `unpaidPaymentSweep` runs every 15 minutes (orders 10 min–7 days old), records pending Stripe reconciliation
  and alerts the owner; only a verified webhook settles the order.
- Settings › Payments › Stripe › **Webhook health** (`admin/StripeWebhookHealth.tsx`, action `webhookHealth`) checks the
  endpoint, **Fix webhook** adds missing events / re-enables / creates it, **Reset webhook signing** recreates it when
  signatures fail. Opening an unpaid Stripe order in Orders asks Stripe automatically; **Check payment with Stripe**
  repeats the evidence check without marking it paid.

**Admin alerts:** `admin/adminAlerts.ts` (pure, tested) turns the orders feed + `adminSecrets/stripeWebhookStatus`
into banners shown above every admin page (`AdminAlerts.tsx`, rendered in `Dashboard.tsx`, refreshed with the
Orders badge every 5 minutes): payment/amount mismatch, unpaid after a started Stripe payment (>10 min), disputes,
rejected webhooks, oversold, paid orders waiting >3 days to ship, manual payments pending >2 days. Test orders are
ignored. Dismiss hides one for the browser session until a new order joins it.

## Collection indexing (7 October 2026)

Collection pages with no published, released books receive `noindex, follow` and are
omitted from the sitemap. Empty visible Studio categories remain in the prerender
route list so their initial HTML carries the same instruction. Search, sort and stock
filters do not change indexing; sold-out books still count. Renamed category URLs
canonicalize to current names. `categoryMembership.mjs` shares alias, parent and
PUBLICATIONS membership between navigation and sitemap generation. Published and
activated scheduled Studio designs remain authoritative; draft categories stay private.

## Automatic SEO refresh and catalog search controls

The storefront workflow checks published Firestore catalog/pages/settings every 15 minutes,
compares the published-content SHA-256 marker, and rebuilds only on a change. Draft-only
Studio edits do not trigger refreshes; scheduled release visibility does. Push/manual
builds always run. Only successful deployments advance the public digest marker.
Studio visible categories (including visible children) own collection sitemap URLs and
collection SEO copy. Books > Search (SEO) exposes `seoNoindex`: excluded books remain
available to shoppers, receive noindex HTML, and are omitted from the sitemap.
Studio > Text & labels > Site & sharing owns the public Google Search Console verification
token. Google property verification/submission still requires the owner's Search Console access.

**Refund/dispute sync (7 October 2026):** `syncStripeReversal` in `functions/index.js` is the one place a Stripe
refund or dispute changes an order (full refund → refunded/cancelled, stock back, revenue reversed, once; partial
refund → `partiallyRefunded` + `refundedAmountMinor`, stays paid; dispute → `disputeStatus`). It is fed by the
`charge.refunded` / `charge.dispute.*` webhooks **and** by direct Stripe reads (`checkStripeReversal`): the status
action for paid orders (admin order open / **Sync with Stripe**) and `unpaidPaymentSweep`, which re-reads paid Stripe
orders (≤120 days) at most every 6 h (`ordersDueReversalCheck`, `stripeCheckedAt`).
**Cheaper sweep bookkeeping (15 October 2026):** the sweep's check times live in one server-only record,
`systemStatus/stripeReversalChecks` (`{ v, orders: { id: [paidMs, checkedMs, triedMs] }, scannedFrom, reconciledAt }`,
`functions/reversalSchedule.js`, pure with injected I/O), not on the orders: sweep checks pass `onChecked` and never write
the order (which woke `onOrderUpdated`/`onOrderInventoryPush`); the admin status check still stamps `stripeCheckedAt`
(its 60 s throttle), and an order's own stamp counts as a check. Each sweep scans (`paidOrderScanner`, `SCAN_FIELDS` only,
`PAID_STATUSES`) the orders paid since the last sweep minus 30 min; every 6 h, or with no/old record, after a short scan
filled its 500 page, or when `systemStatus/stripeReversalRecheck.at` is not older than the last re-read, it re-reads all paid
orders of 120 days (newest first, ≤5,000) and drops orders that left. `revertFailedRefund` writes that request
(`requestReversalRecheck`, straight after its transaction, before the revenue write: a retried webhook can't ask again), because a reverted refund is paid again with its old `paidAt`, which the short scan can't see.
Due orders (40 + 10 spare) are read whole with `getAll` (never with no ids); orders the admin just synced free their slots for
the next due ones (up to 3 rounds, `MAX_DUE_READS` 150). `onChecked` runs only after the sync applied, an unanswered order is
retried each sweep after the simply-due ones, the record (a copy) is saved by `stopBy` even if Stripe hangs, no check starts
after it, and a failed save stamps the checked orders instead. A record that can't be read skips that sweep's checks; a
backlog beyond 40 due is logged. Timing is unchanged (first sweep after payment, then every 6 h; 40 per sweep). The record's
`orders` map is exempt from indexing (`firestore.indexes.json`); `scripts/restore-json-backup.mjs` deletes the record after
restoring orders so they are re-checked at once.

## Payments & shipping panel repair (7 October 2026)

- **Sandbox payments** (`session.livemode === false` / `stripeMode: "test"`, PayPal `paypalMode: "test"`) mark the
  order `isTest: true, sandboxPayment: true` and never touch stock, discount usage or revenue — on payment or refund
  (`functions/sandboxPayment.test.js`). `onOrderUpdated` still emails sandbox orders so the rehearsal covers email.
- **Stripe keys:** `SecretField` passes every edit up (clearing cancels), refuses wrong-slot keys
  (`stripeSecretKeyProblem`), and offers **Remove stored key** (`adminApi.removeStripeSecretKey`). Saves return
  true/false (`Dashboard.saveSection`), and saved secrets are scrubbed from screen state (`scrubSavedSecrets`).
  The "secret in public settings" blocker only fires on a real leak (`publicSecretLeak`). Test mode without a test
  secret key blocks; live without a stored key warns.
- **Test connection** (action `verifyStripeKeys`) and **Webhook health** (`webhookHealth`, verdicts in
  `admin/stripeChecks.ts`): per-mode delivery status, signing-secret presence (`STRIPE_WEBHOOK_SECRET` is declared
  on `createStripeCheckoutSession`), processing failures, signature failures recorded only for real Stripe-signed
  requests, reset clears old failures and asks first. Checkout refuses a payment whose server `stripeMode` differs
  from the card form's publishable key.
- **Shipping:** zones store ISO codes (`toCountryCodes`); both engines match names too. `functions/shippingGeo.js` is
  generated from `shippingZones.ts` COUNTRIES (`shippingGeo.parity.test.ts`). Profile rules persist. Quote ids are
  unique per option. A zone-less profile offers nothing once any profile has zones. Live rates resolve countries
  with `resolveCountry` and fall back to profile rates when Shippo has none; `SHIPPO_API_TOKEN` is declared on both
  checkout functions. Product assignment sends explicit removals; the panel reads the whole catalog (`getAllBooks`).

**Order emails (7 October 2026):** one order = one customer email ("Order confirmed", `order_confirmation`, on paid)
and one shop email (`[NEW ORDER] <id> · paid …`, `new_order_admin`, on paid, `[TEST]` prefix for sandbox) with a
**Fulfil this order** button to `/admin#orders/<id>`. `onOrderCreated` emails the shop only for manual-payment
(`pending`) orders. Card payments send no Stripe receipt (`receipt_email` removed); Stripe's own "successful payments"
customer email must also be off in the Stripe dashboard. `functions/orderEmails.test.js` pins this.

**Orders desk = Ship station (18 October 2026, design A):** Admin › Orders always opens on **All orders** › Open, newest first, as covers (owner's choice; the layout/tab are no longer remembered), and a `#orders/<id>` link opens the **Ship station** (`admin/OrdersDesk.tsx`,
pure rules in `shipStation.ts` + `ordersDesk.ts`, tested): a header (To ship · Labels today on the Toronto day from
`operations.labelBoughtAt` · Oldest, **Print pick list** for orders still to pack, **All orders · completed**), the numbered queue
(`stationQueue` = the old Needs me: problems, packing, then labels, oldest first in each; `stationStep` pill) with **Not in this
queue** links (pre-orders, e-Transfer/cash waiting, on the way) and the full `OrderDetail` on the right — so Stripe sync, refunds,
disputes, labels and dispatch are unchanged — with the oldest order opened automatically and finishing an order moving to the next
(`goToNext`). The workbench shows a three-step strip (`fw-strip`) and step 3 draws `admin/LabelBuyer.tsx` inline (saved parcels as chips,
size/weight, **Find label rates**, the rates with the customer's service pre-selected, **Buy label · $x**, **Ship without a label**);
changing the parcel forgets the rates, the purchase is still `buyCanadaPostLabel` and never dispatches or emails. **All orders**
(`orders-desk-layout` = `grid`) is a covers grid with **Open** (anything not yet with the customer + manual payments due), **Completed**
(delivered/collected/digital, never cancelled or refunded) and **All orders** (archived and abandoned too) via `gridTabOf`, search,
sort, 40 per page; a card opens the order in the station. **Table** / **Export orders** open the previous `Orders` table (bulk
packing, pick lists, CSV). `OrderDetail` reports reloads via `onChanged` so the list refreshes. Refunded cards are tinted red
(`refundState`); covers come from `rowCover` (catalog read once via `loadOrderBooks`). Phones show queue *or* order. Email links
`/admin#orders/<id>` still open that order.
The packing checklist shows each book's current cover and **Shelf location** (Books › edit › Inventory, `shelfLocation`,
per edition when set; `packingInfo` in `fulfillment.ts`). Shelf codes live in the admin-only private book document (see *Round-2 security*), merged back by `adminApi.getAllBooks` / `getBook`.

## reCAPTCHA / App Check

Invisible reCAPTCHA Enterprise initializes before Firestore/Auth in src/lib/firebaseApp.ts.
Use functionFetch from src/app/lib/functionsBase.ts for every browser HTTP Function
request and onBrowserRequest in functions/index.js for its server handler. Keep signed
provider webhooks and emailed digital-download links outside browser attestation.
APP_CHECK_MODE defaults to monitor; enforce only after registering the public site key,
verifying traffic, and completing the rollout in docs/RECAPTCHA.md. Direct Firestore
protection requires separate Firebase App Check console enforcement. Verification
failure copy lives in Studio > Text & labels > Site & sharing. Tokens, debug credentials
and provider diagnostics must never be logged or saved to public settings.

**Maximum discount cap (7 October 2026):** Discounts › New/Edit › **Maximum discount (CA$)** (`maxDiscountAmount`, blank = no cap)
limits what one code can take off an order ("20% off, up to $15"). The server enforces it in `computeDiscountAmount`
(`capDiscountAmount`, `functions/index.js`); `Checkout.tsx` mirrors it for display only. Shown as a **Max … off** badge in the list.

## Bug sweep #3 — ready for sales (7 October 2026)

- **Refunds:** `applyOrderRefund` (functions/index.js) is the one place an order becomes refunded — admin refunds
  (Stripe, PayPal captures API, or manual via `refundProviderOf`), Stripe Dashboard refunds, lost disputes and PayPal
  `PAYMENT.CAPTURE.REFUNDED/REVERSED` webhooks. Stock (admin's `refundRequest.restock`), discount use and revenue are
  reversed once; `refund_pending` completes later via the reversal sweep.
  The refund window's **Restock items** starts ticked unless the books left the shop (`defaultRestockOnRefund` ↔ server
  `leftTheShop`, `functions/refundRestock.js`, parity-tested). A refund that left printed books out shows Order detail ›
  **Books not back in stock** › **Put the books back in stock** (`createStripeCheckoutSession` `action: "restockRefunded"`,
  `restockRefundedOrder`): once, the same stock change and `restockedItems` record a restocking refund writes, so the inventory
  app link turns that order's gratuity into a void sale.
- **Payments:** PayPal request ids include amount+currency; a late `async_payment_failed` can't undo a paid order;
  a second Stripe payment is kept in `duplicatePayments` and alerted (Orders shows "Paid twice"); a card retry
  cancels the order's previous unfinished PaymentIntent; hosted sessions save `stripeCheckoutSessionId` at creation.
- **Orders from browsers:** `firestore.rules` lets guests create only unpaid Stripe/PayPal/Free orders with a fixed
  key list. Every manual-payment order is priced and created by `createManualLocalOrder`. $0 orders use
  `action: "completeFreeOrder"` (server completes only when its own total is 0; `completeOrderWithoutCard`).
- **Checkout:** the bag is repriced against the live catalog (`repriceCart`), Pay waits for the catalog, server
  refusals and card declines are shown, the server total is compared before charging, 99 copies max per line,
  email format checked on both sides. Policy links sit under Pay (Style › `hideCheckoutPolicyLinks`).
- **Email:** customer emails use the paid currency (`functions/emailMoney.js`); manual orders get
  `order_pending_payment`; footers add Settings › General › Location; abandoned-cart reminders honour their switch
  and a signed unsubscribe (`functions/marketingOptOut.js`, `marketing-optout`, `/track?unsubscribe=1`).
- **Other:** ebook downloads need the digital edition; Shippo webhook re-reads status from Shippo; policy pages are in
  the sitemap/prerender; Orders CSV has tax/payment/currency/refund columns (paid/refunded only for whole lists).
- **Not changed on purpose:** rate-limit IP source (verify the real X-Forwarded-For shape first), sales-tax model
  (shipping tax / printed-book rebate need the owner's accountant).

## Email abuse budget and proof of owner (10 October 2026)

- **One shop-wide budget:** `claimEmailSend` / `claimEmailSendDetailed` (`functions/emailThrottle.js`) take one send from a
  per-address counter (where the purpose has one) **and** from `contact-email-throttle/_global_hour` + `_global_day`
  (`GLOBAL_EMAIL_BUDGET`: 40/hour, 150/day) in one transaction. Every anonymous-triggered email must claim it:
  contact owner notice + visitor reply, privacy-request notice (also once per address per day; the record is still kept),
  cancel/return request notice, abandoned-cart reminder and back-in-stock alert. Past the budget the message waits in
  Messages / the request stays recorded; nothing is mailed. A new anonymous email path needs a `CONTACT_LIMITS` purpose.
- **No proof of owner needed (14 October 2026, owner's choice):** abandoned-cart reminders go to any address typed at checkout
  (with marketing consent), bounded by one reminder per address ever, the 25/day cap and the shop-wide budget.
  `functions/emailProof.js` (`hasOwnershipProof`) is no longer called by the sweep. Back-in-stock alerts need no proof
  either, but each send takes from the shop-wide budget; over it the signup keeps `waiting`.
- **One recipient:** `sendEmail` refuses any `to` that is not a single plain address (`cleanRecipients`); the
  `contactMessages` rule matches the same shape. Abandoned-cart reminders are skipped, and Ready to sell shows a blocker
  (`mailing-address`), until Settings > General > Location has a postal address. `sendEmail` falls back to the Functions
  `RESEND_API_KEY` itself and `stripeWebhook` declares it. Tests: `functions/emailAbuse.test.js`.

## Anonymous-abuse hardening (9 October 2026)

- **Contact form isn't a relay:** `onContactMessage` sends the visitor's "Message received" copy at most once per
  address per 24 h and never echoes their subject/message (name only, escaped; old templates' `{{subject}}`/`{{message}}`
  render blank). The shop notification is capped at 5 per sender per hour (the rest stay in Messages). Counters:
  server-only `contact-email-throttle/{purpose}_<sha256(email)>` (`functions/emailThrottle.js`).
- **Welcome email:** `onCustomerCreated` sends only when `admin.auth().getUser(uid)` has that same email, verified.
  `customers/{uid}` rules allow only `uid,email,name,phone,defaultAddress`, bounded, with `email` = the token email.
- **Stock-hold caps** (`functions/stockHolds.js` `HOLD_LIMITS`): a checkout start (`reserveCheckout`, manual path) may
  not push one shopper past 10 copies of a held book, 50 held units or 3 open unpaid checkouts (email hash), or one
  connection past 20 / 100 / 10 (IP hash, `clientIpOf`). Counted in server-only `stock-hold-owners/{e_|ip_<hash>}`;
  a shopper's own retry replaces the earlier attempt; payment-time renewals are never capped. Refusal =
  `HoldLimitError` (code `hold_limit`) → Text & labels › Checkout › `coHoldLimit`.
- **Rules:** public `pages` reads need `status == "published"` (`publicStorefrontData.mjs` uses a runQuery filter);
  `analytics/{YYYY-MM-DD}` writes only for that day (±1 day) with `date` = id; `reviewContacts` only in the same batch
  as their new pending review; guest orders bound `customer`, `metadata`, `referralSource`, `addressError` sizes
  (per-line quantity stays the server's 1–99 clamp: rules can't loop). Check rules changes with
  `scripts/firestore-rules-emulator.mjs` (header says how). Deploy rules + Functions with the frontend.

## Bug sweep #4 (7 October 2026)

- **Reviews:** public reads only `status == "approved"`; reviewer emails live in admin-only `reviewContacts/{reviewId}`
  (`reviewsApi.create` writes both; `contactsFor` moves older public emails once per admin session).
- **Signups:** `stockAlerts` ids are `<email>__<bookId>__<variantId>` and `newsletter` ids are the email (both enforced
  in `firestore.rules`), so repeats are refused. `onBookRestocked` sends once per address, skips draft/archived books,
  reclaims sends stuck >15 min and deletes the alert after sending.
- **Emails:** refund amount in the currency refunded (`refundAmountText`); no "won't be charged" email for paid orders;
  shipped email without tracking drops those lines (`withoutTrackingLines`), none for pickup/local delivery.
- **Storefront:** search/wishlist use `isLiveBook`; Canadian time zones start in CAD (`currencyForTimeZone`).
- Signed-in order reads need `email_verified`. Analytics visits can't decrease.

## Readiness fixes from the 5-agent audit (7 October 2026)

- **Payments:** `markOrderPaid` refuses card/PayPal and cancelled orders (`manualPaidRefusal`); checkout refuses cancelled
  orders (`checkoutRefusal`); a payment arriving for a cancelled order is recorded but **not** marked paid
  (`paymentMismatch.paidAfterCancel`, Orders › Needs attention). PaymentIntents use `stripeIntentKey` and hosted sessions a
  per-minute idempotency key, so a double click can't open two live payments. "Paid" is set by the Stripe webhook, the
  server-verified status check / sweep (`markStripeOrderPaid`), the verified PayPal capture, or `completeOrderWithoutCard`
  for manual/$0 orders — never by the browser.
- **Stock holds:** `functions/stockHolds.js` transactionally holds tracked stock for 30 min per order (server-only `stock-holds/{bookId}`)
  before Stripe, PayPal, manual-payment, or free checkout can settle; payment revalidates/renews the hold. Reservation-store failures fail closed;
  expected stock conflicts after a provider capture stay unpaid and raise an inventory-reconciliation alert. Holds release on payment or cancel and expire automatically.
- **Tax gaps:** Overview › Ready to sell lists provinces/states with no matching rate (`uncoveredTaxRegions`).
- **Tax switch (14 October 2026):** Settings › Taxes › **Collect sales tax at checkout** saves `settings.taxes.collect` (missing = on).
  `false` = no tax on any order: server `authoritativeTax` returns 0 (`taxCollectionOn`, mirrored in `features/site/taxRate.ts`),
  checkout uses `activeTaxRates`, readiness skips the tax checks. Rates stay saved. Deploy Functions with the frontend.
- **Customer requests:** order tracking has *Ask to cancel* only, until the order ships (no shopper return requests since
  13 October 2026; `ORDER_REQUEST_TYPES` = cancel; open returns still show) (`action: "orderRequest"`, `order.customerRequest`,
  Needs attention + Order detail › Mark request handled) and *Your data* (`action: "privacyRequest"` →
  admin-only `privacyRequests`; Settings › General › **Privacy requests** exports JSON or erases, keeping orders).
  Words: Text & labels › Order tracking (`trackReq*`, `trackPrivacy*`); boxes: Style regions `trackingRequests`/`trackingPrivacy`.
- **Rate limits:** `clientIpOf` takes the right-most non-proxy `X-Forwarded-For` hop (Google appends the real client);
  Shippo rate/address and PayPal create/capture have their own buckets. Deploy rules + functions before the frontend.

## Commerce access, navigation and merchandising (7 October 2026)

Stripe paid-order authority belongs only to the signature-verified webhook. Authenticated or private-key
payment status checks and the payment sweep record pending reconciliation; provider success alone does not
release an unpaid Stripe order for fulfillment. PayPal capture, manual/offline payment and server-validated
free orders remain supported through their existing contracts. Guest order access requires the private order
key; an order number or payment ID alone is not authorization.

Studio > Navigation > Header bar order chooses each published page's Main shopping bar or Publisher navigation
row (`secondaryNavKeys`). Initially, exact Submissions, History, Our history and Open call(s) page titles use the
publisher row; an explicit selection, including an empty list, overrides that grouping. Categories remain in
shopping navigation. Style > Header layout > Show publisher navigation row controls visibility; Text & labels >
Header owns its accessible name. Both header layouts and standalone page/product headers share this hierarchy,
including phones, where search stays directly available under the existing search visibility control.

Books > Categories & tags > Curated recommendations offers automatic category matches or up to four chosen
books in editable display order, with full-catalog search and removal. Saving the book applies the choice; an
empty publisher selection hides recommendations. Public rendering excludes missing, current and unpublished
books without filling a curator's selection with automatic results. Studio's existing related-books visibility
and heading controls still apply. Product details show supplied edition, positive page count, publisher and
publication date; a selected variant's name takes precedence for edition. Show edition details and the four
spec labels live in Studio. Existing contributor display, genuine photo upload, cover order and alt-text fields
remain the content source; owner-supplied photographs and editorial facts are required, never fabricated.

Checkout adds a separate optional apartment/unit field, eligible Stripe express-wallet presentation and a total
beside payment. Studio > Checkout controls their optional visibility and Text & labels owns their words. Wallet
availability depends on Stripe, browser, account and domain eligibility; this change does not prove live wallet
activation. Required payment, validation and server-priced totals remain intact.

Readiness distinguishes payment configuration, contributor/edition metadata and possible test titles from
verified deployment, hosting and email delivery. Admin alerts cover pending payment reconciliation, unresolved
label purchases and recent failed/bounced/complained email attempts, with links to the relevant workspace.
Provider acceptance is distinct from inbox delivery. Local tests and builds do not verify deployment or live
Stripe/PayPal payments, wallet eligibility, webhook delivery, email, refunds or carrier purchases.


## Cart estimates, returns and catalog review (7 October 2026)

The cart offers country/postal-code shipping previews from current server catalog prices,
edition weights and configured shipping profiles. These are preliminary profile estimates;
live carrier prices and eligibility require the full checkout address. They exclude discounts
and tax, never authorize a charge and reset when the cart/destination changes. Session storage
carries the destination into checkout. Matching saved addresses may fill street details;
other saved/recovered destinations cannot overwrite or mix with the selected destination.
Studio > Style > Cart drawer > Total & checkout button owns Show shipping cost preview;
Text & labels > Cart owns its words. Inputs use the shared cart palette and typography.

Orders > Customer return progresses through approval/decline with customer-visible instructions,
parcel receipt, full-order inspection and an explicitly confirmed full-order refund. Mixed-condition
lines record a resellable quantity. Only eligible physical copies restock, once, through the existing
provider/admin-authorized refund path. Approval and receipt never change money or inventory.
Full-order refunds include shipping, tax and digital items; partial financial refunds remain a
separate provider workflow. Cash/e-Transfer refunds must be sent externally before recording them.
Private inspection/actor/history data live in admin-only order-operations.returnCase. A limited
returnProgress summary appears in secure customer tracking with Studio-owned status words and the
existing trackingRequests region controls. Open returns block dispatch/local fulfillment and label
purchases. Stripe paid-order authority remains webhook-only; supported PayPal/manual authority is
unchanged. New endpoints cartShippingPreview and manageReturn use functionFetch and App Check.

Books loads the full catalog. Show books needing publish review flags cover/interior images,
contributor credits, base/sale/edition prices, format/edition/page count, shipping weight, publisher
copy and possible placeholders. Single-book saves to Published and bulk Publish open a reviewed
selection; invalid title/prices block publishing, other warnings require explicit acknowledgement.
Bulk Move to draft previews the chosen records and preserves their content, inventory and order
history. Failed updates remain selected for retry. Publication status controls public routes,
lists, recommendations and sitemap: titles never automatically hide products. Owners must review
and draft currently published test/duplicate records before releasing this visibility change.

Deploy the Functions bundle with the frontend so cart estimates, return transitions and refund
completion agree (including Stripe/PayPal webhooks and reconciliation). Existing books/orders/
order-operations access patterns require no new rules or composite indexes; inspection remains
private. Local handler tests and provider-isolated browser fixtures prove workflow behavior,
not deployed functions, real payment/refund acceptance, carrier rates or email delivery.

## App release notes
Every PR must add one release-note file, `src/app/admin/updates/YYYY-MM-DD-NN-<id>.ts` (`export default { … } satisfies AppUpdate`; NN = the next number for that day, so the newest note of a day sorts first; `appUpdates.ts` collects the files with `import.meta.glob`, newest first, and `app-release-notes.yml` fails a PR that adds none). Never edit another PR's note file — separate files are why parallel PRs no longer conflict. A branch started before this change that still prepends to `appUpdates.ts` fails `appUpdates.test.ts` and conflicts with `main`: keep `main`'s `appUpdates.ts` (the collector) and run `node scripts/split-app-updates.mjs <your copy of the old file>` (or with no argument on the working tree) to move your note into its own file. Each note has a stable unique ID, date (YYYY-MM-DD), plain-language title and summary, and shortcuts to the affected admin screens (`tab`, optional `settingsTab`, using IDs from `riso/nav.ts`). Explain user-visible benefits honestly; do not claim a backend deployment or live provider verification from local checks. For maintenance-only PRs, say what reliability changed and link to its relevant workspace. Keep older entries for View all updates. The admin sidebar's What's new box shows the newest entry bundled with the deployed frontend; it is not a live GitHub feed.

Checkout country dropdowns pair option backgrounds and text with Studio's Checkout field colours, including Stripe's Windows dropdown; highlighted Stripe options use contrasting text on the checkout accent.
Stripe payment fields retain Studio colours when readable and choose contrasting black/white text for insufficient-contrast pairs; labels follow the surrounding checkout text.

Custom-page navigation resolves published bodies from useSiteData's shared snapshot, including Studio preview updates. Avoid separate slug fetches that clear the header/content on each link; cold custom-page loading retains the shared header.
Grouped footer navigation defaults to Explore and Participate & connect, with policies in a wrapping row above copyright. Studio > Style > Footer & social links selects grouped/classic layout and group/location/heading visibility; Text & labels > Footer owns headings. Menus > Footer menu can customize automatic links, assign groups, edit destinations/labels, reorder and hide links, preserving sub-links. Contact pages suppress the duplicate automatic email link. Preview click-to-edit and inline copy hooks remain available.
**Footer layout (12 October 2026):** `StoreFooter` puts every band in one padded column (dividers line up with the text), link groups on the right by default (Style › Footer & social links › **Where the link groups sit**), and a bottom-bar **Admin** link (`showFooterAdminLink`, words Text & labels › Footer › `footerAdmin`). Spacing/text/colour/divider controls (`footerPaddingY*`, `footerColumnGap`, `footerLinkGap`, `footerTextSize`, `footer*Color`, `showFooterDividers`) become CSS in `features/site/footerStyle.ts`; the bands are regions `footerBrand`/`footerLinks`/`footerLegal`/`footerBottom`/`footerAdmin` for per-device element styling.

## Bug sweep #5 (8 October 2026)

- **Cancelling:** Orders › **Cancel unpaid order** is server-side (`createStripeCheckoutSession` action `cancelOrder`,
  `cancelRefusal` in `functions/paymentGuards.js`): refused once paid, and it stops the Stripe PaymentIntent / Checkout
  session and releases stock holds. It asks Stripe first and refuses (recording `reconciliationPending`) when Stripe
  already has the money (`stripePaymentTaken`); the sweep keeps checking cancelled orders with a Stripe payment. PayPal capture and `completeFreeOrder` refuse cancelled orders; the PayPal capture
  request id includes the PayPal order id and a matching `paypalOrderId` is the proof (shoppers may return in a new tab).
- **Paid after cancelling / mismatched payments** clear once refunded: a full Stripe refund sets
  `paymentMismatch.resolvedAt`, or the admin presses **Mark refunded** on the order (action `resolvePaymentMismatch`).
  Queues, alerts and the Orders desk ignore resolved mismatches.
- **Disputes:** an open `disputeStatus` puts a paid, not-yet-sent order in Needs attention; dispatch, label purchase and
  local handover refuse it. Sent parcels stay In transit so delivery can still be recorded.
- Manual **Mark paid** after the 30-min hold no longer fails (`completeOrderWithoutCard(…, { reserve: false })`).
  Sweeps read bounded, ordered windows (new `orders` indexes); the "webhook missed" alert skips cancelled/mismatched orders.
- **Discounts** can't exceed the qualifying subtotal; tier percentages are 0–100 (admin refuses > 100%).
  An edition with an empty price can't be saved. Address correction can't change country/province on carrier orders.
- **Checkout:** a retry (card, PayPal, manual or free) releases the shopper's own previous unpaid attempt's hold
  (`previousOrderId`, `releaseSupersededAttempt`: unpaid, same email, and Stripe shows no payment in progress). Pickup choices stay picked. An address-checker outage continues as
  unverified (`addressError: "verification_unavailable"`, shown in the address step of the order). Tax shows its real
  amount (CA$0.00 too) once country and a recognised province are known; unrecognised saved provinces are cleared.
- **Bag free-shipping bar** follows Settings › Shipping (`features/site/freeShipThreshold.ts`): only a rule that makes
  every option free everywhere counts (profile `freeShippingOver` / `freeThreshold`, or `freeOver` on every rate); highest
  across profiles; hidden otherwise or for an e-book-only bag. The Studio
  "Free shipping over" number was removed — Studio keeps the on/off and look.
- Download buttons appear only for digital lines (`features/site/digitalLine.ts`). Review inputs carry the rules' length
  limits. A page missing from the cached site shows Loading until the fresh read (`useSiteData().fresh`), not a 404.
- **Deploy** Firestore indexes + Functions + frontend together. Owner decisions still open: should free-shipping codes
  cover express/live rates, a "change cookie choice" link, and the sales-tax model.
## Bug sweep #6 + shop filters (8 October 2026)

- **Shop filters:** `features/site/CatalogControls.tsx` adds Shopify-style **Format** chips (paperback, hardcover,
  e-book, audiobook, other — from the book's and every edition's format, `bookFormats`), **Price** Min/Max boxes
  (typed in the shopper's currency, `priceRangeFor`) and **Clear filters**. Chips show only when the current view has
  2+ formats and the price boxes only with 2+ prices (`filterView`); a hidden filter never applies (`appliedFilters`).
  "In stock" counts editions and backorders (`bookInStock`); search also matches ISBN. Each piece is a Studio region
  (`catalogFormat`, `catalogPrice`, `catalogClear` — show/hide + layout in Theme settings › Fine-tune single elements › Catalog & shared content · layout);
  words are Text & labels › Search & filters (`filterFormat*`, `filterPrice*`, `filterClear`). The bar itself still
  follows Style › Shop page heading & filters › **Show search, sort & in-stock bar**.
- **Display price:** `features/site/displayPrice.ts` — a book sold only in editions shows its cheapest edition
  (CurrencyContext `getBookPrice`, shop cards, search, showcase grid, filters/sort) instead of CA$ 0.00.
- **Server prices:** `functions/catalogPrice.js` `catalogUnitPrice` mirrors `CartContext.catalogUnitPrice` everywhere
  (a `"0"`/negative sale price is ignored; an edition with no price is refused, never charged $0).
- **Discounts:** `validateDiscountCode` returns `maxDiscountAmount` (checkout showed the uncapped amount);
  `functions/discountPayload.test.js` fails if checkout reads a field the server doesn't send. Every discount is clamped
  to 0…items value on both sides; percent tiers over 100 are refused in the editor. The card-retry key includes the code.
- **Stock holds:** holds carry `owner` (sha256 of the email, `holdOwner`); a shopper's own earlier attempt never blocks
  their retry, other shoppers are still held off.
- **Digital vs physical:** one rule (`isPhysicalItem` / admin `isDigitalItem`) in the cart estimate, returns, label guard
  and publish review — audiobooks/EPUBs/format-only e-books are never shipped, returned or weight-checked.
- **Returns:** a return request the shop hasn't approved can be refunded directly (only approved/received block refunds);
  the workbench offers **Close request without a return**; a closed request can't be reopened; a refund that never reached
  the provider clears its `refundRequest` claim; a lost dispute doesn't show the customer "refund complete"; refunding an
  undispatched order follows the admin's restock choice.
- **Storefront:** `lib/ScrollToTop.tsx` opens each newly clicked page at the top; account data is cleared on sign-out /
  user change (no address carry-over) and order rows/fields are keyboard + screen-reader accessible; product views count
  once; product **Back** goes home when the shopper landed directly; the quantity stepper counts copies already in the bag
  and `addToCart` returns false when nothing was added; Recently viewed updates between books; search overlay traps focus;
  footer icon links have labels (Text & labels › Footer); the grouped legal row hides with no policies; wishlist badges
  count only live books; the cart estimate guesses the country and hands its destination to checkout only after **Estimate**.
- Deploy Functions with this frontend. No Firestore rule or index changes.

## Bug sweep #7 (8 October 2026)

- **Stock on book save:** `adminApi.updateBook(id, form, loaded)` re-reads the book in a transaction and keeps the live
  `stockLevel` / edition stock for any count the owner didn't change (`admin/bookStockMerge.ts` `keepLiveStock`), so a
  sale made while the editor was open is never undone. **Discount edits** never write `usageCount`/`createdAt`
  (server-owned). Duplicate codes are refused in the editor (`validateDiscountDraft(…, otherCodes)`); the server trims
  codes and uses the usable copy when old duplicates exist (`fetchValidDiscount` / `discountProblem`).
- **Display price:** a book sold in editions shows its cheapest edition and never a SALE badge (`displayPrice`,
  `showsSale` in `features/site/displayPrice.ts`) — it's always charged an edition's price. Search/wishlist/sections use it.
- **Backorders:** `backorderable(book)` (CartContext, book-level `allowBackorder` like the server) — no stock cap in
  `addToCart` or the product page quantity. The bag drawer reprices saved lines once the live catalog loads (never in
  preview; lines that can't be bought are left for checkout's notice).
- **Release dates:** a plain `scheduleDate` opens at midnight Toronto (`releaseArrived` in `liveBook.ts`, mirrored in
  `functions/paymentGuards.js` and `scripts/publicStorefrontData.mjs`); admin discount "today" and Expires use the shop day.
- **PayPal:** partial refunds accumulate (`paypalRefundedTotalMinor`, `paypalRefundIds`) and a full total refunds the
  order; capture uses the order's own `paypalMode`. Order emails list download links for every non-physical line
  (`isPhysicalItem`); the shop's paid-order email escapes the address.
- **Admin:** bulk Feature (bulk bar ⋯ › Feature on the homepage) writes `isFeatured`; Approve/Reject selected acts only on visible reviews and the queue loads
  every pending review; Orders CSV includes partial refunds; Overview stock skips `trackInventory: false` books and the
  format mix uses each line's sold edition.
- **Account:** email-link sign-in survives blocked storage; order rows count copies.
- Deploy Functions with this frontend. No Firestore rule or index changes.

## Pre-orders (8 October 2026)

Books › edit › Inventory › **Pre-order** (`preorder: true`) sells a published book before its **Publication date**
(`publishDate`, YYYY-MM-DD, Toronto calendar; empty = "date to be announced"). On release day it becomes an ordinary
book by itself. One rule, `functions/preorder.js` ↔ `features/site/preorder.ts` (`preorder.parity.test.ts`). Stock,
prices, holds and payment authority are unchanged: pre-orders use the book's normal inventory settings (stock caps
pre-orders; backorders or untracked stock = unlimited). Both checkout item builders stamp each line with
`preorder`/`releaseDate` from the catalog (`preorderLine`, a browser flag never sticks). Paid orders with a physical
pre-order line wait in the **Awaiting release** queue (`queueOf`, Orders desk **Pre-orders** tab) until the latest
release date, or until **Ready to ship now** (`fulfillmentAction("release_preorder")` → public `order.preorderReleasedAt` +
`operations.preorderReleased`). Saving a book whose pre-order switch or date changed re-stamps the release date on its
paid, unsent pre-order lines (`restampPreorderItems`, `adminApi.syncPreorderOrders`; switched off = released today);
`dispatchProblem`, local handover and the server `labelProblem` refuse until then. The 3-day ship-late alert and the
daily digest start counting when the printed pre-orders were released (`preorderClockStart`). E-books bought as a
pre-order unlock on release (`downloadDigitalAsset` checks the line and the live book). Order emails get a Pre-order block (`preorderEmailLines`); the shop email subject says `[NEW PRE-ORDER]`.
Storefront: product page stock line + **Pre-order** button, shop-card badge, bag/checkout line notes, a checkout
summary notice (region `checkoutPreorder`), order-tracking note (region `trackingPreorder`), and `PreOrder` +
`availabilityStarts` JSON-LD. Studio: Style › Badges & shop labels › **Pre-order badge** (`showPreorderBadge`), Cart
drawer › **Pre-order note** (`cartDrawerShowPreorder`); words in Text & labels › Product page (`pdpPreorder*`,
`preorderButton`, `preorderBadge`), Cart (`cartPreorder*`), Checkout (`coPreorderNotice*`), Order tracking
(`trackPreorder*`). Mixed bags ship together on the latest release. Deploy Functions with the frontend.

## Gift cards, box sets, automatic discounts, add-ons and scheduled sales (9 October 2026)

All five are priced on the server by **`priceOrder`** (`functions/index.js`), the one price builder every checkout
path uses (card, PayPal, manual, free); `recalculateOrder` and the Stripe handler both call it. Pure rules live in
`functions/promotions.js` (sale windows, add-ons, box sets, gift-card products), `functions/discountMath.js`
(discount arithmetic, automatic choice, free gift) and `functions/giftCards.js` (codes, holds, debit/credit), mirrored
for display in `features/site/promotions.ts` / `discountMath.ts` (`*.parity.test.ts`). Handler tests:
`functions/promotionsCheckout.test.js`, `functions/giftCardSettlement.test.js`.

- **Scheduled sales:** `saleStartsAt` / `saleEndsAt` (plain Toronto dates, inclusive) bound `isOnSale`/`salePrice`
  (`saleActive`); `catalogUnitPrice` on both sides uses it, so badges and charges agree.
- **Paid add-ons:** book `addOns` (≤6: `{id,label,price,kind:"option"|"text",maxLength}`), priced per copy. Cart lines
  carry `addOns` and a line key (different inscriptions = different lines); the server re-prices from the catalog and
  saves `basePrice` + `addOns` (label, price, text) on the line. Never on gift cards or box sets.
- **Box sets:** a book with `bundleItems` (≤20 parts `{bookId,variantId,quantity}`) sells at its own price with no stock
  of its own. Order lines store `components`; `promotions.stockLines` expands them inside `stockChanges`,
  `readBooks` and `linesByBook`, so holds, sales, refunds and inspected returns (`returnRestockItems`) move the real
  books. Available sets = `bundleAvailable` (the storefront derives box-set stock the same way).
- **Automatic discounts:** `discounts` with `method: "automatic"`, `code: ""` and a shopper-facing `title`, loaded by
  `loadAutomaticDiscounts` and never redeemable by code. **One discount per order:** a code replaces automatic offers;
  otherwise the biggest saving wins and free shipping applies only when no money-off offer does
  (`pickAutomaticDiscount`). `type: "gift"` (free gift with purchase: `giftBookId`/`giftVariantId`) adds a
  `promoGift` line from the catalog whose price is the discount; browser-sent gift lines are always dropped. Saved as
  `appliedDiscount { id, code: null, automatic: true, title }`, counted like codes. Checkout reads offers via
  `validateDiscountCode` `{ action: "automaticDiscounts" }`.
- **Gift cards:** a book with `productType: "giftCard"` (editions = amounts) is digital, never discounted or taxed and
  can't be paid with another gift card. Paid lines issue one card per copy in `onOrderUpdated`
  (`issueGiftCardsForOrder`, once via `giftCardsIssuedAt`) and email it (template `gift_card`). Cards live in
  admin-read/server-write `giftCards/{sha256(code)}` with `balanceMinor` (CAD cents) and 30-minute `holds`.
  Checkout's code list goes on the order as `giftCards` (rules allow ≤5); `priceOrder` writes `giftCardAmount` +
  `giftCardRedemptions`, and **`total` is what the card/PayPal pays after gift cards**. Holds are taken with stock
  (`reserveCheckout`); the balance is debited only inside the paid transaction (`settleGiftCards`: Stripe webhook,
  verified PayPal capture, `completeOrderWithoutCard`), once (`giftCardsDebitedAt`); a short balance records
  `giftCardConflict` and leaves the order unpaid (Needs attention). A full refund credits it back once
  (`giftCardsRestoredAt`) and disables cards the order bought (`giftCardsVoidedAt`). Orders a gift card fully covers
  use the free path (`completeFreeOrder`); manual payments refuse gift cards; hosted Stripe sessions refuse them.
  Shopper balance check: `validateDiscountCode` `{ action: "giftCardBalance" }` (rate limited). Admin actions:
  `createStripeCheckoutSession` `{ action: "giftCardAdmin", op: issue|setEnabled|adjust|resend }` (`requireAdmin`).
  Deploy `firestore.rules` and Functions with the frontend.
- **Gift-card safety (follow-up):** the amounts a live payment was created for are saved as `chargedGiftCards` with
  `expectedAmountMinor`; settlement, refunds and releases use them (`chargedRedemptions`), so a later re-pricing can't
  change what is debited. Holds carry `owner` (`holdOwner`), so a shopper's own earlier attempt never blocks them.
  Test-mode cards (`isTest`) can't complete a no-card order. `giftCardConflict` clears on a full Stripe refund or
  Order detail › **Mark resolved** (`resolvePaymentMismatch`). `refundOrder` refuses a full refund once a gift card the
  order bought has been spent. Admin alert `gift-cards-not-issued` flags paid gift-card orders with no card after 10 min.
  A box set's pre-order state follows the latest pre-order book inside it (`combinedPreorder`).

## Coming soon books (12 October 2026)

Books › edit › Inventory › **Coming soon** (`comingSoon: true`) shows a published book that can't be bought yet. One rule,
`features/site/comingSoon.ts` `comingSoonActive` (server: `purchaseProblem` in `functions/paymentGuards.js` refuses it as
`unavailable`, so every checkout path refuses it). It wins over Pre-order (the editor switches the other off). `addToCart`
refuses it, `repriceCart` drops saved lines, `quickAddChoice` returns `{ inStock: false, comingSoon: true }`; it is never shown
as Sold out. Product page: stock line `pdpComingSoon` / `pdpComingSoonDate` (Publication date, `data-state="soon"`), the buy
button reads `comingSoonButton` and opens `BackInStockForm comingSoon` (`#pdp-coming-soon-signup`, same `stockAlerts` doc for
the whole book, variantId ""); no qty, Buy it now or sticky bar. Cards: `comingSoonBadge` (shop grid, wishlist, related);
section quick-add hides. Studio: Style › Badges › `showComingSoonBadge`, Product page › `showComingSoonSignup` (off = the button
is a disabled label). JSON-LD says OutOfStock. Turning the switch off fires `onBookRestocked` (`before.comingSoon === true`):
signups get an **Out now** email for editions with stock (`releasePending` carries the wording to `backInStockSweep`); while
it is on, no back-in-stock email is sent. Admin › Books has a Coming soon badge and status filter. Deploy Functions with the frontend.

## Payment-integrity audit fixes (9 October 2026)

- **Exact card amount:** `StripeCardForm` exposes `setAmount(minor, currency)` / `releaseAmount()`. Checkout pins the
  Elements amount to the server PaymentIntent's `amount`/`currency` before every `confirm` (a reused intent too); the
  screen-total effect can't overwrite it during the attempt, and a changed amount is re-submitted before confirming.
- **Reused intents age out:** the remembered card attempt (`features/site/cardAttempt.ts`, `reusableCardOrder`) keeps its
  PaymentIntent for 25 minutes (holds last 30); after that Pay asks the server again on the same order (re-price, renew
  holds, cancel the old intent). A non-card confirm error on a reused intent asks `action: "status"` and opens the
  success page when Stripe says complete/processing.
- **No paying twice:** `releaseSupersededAttempt` returns `{ paidOrderId }` when the shopper's own earlier attempt is paid,
  PayPal-captured, `reconciliationPending` or Stripe-taken (`previousAttemptPaid`, `paymentGuards.js`); card, hosted,
  PayPal, free and manual checkout then refuse with 409 `previous_attempt_paid` + `previousOrderId` before touching the
  new order. Checkout opens that order's confirmation (`?previous_paid=true`) with Text & labels › Checkout ›
  **Earlier attempt already paid** (`coPreviousPaid`). The success landing forgets the tab's attempt once it is bought.
  A `payment_in_progress` refusal is now decided before the order is re-priced, so it never rewrites gift cards.
- **Gift cards:** paid transactions read the cards in `chargedRedemptions(order)` (what the live payment was created for).
- **Failed refunds:** `charge.refund.updated` (in `REQUIRED_WEBHOOK_EVENTS`) with status failed/canceled, and the reversal
  sweep (refund_pending, `amount_refunded` 0, `failedRefundId`), call `revertFailedRefund`: back to paid (status from
  `preRefund`, saved by `applyOrderRefund`), restocked copies taken back, discount use and revenue re-counted, restored
  gift-card amounts re-debited, `refundRequest` cleared, timeline note — once. Run **Fix webhook** after deploying.
- **Totals:** `totalNeedsConfirming(server, shown, currency)` allows 5¢ in CAD and max(5¢, 1%) in USD/EUR. Customer
  emails' Total (`chargedTotalFmt`) and the Orders CSV `ChargedAmount` use `expectedAmountMinor`/`expectedCurrency` when set.

## Admin improvement pass (10 October 2026)

- **Inventory:** every stock edit goes through `inventoryApi.adjustStock` — a transaction over pure `planStockChange`
  (`inventoryInsights.ts`): −/+/receive/undo apply a delta to the live count; a typed count refuses if the live count moved
  unless confirmed. Writes only `stockLevel` / that edition's stock + an append-only admin `inventoryLog` row (reason).
  Rows are per edition; box sets, gift cards, digital and untracked are read-only. 0 → >0 warns how many `stockAlerts`
  will be emailed. Cost prices live in admin-only `inventoryCosts/{bookId}` (never on public books). Low-stock line:
  `lowStockThreshold(settings)` (`settings/website.inventory.lowStockThreshold`, default 5). The old-shop stock copy was
  removed; Inventory › **Inventory app link** replaced it. "Can it run out" rules for Overview: `admin/stockRules.ts`
  (tracked only when `trackInventory === true`).
- **Orders:** desk refreshes only while visible and merges `onChanged(order)` (fired only on real changes) instead of
  reloading; J/K, `/`, Esc. One search matcher `admin/orderSearch.ts`. Deletion only for unpaid/cancelled/test orders
  (`deleteRefusal`, mirrored in the `orders` delete rule). `reconciliationPending` shows "Paid in Stripe — awaiting webhook".
  Manual orders: More order actions › Payment received — mark paid (`canMarkManualPaid` → server `markOrderPaid`).
  **Partial refunds:** `refundOrder` takes `amountMinor` + `restockLines` (`functions/partialRefund.js`); the order stays paid
  with `partiallyRefunded`/`refundedAmountMinor`, restocks only ticked lines/inspected copies; a later full refund refunds the
  rest without double restock. Partial refunds email the customer (from main's order-email fixes); not yet: rollback of a bank-failed partial refund.
  Partial returns allowed (`functions/returns.js`). Resend confirmation stamps `confirmationEmailRequestedAt`; `emailLog`
  rows carry `orderId` and Order detail lists them. Parcel presets in `settings/parcelPresets`.
- **Books:** list rules in `admin/catalogList.ts`, editor rules in `admin/bookEditorState.ts` (`editorDirty` ignores
  recalculated fields, `needsPublishReview` only on becoming published/new issues, ISBN lookup Open Library → Google Books
  fills empty fields only, weights stored "N unit"). `BookEditor` `onSave({ stayOpen })`. Import leaves stock unchanged unless
  "Set stock to the file's numbers". `bulkPricing.planPriceChange` skips gift cards / sales not below the new price.
- **Shell/Overview/Customers:** read-only order screens share `admin/ordersCache.ts` (call `invalidateOrders()` after
  changes). Nav badges: `adminApi.getAdminBadgeCounts()`. Heavy admin pages are `React.lazy`. `?debug=true` is dev-only.
  Customers: LTV net of refunds, "VIP · lapsed", marketing consent = `newsletter` minus `marketing-optout`, private notes/tags
  in admin-only `customerNotes/{sha256(email)}`. Overview › Download sales report (`salesReport.ts`).
- **Messages:** replies via `sendTestEmail` `action: "replyToMessage"` (`functions/messageReply.js`), stored in
  `contactMessages.replies`, status `replied`; paged 100 at a time with server counts.
- **Discounts/Gift cards/Reviews:** category discounts follow storefront membership (`functions/discountCategories.js` ↔
  `features/site/discountCategories.ts`, parity-tested). `/?discount=CODE` share links (`features/site/sharedDiscount.ts`,
  from `main.tsx`) pre-fill checkout; server stays authoritative. Summaries `admin/discountDescribe.ts`. Gift-card expiry:
  `giftCardAdmin` `op: "setExpiry"`. Reviews: admin-set `verified` and `featured` (Studio-editable badge/label); deleting a
  review deletes its `reviewContacts`. Review-request email `functions/reviewRequests.js` inside `unpaidPaymentSweep`
  (`review_request.enabled` default off — the editor treats missing as off — and `delayDays` default 14).
- **Settings:** `admin/settingsDirty.ts` guards leaving unsaved settings (+ beforeunload). Maintenance
  (`maintenance.enabled`) closes checkout server-side in `priceOrder` (`store_closed` → Text & labels › Checkout ›
  `coStoreClosed`); General › Store status sets it and the construction wall. Shippo origin from General › Location
  (`functions/shopSettings.js`). `nightlyFirestoreBackup` → admin-only `systemStatus/backup`. Taxes in the menu
  (`TaxesSettings.tsx`, shape unchanged). Shop alerts (Notifications › Shop alerts) = `shopAlerts.newOrder` / `.shipped` / `.dailyOrderDigest` (older `new_order_admin.enabled` is the newOrder fallback).
  `{{items_table}}` placement via mirrored `placeItemsTable`. `adminSecrets/*.migratedFromPublic` gates "rotate key" warnings.
- **Deploy** Firestore rules + indexes + Functions with this frontend. A second admin email was not added (owner must name it).

## Round-2 payment fixes (10 October 2026)

- **Manual orders** (`createManualLocalOrder`) pass `addOns` / `giftCardDetails` through to `priceOrder` and hold the
  *priced* lines (`trusted.items`: box-set parts, free gift), like the card/PayPal paths.
- **Failed refunds:** `revertFailedRefund` also undoes a Stripe `refunded` order (refund id match, or the caller read the
  charge as unrefunded: `chargeUnrefunded`); the 15-minute sweep re-reads Stripe refunds ≤45 days old. A reverted order has
  `refund.status: "failed"` → Orders **Needs attention** (`refundFailed`), an admin alert (`refund-failed`) and an email
  (`onOrderUpdated`). A retry uses `refundRetrySuffix` in the Stripe/PayPal idempotency key. `applyOrderRefund` without an
  explicit/saved restock choice does not restock dispatched orders. The `status` action on a paid order calls `checkStripeReversal`.
- **Discount claims:** `functions/discountClaims.js` — one-use / usage-limit checks (`assertDiscountNotUsedByCustomer`) match the
  mailbox (`emailIdentity`: `+tag`, Gmail dots) and count paid, manual `pending` and live (≤35 min) card/PayPal orders.
- **Duplicate-order guard:** `previous_attempt_paid` only when the new order's lines equal the paid one (`sameOrderLines`,
  server `paymentGuards.js` / client `features/site/orderLines.ts`). `createPayPalOrder` also returns `amount`/`currency`
  and checkout confirms a changed total. Shop-facing totals use `orderChargedTotal` (`expectedAmountMinor` is a public order field).
- **Shipping:** live carrier selection can't be satisfied by a profile rate while live rates exist; a carrier outage says
  "temporarily unavailable". Box-set weight = parts at their edition weights (`bundleWeightGrams` client, `priceOrder` /
  `getShippoRates` / `cartShippingPreview` server). The bag's free-shipping bar counts printed books only (`shippableBagTotal`).
- Gift-card `adjust` history stores the applied change (`requestedMinor` kept when clamped). `createPayPalOrder` binds `STRIPE_SECRET_KEY`.

## Orders, returns and Shippo labels (round 2, PR 8, 10 October 2026)

- **Returns:** `returnTransition` accepts `closed` from approved/received/inspected (ReturnWorkbench › *Close return without a refund*); the request becomes `handled`, nothing is refunded or restocked, `returnProgress.state` is `closed` (customer words `trackReturn_closed`).
- **Shipped means shipped:** a bought label puts `trackingNumber` on the order while the parcel is still in the shop, so `orderRequestProblem`, `dispatched()` (returns), the refund restock default and the shopper's request options use `fulfillmentStatus`/`status` only, never `trackingNumber`.
- **Label purchase (`createShippingLabel`):** `callShippo` has a 15 s timeout (45 s for the purchase) and sets `error.shippoStatus`. HTTP 4xx (except 408) is a definite refusal (`shippoDefiniteRefusal`): the lock is released with a history entry; 5xx/timeouts/network keep it. Every purchase is linked to a Shippo Order (`linkedShippoOrder`: reused while `order-operations.shippoOrderAddress` matches, else created; best-effort, and a 4xx on the linked purchase retries once unlinked) because unlinked API labels can't be refunded from Shippo's dashboard. `buyRate` saves `shippoTransactionId` (+ status/rate) in `order-operations` BEFORE the order write; `recordLabel` writes the order and releases the lock in one transaction; transactions and shipments carry `metadata: "Order <id>"`. A test key (`shippo_test_`) may rehearse a purchase: the label is stored with `order-operations.labelTest: true` and the workbench shows a TEST label badge. `mode: "voidLabel"` (admin) refunds the label with Shippo (`refunds/`) or, with `confirmedElsewhere`, just drops it; the old label goes to `order-operations.labelHistory`. Rules in `functions/labelVoid.js` ↔ `admin/labelRefunds.ts` (`labelVoid.parity.test.ts`): a label is voidable until the parcel is handed over (`labelHandedOver`: `shippedAt`, a sent fulfillment status or `completed`), so a cancelled/refunded order's unused label can be refunded (workbench **Unused label › Void label for a refund**). The server finds a label with no saved transaction id by tracking number (last 90 days), reads the transaction first (never refunds twice, refuses a tracking mismatch or an earlier rejection), then records `order-operations.labelRefunds` + `labelRefundOpen`; `checkLabelRefunds` (inside `unpaidPaymentSweep`, hourly per row) follows each refund to refunded/rejected, and `adminAlerts` shows rejected or 30-day-pending refunds. After dispatch, `edit_tracking` with `replaceLabel: true` records a replacement carrier/number.
- **Customs:** parcels whose destination country differs from the shop's origin get Shippo customs items + a declaration (`functions/customs.js`, per physical line; value = what was paid in CAD, discount shared out). Per-book answers `customsDescription`, `hsTariffNumber`, `customsOriginCountry` (Books › edit › Details; blank = Printed books / 4901.99 / shipping-from country; `admin/customsFields.ts`).
- **Label rates:** `labelRatesFor` offers the cheapest quote of the service checkout sold (`order.shippingMethod`, any carrier) first, then Canada Post; `isPurchasableRate` is the purchase check.
- **Shippo key:** `saveShippoConfig` requires a `shippo_live_`/`shippo_test_` prefix and a successful Shippo call (401/403 = not saved); stores `mode`/`verifiedAt`; Settings › Shipping › Carrier & labels shows LIVE/TEST.
- **Tracking never moves back:** `advancesTracking` (fulfillmentGuard.js); the Shippo webhook updates inside a transaction and emails only when it advanced.
- **Paid-order trigger:** `onOrderUpdated` sends its emails first; `checkAddressAfterPayment` (the Shippo address check) runs afterwards in a `finally`.
- **Address rules:** `functions/addressRules.js` ↔ `features/site/addressRules.ts` (`addressRules.parity.test.ts`): street, city, country always; province/state only for CA/US; postal code unless the country has none (same no-postcode list as the checkout form). Used by `validateAddress`, `autoApproveShippingAddress`, label purchase and `addressIssues`.
- **Orders list:** `ordersTable.ts` is the one filter behind the table rows and tab counts. Orders can be **archived** (`archivedAt`, `adminApi.archiveOrders`): they leave the work queues/badge but stay in *All orders*. Delete is also refused (client `deleteRefusal` + `firestore.rules`) for unpaid orders with a started card/PayPal payment unless cancelled. The desk's *Shipped* tab excludes terminal (cancelled/refunded/refund-pending) orders. The ship-late alert counts printed orders only.
- Deploy `firestore.rules` + Functions with the frontend.

## Privacy and newsletter (10 October 2026)

- **Owner decision (closed, don't re-raise in audits):** analytics/marketing tracking keeps its default of running before the
  cookie banner is answered. Do not change the consent defaults in `lib/consent.ts`.
- **Privacy export/erase** (`functions/privacyData.js`, `personalDataFor` / `handlePrivacyAdmin`): addresses match in any
  capitalisation (exact lower-case query plus a bounded field-only scan for older mixed-case rows); browser writes of contact
  messages, review contacts and saved carts now lower-case the email. Export and erase also cover `giftCards` (purchaser/recipient;
  erase blanks names, emails, message but keeps the balance), `emailLog` (`to` may list several recipients), and admin-only
  `order-operations` for the person's orders. Erase blanks the customer block of never-paid orders (`neverPaid`), deletes their
  order-operations, blanks private notes on kept paid orders, and takes `reviewAction` (`anonymize` | `unpublish` | `remove-text`,
  Settings › General › Privacy requests › *When deleting, their reviews*). `emailLog` rows are pruned after 90 days in `runEmailOutbox`.
- **Newsletter double opt-in** (`functions/newsletter.js`, actions `newsletterSignup` / `newsletterConfirm` on
  `createStripeCheckoutSession`): signup stores `newsletter/<email>` as `status: "pending"` with `consentText`, `requestedAt`, and mails
  a signed confirm link (`purposeToken`, budget `claimEmailSend("newsletterConfirm")`); the link sets `status: "confirmed"`. Browsers
  can no longer write `newsletter` (`firestore.rules`). Older rows with no `status` count as subscribed. `action: "unsubscribe"`
  (the shared signed link, `/track?unsubscribe=1`) now also deletes the newsletter row. Pending rows older than 30 days are pruned.
  Anything that mails or counts subscribers must skip `status === "pending"` (`mayMail`). The confirmation email text is fixed in code
  (not an editable template) so its consent wording can't be edited away; storefront words are Text & labels › Newsletter / Order tracking.
- **Email-link sign-in** (`features/site/emailLinkSignIn.ts`): a failed attempt forgets the saved address and keeps the "confirm your email" card.

## Round-2 security: private book fields, public endpoints, rules (10 October 2026)

- **`books` is public for published books only.** `firestore.rules`: `allow read: if isAdmin() || resource.data.status == "published"`.
  A shopper list query must say so: `publicApi.getStorefrontBooks` filters `where("status", "==", "published")`, and
  `scripts/publicStorefrontData.mjs` (sitemap, prerender, the 15-minute change check) uses a `runQuery` with the same filter
  (`readPublishedBooks`). `publicApi.getBook` returns `null` for a book the rules refuse (draft/archived). Account and Order
  tracking therefore treat an unreadable book as `UNREADABLE_BOOK` (`digitalLine.ts`) and let the server decide on a download.
  A book with no `status` is unreadable to the public: `scripts/migrate-book-private-fields.mjs` stamps `published` on those
  (the storefront already treated a missing status as published). Scheduled/future-dated books are `published` with a
  `scheduleDate`, so they remain readable by the rule (the storefront hides them with `isLiveBook`) — the rule cannot compare dates.
- **Private book fields** (`costPrice`, `usdCostPrice`, `eurCostPrice`, `shelfLocation` and each edition's shelf code, `legacyInventoryKey`,
  `digitalFileUrl`/`digitalFilePath`) live in admin-only `books/{id}/private/admin` (`variantShelf: { editionId: code }` for editions).
  `admin/bookPrivate.ts` (pure) splits a book on every write and merges on every read; `adminApi` does it in `createBook`, `updateBook`
  (inside its transaction), `duplicateBook`, `deleteBook` and the legacy inventory sync, and `getAllBooks` / `getBook` merge the private
  documents back (one `collectionGroup("private")` read; `getAllBooks({ includePrivate: false })` skips it). Readers take the private
  value, else a leftover public one, so the admin works before and after the migration; a save moves the fields it touches. Rules:
  `match /private/{docId}` under `books` plus `match /{path=**}/private/{docId}` (admin read) for the collection-group read.
  Functions never read cost fields (no change needed). Add any new owner-only book field to `PRIVATE_BOOK_KEYS` in **both**
  `bookPrivate.ts` and the migration script (`scripts/migrateBookPrivate.test.ts` keeps them equal). `digitalFileName` stays public
  (the shop uses it to show a Download button; the bucket path is `read: false`).
- **Deploy order for the books change:** (1) deploy the frontend/code that reads both locations (this PR's admin code does), (2) run
  `GOOGLE_APPLICATION_CREDENTIALS=… node scripts/migrate-book-private-fields.mjs` (dry run) then `--apply`, (3) only then deploy
  `firestore.rules`, indexes and Functions. Rules before the migration hide status-less books from shoppers.
- **Digital uploads** store the Storage path: `adminApi.uploadStoragePath` (no `getDownloadURL` on the read-denied `digital-assets/`
  folder); the editor saves `digitalFileName` (what `downloadDigitalAsset` opens) and `digitalFilePath`.
- **Public endpoint hygiene** (`functions/`): `setGlobalOptions({ maxInstances: 10 })`; `action: "status"` has its own rate limit
  (`LIMITS.status`) and only looks up payment ids saved on the order; `automaticDiscounts` has `LIMITS.autoDiscount` and a 30 s shared
  read; `getShippoRates` refuses more than 50 lines or non-plain ids; anonymous handlers answer upstream/database failures with a
  fixed sentence (`publicErrors.js` `publicErrorMessage`; admin endpoints keep detail); the checkout location signal uses
  `clientIpOf` and the platform's `X-AppEngine-Country` (`serverGeoCountry`) — no third-party IP lookup, and no signal when the
  platform sends none. Admin emails encode the order id in links.
- **TTL:** `rate-limits`, `contact-email-throttle`, `abandoned-cart-throttle`, `email-claims` and `payment-webhook-events` carry a top-level
  `expiresAt` (`retainFor()` / the limiters) and `firestore.indexes.json` `fieldOverrides` expire them. Deploy indexes to turn TTL on.
- **Rules:** analytics counters (`analyticsStepsOk`): visits >= 0, funnel/device maps are fixed-key and +1 per write, free-key maps
  change one entry per write and never lose one (values of free keys can't be bounded in rules). Guest orders: money fields are numbers
  in range, `customer` has only its five keys, `activity`/`appliedDiscount`/`fulfillmentSelection` are small, `testMode` is a bool (per-line
  content still can't be checked — `priceOrder` rebuilds lines). `scripts/firestore-rules-emulator.mjs` covers all of it.
- **Studio/storefront:** imported theme files drop `customHeadHtml`/`customFooterScripts` (`stripImportedCustomCode`; Studio says so);
  connected details are escaped inside HTML-drawing fields (`HTML_SETTING_KEYS`, a test fails when `SectionComponents` gains another
  `dangerouslySetInnerHTML` field); the newsletter box, review form and back-in-stock box write nothing in the Studio preview
  (`inEditorPreview()` inside `subscribeNewsletter`, `saveStockAlert`, `reviewsApi.create`); the book page's review count/average come
  from Firestore aggregation (`reviewsApi.summary`, also the JSON-LD `aggregateRating`) with a **Show more reviews** button
  (Text & labels › Reviews › `reviewsMore`; Style › Reviews · layout & elements › Show more reviews button); Admin › Reviews loads
  50 pending reviews at a time with a server-side total and fetches a reviewer's email only on **Show email** (`admin/reviewQueue.ts`;
  needs the `reviews (status, createdAt desc)` index). All CSV exports guard leading tab/CR as well as `= + - @`.

## Checkout experience + stock-hold tuning (10 October 2026)

- **Field errors:** `features/site/checkoutDetails.ts` `checkoutDetailProblems` is the one rule for what Pay needs (email, name,
  country, street, city; state only where `regionsFor(country)` lists them; postal code unless `postalCodeOptional`; e-book-only bags
  need only country + listed province). The page is a `<form noValidate>`; each problem shows under its box (`aria-invalid`,
  `aria-describedby`, words `coErrField*`) and focus moves to the first. The same problems keep Apple/Google Pay off (`expressWalletEnabled`).
  Keep CLAUDE.md's submission-lock rules: `createCheckoutSubmission().reset()` runs only from `onPageRestored` (browser Back from PayPal).
- **Retry key:** `cardAttemptKey` (`cardAttempt.ts`) includes the order note and address-check result; add any new order field the shopper can edit to it.
- **Live rates:** `getShippoRates` answers are dropped unless they belong to the newest request (`createLatestGuard`) and give up after
  `RATES_TIMEOUT_MS`, falling back to profile rates. Exchange rates: the scheduled `refreshExchangeRates` Function (every 3 h, `functions/exchangeRates.js`)
  saves CAD→USD/EUR from open.er-api.com in public `settings/exchangeRates` (`usd`, `eur`, `fetchedAt`, `providerUpdatedAt`, `lastError`).
  Checkout charges through `createRateReader` (5 min instance cache; saved copy while < 36 h old, else a live fetch, else the last
  saved copy, `FALLBACK_RATES` only if nothing was ever saved; rates outside `SANE_RANGE` are never saved or used). The storefront's
  `exchangeRates.ts` `loadRates` reads the same doc first (`publicApi.getExchangeRates`), then the feed, then the stale copy
  (5 s timeout, 1 h tab cache; `CurrencyProvider` re-checks every 15 min). `ratesSource` = live | cached | fallback on
  `useCurrency()` and `<html data-rates-source>`. Keep the client/server freshness windows and sane bounds equal.
- **No third-party IP lookup:** checkout starts on `guessCountryName()` (browser language); address suggestions (Photon) stay. Do not re-add an IP-to-country call in the browser.
- **Starting currency by country (12 October 2026):** `CurrencyContext` starts on the shopper's saved `fm_currency`, else the
  time-zone guess, then `features/site/visitorCurrency.ts` asks the shop's own `validateDiscountCode` `{ action: "visitorCountry" }`
  (platform header via `serverGeoCountry`, no database, no third party; cached in localStorage `fm_geo_country` a week, unknown a day)
  and `currencyForCountry` switches CAD/USD/EUR unless the shopper picked one. Skipped in the Studio preview; the prerender pins CAD.
  If Cloud Run sends no country header the time-zone guess stays. Charges are unchanged (CAD × today's rate).
- **Stock holds:** `settings/website.stockHolds` `{ perBook, units, orders }` (Settings › General › **Checkout stock holds**, defaults 10 / 50 / 3)
  is read by the server (`holdLimitsFrom`, `loadHoldLimits`); connection caps are twice / 3x those, never below today's. The bag warns before Pay
  (`holdLimits.ts` `holdWarnings`, region `checkoutHoldWarning`, words `coHoldWarning*`). A payment-time renewal keeps the order's `holders`
  so releasing frees the shopper's count; IPv6 clients are counted by /64 (`rateLimit.js` `ipKey`, also used by `hitLimit`).
- Server `validateAddress` still requires state and ZIP; for countries without them it answers 400 and the order is taken as `verification_unavailable`.

## Reports, analytics and performance (10 October 2026)

- **Days:** Overview periods, the chart, the sales report and the Orders CSV put each order on its **Toronto** day (`lib/shopDay.ts`
  `orderDay` / `shopDayKey`; `periodKeys`). Daily traffic stays on the **UTC** days `analytics/<date>` is keyed by
  (`trafficPeriodKeys`, `dailyWindow`) because `firestore.rules` fix those ids to today ±1 — a day's visitors can differ from its orders
  by the evening hours; don't change the write keying without the rules. The CSV keeps raw `Date`/`PaidAt` and adds `ShopDate`/`PaidShopDate`.
- **Shopper bundle:** `lib/analyticsKeys.ts` (`analyticsKey`, `deviceOf`, `cleanSearchTerm`) and `lib/shopDay.ts` are pure and shared; `lib/commerce.ts`
  must not import `admin/*` (`lib/shopperBundle.test.ts`). `/track` reads orders with `publicApi.getPublicOrder` (Lite SDK; `adminApi` re-exports it).
  The catalog is read `CATALOG_PAGE_SIZE` (300) books per request, published books only.
- **Sources:** an order's `referralSource` is normalised with `analyticsKey` so it joins the visit stored under the same key. Funnel `purchase` is counted once
  per real order (`funnelApi.trackPurchase`, never `isTest`/`sandboxPayment`) and `checkout_start` once per session; `publicApi.recordVisit` uses `trackingAllowed()`.
- **Overview figures:** "waiting to ship" (`toFulfil`) excludes Awaiting release and Ready for pickup and ages from payment/release; Where the money goes shows gift cards
  used/sold and a net without sales tax; automatic offers show `appliedDiscount.title`; reviews average/approved use server aggregates; the Overview loads `dailyDocsNeeded(days)` traffic docs.
- **Admin reads:** the Orders desk and nav badge refresh the newest 100 orders incrementally (`getRecentFulfillmentOrders`, `mergeNewestPage`) and fully every
  `FULL_REFRESH_MS` (10 min); an order page patches the shared copy (`patchCachedOrder`). Alert refresh failures show **Couldn't finish checking for problems → Try again**
  (`checkFailedAlert`); a failed/overdue nightly backup shows an alert (`backupAlert`, `systemStatus/backup`).
  The shell's alert/badge check runs every `ALERT_CHECK_MS` (5 min) only while the tab is visible (catches up on return), reuses an
  orders copy under `ALERT_ORDERS_MAX_AGE_MS` (`getOrdersCached({ maxAgeMs })`; the desk's refresh feeds it through `noteLoadedOrders`),
  and returning from an order re-counts from `peekOrders()` plus the last check's webhook/email-log/status reads. Discounts and Reviews
  read orders through `getOrdersCached()` too.
- **Storefront load errors:** `useSiteData` returns `loadError` + `retry`; product, custom pages and Home show Text & labels › Header › `catalogLoadError` / `catalogRetry`
  with a button, and a failed read is never `fresh` (so no "not found"/noindex).
- **Background jobs (`functions/sweepLimits.js`):** `runInBatches` runs work a few at a time and stops at a deadline. `onBookRestocked` (300 s) marks alerts `restockPending`
  and sends in batches; `backInStockSweep` (every 15 min, new) finishes leftovers while the book is still in stock. `unpaidPaymentSweep` alerts the owner before its slow checks.
  `dailyOrderDigest` reads the last 180 days (≤1500 orders) and `order-operations` only for open orders; `abandonedCartSweep` reads only the 7-day window (≤500) and
  `pruneOldCarts` deletes carts older than 30 days. `nightlyFirestoreBackup` deletes `backups/<day>/` folders older than 30 days (needs Storage delete on the bucket;
  a failure is recorded as `pruneError`). No new Firestore rules or indexes. Deploy Functions with the frontend.

## Overview analytics 2.0 + Google Analytics (13 October 2026)

- **Ranges:** `admin/overviewRange.ts` `resolveRange(preset, { custom, compare })` — Today / 7 / 30 / 90 days, This month,
  Last month, This year, 12 months, Custom (clamped to today, ≤ 731 days); compare = the equally long block before or
  `lastYear` (`yearEarlier`). Toronto day keys; `trafficShift` moves a range ending today onto the UTC-keyed traffic docs
  (same as the old rolling windows); `trafficWindow` gives the UTC days `adminApi.getDailyAnalyticsBetween` reads (the
  whole comparison window, however long ago). Orders split with `splitRange`
  (`overviewInsights.ts`); `splitPeriods` stays for older callers. The choice is remembered per browser (`lm:overview-view`).
- **Chart:** `overviewSeries.ts` — `buildRangeSeries` (day points + the matching comparison day), `bucketSeries`
  (day/week/month, `autoGrain`), `metricValue` (revenue, orders, units, aov, visitors, conversion), `seriesSummary`,
  `monthPace` (labelled projection, shown under the headline). "Today" charts the last 7 days.
- **What changed:** `overviewChanges.ts` `whatChanged` (revenue + driver, title riser/faller/new, country, visitors,
  conversion, discount share, refunds; max 6, biggest first). **Profit/Titles:** `overviewProfit.ts` — line revenue after
  the order's discount and partial-refund share; cost = `inventoryCosts/{bookId}` (`inventoryApi.costs`) else
  `book.costPrice`; digital lines cost 0; unknown cost is left out and reported as coverage, never guessed; gift cards
  skipped. `titlePerformance` + `OverviewTitles.tsx` (Dig deeper › **Titles**, CSV). **Customers:** `overviewCohorts.ts`
  `cohortRetention`, `repeatTiming`, `newVsReturningRevenue`; **Sales:** `operations` (median paid→shipped, payment/currency
  mix) and `hourHeatmap` (Toronto weekday × hour).
- **Google Analytics 4:** Settings › General › **Google Analytics** (`GoogleAnalyticsCard.tsx`, `admin/googleAnalytics.ts`).
  Measurement ID (public) = `settings/website.analytics.ga4MeasurementId`, written only by that card (`updateSettings` drops
  `analytics` so a stale settings form can't put an old ID back); property ID = admin-only `adminSecrets/googleAnalytics`.
  Storefront: `lib/ga4.ts` loads gtag only after `googleTrackingAllowed()` (analytics consent, not Studio preview/share link,
  not the shop owner signed in — signed-in customers do count), never on `/admin`; declining later sets `ga-disable-<id>`.
  **Google only ever gets `cleanLocation()`** (origin + path + `ref`/`utm_*`/click ids): emailed links carry addresses,
  signed tokens, order keys, sign-in codes and cart ids in the query string. It is set in `config` and before every event.
  A missing ID (settings not loaded yet) keeps the queue. GA `purchase` is sent only for `paymentStatus === "paid"`. Events: router `page_view` (`Ga4PageViews` in
  App.tsx, `send_page_view: false`), `view_item` (BookDetail, once per session), `add_to_cart` (CartContext.addToCart),
  `begin_checkout` (Checkout), `purchase` (`funnelApi.trackPurchase`, CAD order totals, never test/sandbox). Reports: action
  `ga4Report` on `createStripeCheckoutSession` (`functions/googleAnalytics.js`, admin, `LIMITS.ga4`): the Functions' own
  service account token from the metadata server (scope analytics.readonly) — no key stored. Owner setup: add that service
  account (shown by **Check connection**) as a Viewer on the GA4 property and enable the Analytics Data API in the project.
  `overviewSources.ts` gives one `TrafficFigures` shape: `googleTraffic(report)` when connected, else `shopTraffic(daily…)`.
- **Reset:** Marketing & traffic › The shop's own counter › **Start traffic counts again** → action `resetTraffic`
  (`functions/trafficReset.js`, admin, typed `RESET`) deletes every `analytics/<date>` doc and records
  `systemStatus/trafficReset` (`at`, `removedDays`). Never touches orders, revenue or Google Analytics.
- Deploy Functions with the frontend. No Firestore rule or index change.

## Overview analytics 3.0 + your own visits (18 October 2026)

- **Owner never counted:** `lib/ownerDevice.ts` (pure). A browser is the owner's (`localStorage lm:owner-device` = on) after the
  first admin sign-in there (`markOwnerDeviceOnSignIn` in `Dashboard.tsx`, unless the owner chose "off"), via Settings › General ›
  **Your own visits** (`OwnVisitsCard.tsx`), or by opening any page with `?owner-device=on|off` (`takeOwnerDeviceLink`, first in
  `main.tsx`, strips it). `trackingGuard.neverCounted()` also refuses `looksAutomated()` (webdriver, bots, headless, speed testers);
  both the shop counter and GA4 use it. The device flag is for visits only (the owner may ring up a customer's order on it); orders
  by `SHOP_OWNER_EMAIL` are `isOwnOrder`: kept in Orders, to-dos and readiness, left out of every Overview figure (`shopOrders` in
  `AnalyticsDashboard`) and the Monday email; the owner's own carts are left out of cart stats.
- **New counters** (`lib/commerce.ts` funnelApi, all behind `trackingAllowed()`): `bookAdds`, `wishlistAdds`, `unbuyableViews` (free
  maps per book id; the bag and wishlist only emit `lib/shopSignals.ts` window events, listened to from `main.tsx`), `checkout`
  (fixed keys `CHECKOUT_STEPS`, once per step per visit/day) and `vitals` (`lib/pageSpeed.ts`: one key per visit
  `<phone|computer>_<lcp><inp><cls>`, g/o/p/n, Google's limits, PerformanceObserver only; sent at 45 s or when hidden, so visits
  closed sooner are often lost). `firestore.rules` checks only the maps a write changes (`ch`), because a merge write carries the
  whole day doc and checking every map overran the 1,000-expression budget; the emulator script's "busy day" checks guard it.
  Add a step to both `CHECKOUT_STEPS` and `checkoutStepOk`. The "delivery" step counts only once the address is complete.
- **Panels** (pure maths in `admin/overviewSignals.ts`, UI in `OverviewMarketingExtras.tsx`): Titles › Into bag + flags (`titleFlag`);
  Marketing › Where checkout loses people, Campaigns and links that sell (order `acquisition`, GA4 batch 3 `campaigns`), Pages that
  start sales, Page speed for real shoppers, Found on Google; Customers › Did the reminder emails work? + Newsletter sign-ups by week
  (`getAudienceSnapshot().pendingSubscribers`); Stock › Wanted but can't be bought. Never draw a zero for a signal never recorded.
- **Search Console:** `functions/searchConsole.js` (`action: "searchConsole"`, admin, `LIMITS.ga4` bucket `search-console`), the
  Functions' metadata token with scope `webmasters.readonly` (`metadataCredentials(fetch, scope)`); property in admin-only
  `adminSecrets/googleAnalytics.searchConsoleSite` (else the shop's domain, else the only one). Owner setup: add the service account
  as a Restricted user in Search Console and enable the Search Console API. Settings › General › **Google Search Console**.
- **Visitor widgets (19 October 2026):** traffic band `livePages`, `pageTime`, `visitHours`, `actions`, `outbound`, `newReturning`
  (`OverviewVisitors.tsx`, maths `overviewVisitors.ts`) read GA4 batch 4 (`pageTime`, `when`, `actions`, `pageActions`, `outbound`) and the
  realtime `realtimePages`/`realtimeMinutes` in `functions/googleAnalytics.js`; batch 4 fails soft (keys undefined → "Needs the latest server
  update"; a 400 retries its reports one at a time). `dropOff` (traffic) and `lookNoBuy` (titles) use the shop counters
  (`OverviewVisitorPath.tsx`, `overviewVisitorPath.ts`). Starter board `visitors`. No new storefront tracking or rules.
- **Monday summary:** `exports.weeklySummary` (Mondays 08:00 Toronto) → `functions/weeklySummary.js` (pure): last Mon–Sun vs the week
  before, real paid non-owner orders, visits from `analytics/<UTC day>`. Switch `settings/notifications.shopAlerts.weeklySummary`
  (missing = on), Settings › Email sender › Shop alerts, with **Send me last week's summary now** (`sendTestEmail` `weeklySummaryNow`).
  It attaches a two-page PDF (`functions/weeklyPdf.js`, hand-written PDF with built-in Helvetica, no package) drawn from
  `weeklyHighlights` (same sales rules; `analytics` maps for sources/devices/bookViews/searches/funnel; unrecorded = empty, never 0).
  `sendEmail` takes `attachments` (Gmail and Resend; never queued). If the PDF fails the email goes without it.
- Deploy Firestore rules + Functions with the frontend.

## Round-2 digital downloads (10 October 2026)

`downloadDigitalAsset` rules live in `functions/digitalDelivery.js` (pure, `digitalDownloads.test.js`); the endpoint and the
order-confirmation email both use them. Emailed download links stay outside browser App Check.
- **Limits:** each book + edition on an order may be fetched `DOWNLOAD_LIMIT` (10) times, counted in a transaction on
  `orders/{id}.downloadCounts` (`countKey`); the 11th click answers 429. Orders › More order actions › **Reset download limits**
  clears the map (`adminApi.updateOrder`). `downloadToken` itself is unchanged (still per order, never expires); every click mints
  a 15-minute signed URL. `publicOrderView` never sends `downloadCounts`. The email wording is `DEFAULT_DOWNLOAD_NOTE`
  (overridable with an optional `order_confirmation.downloadNote` in `settings/notifications`); nothing says "24 hours" any more.
- **Pre-orders:** `emailDigitalEntries` gives a not-yet-released e-book no link ("Available from <date>" / "once the book is
  released"); Account and Order tracking keep their buttons (the server answers with the release date until then).
- **Box sets:** a request may name a box set's part (`deliveryCandidates` matches `components[].id`); the email, Account and
  tracking list the digital parts (`digitalLine.ts` `digitalEntries`, `downloadBookIds`). The catalog decides whether a part is digital.
- **One file per edition:** Books › edit › **Editions** › *Digital edition* toggle + **Upload this edition's file** sets the edition's
  `digital`, `digitalFileName` (public, like the book's) and `digitalFilePath` (private: `books/{id}/private/admin.variantFiles`,
  split/merged by `bookPrivate.ts`). `pickFileName` takes the edition's file, else the book's. Download links carry `&variantId=`
  and the pages show one button per edition ordered.
- **Refused:** unpaid (402), cancelled orders and open disputes (403; `won/lost/warning_closed/closed/charge_refunded` don't block).
- **File:** signed URL has `responseDisposition: attachment; filename="<title>.<ext>"` (the upload's epoch prefix dropped) and
  `responseType` from the extension (pdf, epub, mp3, m4a, zip).
- Deploy Functions with the frontend. No rule or index change (`downloadCounts` is written by Functions and by the admin).

## Round-2 catalog and settings (10 October 2026)

- **Book saves (`adminApi.updateBook(id, form, loaded, { removeMissing })`):** still diff-only (`changedBookFields`). Three additions in
  `admin/bookStockMerge.ts`: (1) `WRITE_ONCE_DEFAULTS` (status, trackInventory, chargeTax, allowBackorder) are written when the stored book
  has none, so a legacy book matches what the editor showed; (2) a book with editions never gets the editor's own stock total — its count
  is the sum of the merged live editions, computed inside the transaction; (3) `removedBookFields` lists keys that were on the loaded book
  and are gone from the form, and `updateBook` deletes them (`deleteField()`, also in the private document) **only when the caller passes
  `removeMissing: true` — the book editor, which sends the whole form**. Bulk edits and the CSV import send partial objects and must not.
- **Pre-order sync lives in `updateBook`:** when `preorder` or `publishDate` is in the write and differs from `loaded`, it calls
  `syncPreorderOrders` itself and returns `preorderSync { updated, failed }` (the editor toasts it; the CSV import gets it too).
- **Web address freeze:** a published book with an address keeps it (`slugLocked`, `slugFollowsTitle` in `bookEditorState.ts`); Books › edit
  › Details › **Change web address** asks first, then unlocks until the next save. Old links are not redirected (Firebase Hosting could, through `firebase.json` `redirects`; none are generated yet).
- **Old-shop stock copy:** removed (it read the inventory app's frozen Realtime Database). See *Inventory app link*.
- **PayPal:** `functions/paypalCredentials.js` picks the credentials per request mode. Live = Settings › Payments › PayPal Live client ID +
  private Live client secret (`adminSecrets/paypal`) when both exist, else the `PAYPAL_CLIENT_*` Functions secrets. Test = Test client ID +
  Test client secret only, never the live pair (PayPal refuses live credentials on the sandbox). Secrets use `SecretField` and
  `adminApi.removePaypalSecret`. The webhook still verifies with the one `PAYPAL_WEBHOOK_ID` secret (a sandbox webhook id is not separate yet).
- **Resend key:** `resendKeyProblem` (`privateKeys.ts`) is enforced in `writePrivateKeys`; Notifications › Advanced has **Remove stored key**
  (`adminApi.removeResendKey`), after which sending uses the `RESEND_API_KEY` Functions secret again.
- **Email sender:** Settings › **Email sender** (`#settings/communications`) is a card at the top of the Notifications page
  (`admin/senderSettings.ts`): sender name, reply-to, Resend backup address, saved into `settings/website.communications` (whole map kept).
- **Notifications load failure:** the editor shows an error with Try again and refuses to save; it never treats defaults as the saved copy.
- Items 16, 37, 38, 64, 66 and 138 of the round-2 list were already fixed on this branch (`inventoryApi.adjustStock`, `taxRatesEdit`,
  `checkoutClosed`, `planPriceChange`/`eachBook`, the Location postal code/country) and are pinned by `settingsRound2.test.ts`.
- **Deploy:** Functions with the frontend. No Firestore rule or index changes (`adminSecrets/{doc}` already admin-only).

## Checkout address finder (12 October 2026)

`features/site/addressSuggest.ts` feeds the street box's suggestions (`AddressField` in `Checkout.tsx`). It first asks the
`validateAddress` Function (`action: "addressSuggest"`, then `"addressDetails"` on pick; Google Places (New) with a session
token, `functions/addressLookup.js`) and falls back to Photon/OpenStreetMap when the answer has `fallback: true` (no key, Google
error, rate limit; the browser then skips Google for 30 / 2 minutes). The Google key lives only in admin-only
`adminSecrets/addressLookup.googlePlacesKey` (Settings › Shipping › Carrier & labels › **Address finder at checkout**,
`admin/AddressFinderCard.tsx`, **Check key** = admin action `addressKeyCheck`); it is never sent to browsers. Limits:
`LIMITS.address` per connection and `LIMITS.addressShopDay` (300/day, inside Google's 10,000 free requests a month) for the whole shop. The Photon path parses units
(`parseTypedAddress`: "12-456 Main St" outside the US, Apt/Unit/Suite/#), spells out trailing St/Ave/W (`expandStreet`), ranks
the typed house number first, biases to the chosen province and fills a postal code only for a matched house. Picking goes
through `applySuggestion`, which never keeps a postal code/province from a different town and writes a parsed unit into the
unit box (or the street when Studio hides that box). Credit lines: Text & labels › Checkout › `coAddressAttribution` /
`coAddressAttributionGoogle`. Deploy Functions with the frontend; no rule or index change.

## AI writing assistant (13 October 2026)

Settings › General › **AI writing assistant** (`admin/AiWriterCard.tsx`) stores a free Google AI Studio (Gemini) key, an
OpenRouter key + optional model, which one writes, and an optional house style in admin-only `adminSecrets/ai` (`geminiKey`,
`openrouterKey`, `openrouterModel`, `provider`, `voice`); never in public settings. `pickProvider` (`functions/aiWriter.js`) uses
`provider` when that key is saved, else OpenRouter, else Gemini. OpenRouter calls chat completions with the task's schema
(`toJsonSchema`) and reads the answer through the same `parseResponse`; an owner-named model is never swapped, the default list
(`OPENROUTER_MODELS`, first = `DEFAULT_OPENROUTER_MODEL` in `admin/aiWriter.ts`) moves on when one is retired. Key and model
rules are mirrored client-side (`aiWriter.parity.test.ts`). **Backup AI (20 October 2026):** with both keys saved, a used-up / out-of-credits / busy answer (`worthBackup`: 429, 402, 408, 5xx; never a refusal) from the chosen AI is retried on the other (`runWithBackup`, `backupProvider`); the chosen one then rests for 60 s on that instance (`restingUntil`). Gemini 429 tries the next model first (allowances are per model). Results carry `provider` and `fellBack`. Books › edit › Images › Describe all runs `DESCRIBE_AT_ONCE` (3) photos at once through `runPool` (`admin/aiWriter.ts`) and stops starting new ones on a 429 or missing key. `LIMITS.aiWrite` is 120 per 10 min. **Write with AI** buttons:
Books › edit › Search (SEO) (`bookSeo` → metaTitle/metaDescription), Books › edit › Details description toolbar (`bookDescription`,
plain paragraphs, **Undo AI draft**) and Studio › Pages › Search listing (`pageSeo`; the server is told the shop-title suffix length).
Books › edit › Images › **Describe with AI** (per photo, or every photo without a real description; task `photoAlt`: the server
fetches the photo itself, only from the shop's own Storage bucket (`photoImageUrl`, ≤7 MB, `photoAiUrl` picks the ~960px copy) and sends
it to Gemini as inline data; the photos are public already). Alt text that is really a file name ("01", "IMG_9564") counts as none:
`features/site/photoAlt.ts` `describedAlt` (BookDetail falls back to Text & labels `bookPhotoAlt`, the SEO pane's check flags it).
All go through `admin/aiWriter.ts` `askAi` → `createStripeCheckoutSession` `action: "aiWrite"` (admin only, `LIMITS.aiWrite`) →
`functions/aiWriter.js` (pure, tested): JSON-schema output, honesty rules (no invented facts), retired models fall through
`MODELS` on 404, plain-English errors (`aiErrorMessage`). `bookAiInput` sends public catalog facts only — never cost, stock,
shelf, files, customers or orders (free-tier prompts may be used by Google). Drafts land in the editor; nothing is saved by
the AI path. Written fields are replaced only after a Riso confirm. Deploy Functions with the frontend; no rule or index change.
**Studio (3.0 phase 8):** **Rewrite with AI** under section/block text fields (`ConnectableField`) and Text & labels
(`StudioCopyField`) — `studio/StudioAiRewrite.tsx`, task `rewrite` (keeps `{placeholders}` and links or changes nothing;
rich text sanitised on both sides); **Draft a section with AI** in Add section (`studio/StudioAiDraft.tsx`, task
`sectionDraft`, kinds in `DRAFT_TYPES` of `studio/aiStudio.ts` = `functions/aiWriter.js`, parity-tested; no quote/review
sections). Both land as one undoable Studio change; nothing is saved by the AI path. A new AI task needs a `TASKS` entry and
a `needs` branch in `handleAiWrite`. The fixture fakes the server with `setAiTransport` (`__studioFixture.aiAnswer`).
Rich text with pictures/videos/dividers/alignment is rewritten words-only: `protectRichText` / `restoreRichText` hold them out as
`[[keep-N]]` / `[[line-N]]` markers (server `TOKEN_RE` requires them back; each once, in order); links keep target/rel by address; coloured words are still refused. Studio › Pages
bodies have the button too, with a local Undo (`localUndo`). Pictures (incl. pasted `data:` ones) never go to Google.

## URL redirects (11 October 2026)

Settings › General › **URL redirects** (`admin/RedirectsCard.tsx`) maps an old shop address to a new path or `https://` link,
stored in the public, admin-written `settings/redirects` doc (`{ items: [{from, to}] }`; no new rules). Pure rules in
`features/site/redirects.ts` (`cleanRedirects`, `redirectProblem` refuses home, shop routes, duplicates, self and loops,
`findRedirect`, `parseRedirectLines` for pasted lists). The storefront follows a redirect only from a "missing" view —
`NotFoundPage`, `BookDetail` with no book, `PageView` with no page — through `useMissingRedirect` (reads
`publicApi.getRedirects`, never in the Studio preview, keeps the shopper's query, stops after `MAX_REDIRECT_HOPS`), so a real
page is never hijacked. These are browser redirects, not HTTP 301s. No shopper-visible words, so no Text & labels entry.

## High-quality photos (12 October 2026)

`admin/prepareImage.ts`: photos within `MAX_IMAGE_EDGE` (2400 px; Studio `MAX_STUDIO_IMAGE_EDGE` 2800) and under
`KEEP_ORIGINAL_BYTES` (2.5 MB) upload untouched; larger ones are re-saved at `PHOTO_QUALITY` 0.92. Library copies are
480/960/1600/2400 px at 0.88 (`MEDIA_WIDTHS`; the 2400 copy's weight budget is 450 KB). Book photos upload through
`admin/bookPhotoUpload.ts` `uploadBookPhoto`: copies 480/960/1600/2400/3200 px at 0.95 (`BOOK_PHOTO_WIDTHS`,
`BOOK_PHOTO_QUALITY`, 15 October 2026) under `products/`, saved on the photo as `url` (largest) + public
`srcset`/`width`/`height` (library picks carry theirs too), plus the untouched upload as `originalUrl` (`…-original.<ext>`,
never rendered; kept so copies can be remade). Storefront book images spread
`photoSrcSet(photo, CARD_PHOTO_SIZES | PDP_PHOTO_SIZES | THUMB_PHOTO_SIZES)` (`features/site/photoSources.ts`) — add it to
any new book-photo `<img>`; photos without `srcset` render as before. No rule or Function change.
**Crop & position (15 October 2026):** Books › edit › Images › **Crop & edit** (`admin/PhotoCropDialog.tsx`, frame shapes from
`admin/photoCrop.ts` `shopFrameShapes`) saves `framing: { x, y, zoom }` on the photo (the file is never changed; default = no key).
`features/site/photoFraming.ts` draws it: `framingStyle(photo, fallback?)` (object-position + `transform: scale` about that point; a
Tailwind `scale-*` hover still stacks) on every book-photo frame, `motionFraming(photo, hoverScale)` for `m.img` (`style` + `hover`). The
enlarged viewer shows the whole photo. Spread `framingStyle(...)` on any new book-photo `<img>` that fills a frame.
**Quick edits (16 October 2026):** the same dialog saves `adjust: { brightness, contrast, saturation, flipX, flipY }` (50–150 / 0–200,
100 = unchanged, no key when nothing changed). `framingStyle` adds the CSS `filter` and a flip about the frame's centre (object-position
mirrored, so the chosen point stays in view); the viewer uses `adjustStyle`. No rotation: a quarter turn can't fill frames of unknown shape in CSS.
**Lightroom-style edits (16 October 2026):** `adjust` also takes `highlights`, `shadows`, `warmth`, `tint` (−100…100, 0 = unchanged) and `sharpen` (0…100). CSS can't draw them, so `photoTone` builds an SVG filter (warmth/tint colour matrix, tone curve, sharpen kernel) that `adjustFilter` references as `url(#fm-tone-…)`; every element styled by `framingStyle`/`motionFraming` must render `<PhotoToneDefs photo={…} />` beside it (`photoFraming.test.ts` scans for it), and lightbox photos pass `source`. The dialog groups controls (Crop · Light · Colour · Detail & mirror), double-click resets a slider and **Hold to see the original** compares. No vignette (it would move with the hover zoom).
**Straighten, whole photo, clarity (20 October 2026):** `framing.rotate` (±10°, `[`/`]` in the stage) turns about the frame's centre in front of the crop, enlarged by `straightenScale` so frames up to `STRAIGHTEN_COVERS` (2:1) stay filled (wider strips may show a corner); motion images get it through `motionFraming(...).transformTemplate` (pass it on). `framing.fit: "contain"` (+ optional `background` #hex) shows the whole photo; photos shown whole are enlarged too (so coloured bars leave no bare corners). `adjust.clarity` (0–100) is its own SVG filter (`photoClarity`, objectBoundingBox blur) drawn by `PhotoToneDefs`. The enlarged viewer (`adjustStyle`) turns the photo too.

## Storage bandwidth (15 October 2026)

Storage is billed per download, so shoppers must never get an original photo where a copy will do.
- **Copies for old photos:** the scheduled `storageImageSweep` (every 15 min, 1 GiB, `functions/imageCopies.js`, sharp) gives
  every book photo with no `srcset` (the 10 October import) WebP copies beside the original (`<name>-<w>w.webp`, ladder
  480/640/960/1600/2400/3200 capped at the original width, q90 up to 960 (q82 until 15 October 2026 smoothed printed grain), q95 above; a copy heavier than the original is
  replaced by the original itself) and adds `srcset`/`width`/`height` in a transaction. It never deletes, overwrites or changes
  `url`. Progress and unreadable pictures: admin-only `systemStatus/imageCopies`. Keep its ladder equal to `BOOK_PHOTO_WIDTHS` /
  `bookPhotoQuality` (`admin/prepareImage.ts`), which new uploads use.
- **Caching:** every shop upload path is unique, so pictures/videos carry `Cache-Control: public, max-age=31536000, immutable`
  (`PUBLIC_FILE_CACHE` in `adminApi.uploadFile`, the video upload, server copies); the same sweep stamps it on older objects
  (skips `backups/`, `digital-assets/`). Never upload to a path that is later overwritten.
- **Small pictures:** fixed-size thumbnails (bag/checkout lines, search, bag suggestion, sticky bar, bundle covers) use
  `smallPhotoUrl(photo, minWidth)` (`features/site/photoSources.ts`); responsive ones spread `photoSrcSet` (`FEATURE_PHOTO_SIZES` for
  featured/spotlight sections). Never render `photos[n].url` directly for a shopper.
- **Book grids ask for their real width:** every book-card grid passes `gridPhotoSizes(steps, { photo, frame, cover, maxWidth })`
  (`photoSources.ts`) its actual column counts per breakpoint (same numbers as its CSS/Tailwind grid), frame shape and fit; a wide
  photo cropped by "cover" asks for proportionally more. `CARD_PHOTO_SIZES` (fixed 2/3/4 columns) is only its fallback: it made
  browsers pick a too-small copy and stretch it (soft covers, 15 October 2026). A new grid must do the same.
- **Book page gallery:** adaptive frames take each photo's shape from its saved `width`/`height` (`savedRatios` in `BookDetail`;
  a measured shape wins once loaded). Only photos without a saved size load ahead at once; the rest of the gallery loads when the
  shopper reaches for it (`warmGallery`: pointer, touch or focus on the photo column), the strip's neighbours stay eager. The main
  photo's `sizes` is `pdpPhotoSizes` (frame Max width + 10%, wider for photos cropped by "cover", never over 900px), computed from
  saved shapes only so it never changes while photos load; the loading-ahead `Image()` uses the same value.
- **Removed photos:** `adminApi.updateBook` deletes the `products/` files of photos a save took off (and `deleteBook` those of the
  book) through `removeBookFiles` (`admin/bookFileCleanup.ts`), unless another book, edition, sharing image or order line shows
  them; library pictures (assets/) are never deleted. A save keeps server-made copies (`keepPhotoCopies`).

## Catalog file on Hosting (15 October 2026)

`pnpm run build` runs `scripts/build-storefront-data.mjs` (before the prerender), which saves settings/website, published books and
published pages read at ONE Firestore snapshot (`readTime`, REST `batchGet` then `runQuery` with that `readTime`) as
`dist/storefront-data.json` (`scripts/storefrontDataFile.mjs`; same shapes as `publicApi`: books `{...data, id}`, pages `{id, ...data}`,
raw settings). A value JSON can't carry exactly (timestamp, reference, bytes, geo, NaN) or any read failure writes no file.
`useSiteData`'s `readSiteData` uses it (`features/site/storefrontDataFile.ts` `currentStorefrontData`) only when
`settings/catalogVersion.changedAt` (server time stamped by the `catalogVersionBooks/Pages/Settings` triggers after every write,
`functions/catalogVersion.js`) is not after the file's `readTime`; otherwise, or on any error, it reads Firestore exactly as before.
Settings/pages go through `publicApi.publicSettingsFrom` / `sortPages` on both paths. Book/page triggers bump only when the before or
after version is published (`touchesCatalogFile`; drafts aren't in the file). The 15-minute refresh rebuilds when the published fingerprint
changed **or** the marker is newer than the deployed file's `readTime` (`markerNewerThanFile` in `check-published-change.mjs`: a save that
changed nothing shoppers see still turns the file off), and is the backstop if a marker write fails. The triggers retry the write in-process
(`RETRY_DELAYS_MS`) and must not use `retry: true`: the deploy workflow never passes `--force`, which the CLI then requires
(`functions/catalogVersion.test.js` fails on any `retry: true` in `functions/index.js`). `firebase.json` serves root `*.json` `no-cache`. Never add a field to the file that the
Firestore path doesn't return, and keep both paths' transforms shared.
The file also carries `shippingProfiles` (optional; stamped by `catalogVersionShipping`; `check-published-change` compares them since
the fingerprint doesn't): `loadShippingProfiles` and Checkout's catalog/settings/profiles use it via `currentStorefrontData` (one check
shared for 30 s, a copy per reader; Checkout passes `fresh: true`), else Firestore.

## Book videos (15 October 2026)

Books › edit › Images › **Add video** (or drop a video on the images) adds MP4/WebM/MOV files (≤ `MAX_BOOK_VIDEO_BYTES` 50 MB,
`MAX_BOOK_VIDEOS` 5 per book) as entries in the book's `photos` list: `url`/`srcset` are a still frame captured in the browser and
uploaded through `uploadBookPhoto`, `videoUrl` (+ `videoType`, `videoBytes`, `videoDuration`) is the file in `products/videos/`
(`admin/bookVideoUpload.ts`; a file the admin's browser can't decode is refused). Everything that only knows photos (cards, search,
emails, JSON-LD) shows the still. `features/site/bookVideo.ts` `isVideoItem` (https only) decides; `BookDetail` plays it in the main
frame (`preload="metadata"`), thumbnails get a play mark, `PhotoLightbox` takes `videoUrl`. Every book `<video>` starts muted (`muted` + `ref={muteVideo}`, since React doesn't reflect `muted` reliably); keep `controls` so shoppers can unmute. Studio › Style › Product page ›
**Show book videos** (`showProductVideos`); words `bookVideoLabel`, `ariaGoToVideo`. Every play is Storage download traffic.

## Page translation (12 October 2026)

Shoppers may translate the storefront with the browser's Google Translate. `lib/translateSafeDom.ts` (installed first in
`main.tsx`) stops React crashing ("removeChild … not a child") when the translator has swapped its text nodes. Translated
text can't follow later React updates, so live money (card/PDP price, bag lines and totals, checkout summary/total) carries
`translate="no"` — put it on any new element whose number changes while the shopper watches. Never add
`<meta name="google" content="notranslate">` or a page-wide `translate="no"`.
