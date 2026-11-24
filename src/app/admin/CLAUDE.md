# Admin dashboard

The admin (route `/admin`): Riso Press design system, Orders/fulfilment, Overview analytics, inventory app link, settings. Studio (the theme editor) has its own guide in `studio/CLAUDE.md`. The repo-wide rules are in the root `CLAUDE.md`.

**No import loop through `api.ts` (27 October 2026).** Most screens import `adminApi` from `api.ts`, so nothing `api.ts`
imports may import it back: a loop makes one of the two run half set up. `themeStore.ts` did, for the audit log, which
now lives in `auditLog.ts` (`adminApi.recordAuditLog` / `getAuditLog` hand on to it). A helper `api.ts` uses that needs
another admin call takes it from its own small file the same way. `adminApiImports.test.ts` fails on any new loop.

## Standing rules

### Look and components
- Build pages from `riso/components.tsx` (Tabs, Dialog, DataTable, SaveBar, `useConfirm()`…); don't add new `.admin-reso` compat rules or wrap `rp-*` chrome in `.admin-light`. The current standard is Calm v4 (`riso/calm.css`, `--c-*` tokens); restyle through shared classes, not page overrides. Keep any new `riso.css` layer rule scoped `.rp:not(.studio-editor)`; Studio never gets `rp-calm`.
- Never show raw `err.message`: use `admin/plainError.ts`, `friendlyError` or `admin/loginError.ts`.
- Split long pages into sub tabs (panels stay mounted, mark edits `unsaved`, unique tab ids). Settings card descriptions are one line of 70 characters at most (`settingsWording.test.ts`).
- Order page: one main button per state; put a new order state into `next` (`FulfillmentWorkbench`), not a new card.
- When adding a keyboard shortcut, update the list in `Dashboard.tsx`.

### Routing
- A new admin page goes in `ADMIN_TABS` (`adminRoute.ts`), sub tabs in `SUB_TABS` via `useSubTab`; migrated pages in `Dashboard.tsx`'s `migrated` flag. Tab ids and address slugs stay stable so old links keep working.
- Release notes and alert shortcuts use ids from `riso/nav.ts`; an alert's button opens the tab holding its fix (`alertRoute`).

### Orders, payment and stock
- The admin never marks card/PayPal orders paid; manual orders only via server `markOrderPaid`. Labels never dispatch an order or email.
- Internal notes and history live in admin-only `order-operations`, never the guest-readable order. Deleting orders follows `deleteRefusal`, mirrored in the `orders` delete rule.
- Every stock edit goes through `inventoryApi.adjustStock` (a transaction over `planStockChange`, plus an `inventoryLog` row). `adminApi.updateBook` re-reads in a transaction and keeps live stock (`keepLiveStock`, `lockLinkedStock`). A book with editions stores the sum of its editions.
- Only the book editor passes `updateBook(…, { removeMissing: true })`. Bulk edits and CSV import send partial objects and must not.
- Discount edits never write `usageCount`/`createdAt` (server-owned). Call `invalidateOrders()` after order changes.
- Keep in step: `dispatchProblem` ↔ server `externalDispatchProblem` (`dispatchGuard.parity.test.ts`); AI key/model rules (`aiWriter.parity.test.ts`); Studio AI kinds `DRAFT_TYPES` ↔ `functions/aiWriter.js`.

### Inventory app link
- The inventory app holds the master count for linked editions; linked stock is read-only on the website. Only `functions/inventoryLinkStore.js` touches the other project. The contract `docs/INVENTORY_LINK.md` must change together with the inventory repo's `docs/website-link.md`. `docs/link-details-fixture.json` pins the shared detail rule in both repos.
- Sales counts come from `orderFootprint` (physical copies of linked editions), never from what `writeStock` did. Stock is applied only after the catch-up and any relink have completed.

### Analytics
- Sales figures come only from real paid, non-test, non-owner orders (`overviewInsights.ts`); never the webhook-bumped `analytics` totals. `overviewInsights.ts`, `overviewShared.ts`, `overviewRange.ts` and `overviewVisitors.ts` are used by other screens too: check those screens when you change them.
- Orders sit on Toronto days (`lib/shopDay.ts`); traffic stays on UTC `analytics/<date>` keys because the rules pin those ids. Don't change the write keying without the rules.
- Never draw a zero for a signal that was never recorded ("Not recorded yet").
- A new widget needs a `WIDGETS` entry in its topic's band plus its `only` id (`overviewBoard.test.ts`). A new checkout step goes in both `CHECKOUT_STEPS` and the rule `checkoutStepOk`. Rules check only the maps a write changes: keep the emulator's "busy day" checks passing.
- `lib/commerce.ts` must not import `admin/*` (`lib/shopperBundle.test.ts`). Google only ever gets `cleanLocation()`; GA `purchase` only for paid orders, never test/sandbox.

### Secrets and AI
- Keys (Stripe, PayPal, Resend, Gmail, AI, GA property) live only in admin-only `adminSecrets/*`; `updateSettings` drops `analytics`, so only its card writes the GA ID.
- AI: a new task needs a `TASKS` entry and a `needs` branch in `handleAiWrite`. Send only public catalog facts (never cost, stock, shelf, files, customers, orders). Drafts land in the editor; the AI path saves nothing. Pictures never go to Google from rich text.

### Deploy
- Rules (for example `adminPrefs`, `analytics` caps, `order-operations`) deploy before the frontend; Functions with it.

## Feature notes

Details of each feature live in [`docs/agent-notes/admin.md`](../../../docs/agent-notes/admin.md) (read the section before changing that feature; Grep its heading). Sections:
- Inventory app link (11 October 2026)
- Riso Press admin design system
- Publisher fulfillment desk (2 October 2026)
- Fulfillment workspace UX repair (2 October 2026)
- Order page: Next step (14 November 2026)
- Admin improvement pass (10 October 2026)
- Reports, analytics and performance (10 October 2026)
- Overview analytics 2.0 + Google Analytics (13 October 2026)
- Overview analytics 3.0 + your own visits (18 October 2026)
- Round-2 catalog and settings (10 October 2026)
- AI writing assistant (13 October 2026)
- URL redirects (11 October 2026)
