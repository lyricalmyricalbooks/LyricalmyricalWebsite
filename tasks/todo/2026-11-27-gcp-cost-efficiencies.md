# Phase 1 Google Cloud Cost Efficiencies

**Asked for:** Find efficiencies and improvements to the app so that I pay less for Google Cloud usage costs per month (in suggested order).
**Done means:** Background cron Firestore reads, scheduled Cloud Function frequencies/writes, nightly backup reads/retention, and unnecessary per-visitor storefront reads/writes/function calls are reduced cleanly with all tests, typecheck, lint, and build green and merged via PR.

## Before starting

- [x] Reviewed `tasks/lessons.md` (relevant lessons: ship PR early, merge once green, each PR adds its own release note file, keep admin copy short and owner-friendly)
- [x] Read the area guide(s): `CLAUDE.md`, `functions/CLAUDE.md`, `.github/CLAUDE.md`, `src/app/features/site/CLAUDE.md`

## Plan

- [x] 1. Cut 15-minute GitHub cron Firestore reads via `scripts/publishedChangeCheck.mjs` + `scripts/check-published-change.mjs` + `scripts/publishedChangeCheck.test.ts`
- [x] 2. Tune scheduled Cloud Functions (`storageImageSweep`, `backInStockSweep`, `refreshExchangeRates`, `inventoryLinkSweep`, `unpaidPaymentSweep`) and skip no-op Firestore writes (`reversalSchedule.js`, `themeSchedule.js`)
- [x] 3. Optimize nightly backups (`backupJson.js` skip list, `BACKUP_KEEP_DAYS` 14, weekly managed export)
- [x] 4. Reduce storefront reads/writes/calls (`CurrencyContext.tsx`, `storefrontDataFile.mjs`/`.ts`, `exchangeRates.ts`, `reviews.ts`, `commerce.ts`)
- [x] 5. Add release note (`src/app/admin/updates/2026-11-27-01-gcp-cost-efficiencies.ts`)

## Verification

- [x] Targeted tests (`15` files, `169` tests passed; excluding pre-existing `.*-work/**` worktrees)
- [x] Lint: `pnpm.cmd run lint` (`0` problems)
- [x] Functions load check: `node -e "require('./functions/index.js')"`
- [ ] Full Linux CI (`test`, `typecheck`, `vite build`, `studio-browser`, `studio-controls`, `storefront-smoke`, `release-note`) — local Windows case-insensitive NTFS collides on pre-existing paired `Foo.tsx` / `foo.ts` files (`TS1261`/`TS1149`); verified via GitHub Actions PR CI.

## Progress notes

- Branch `perf/gcp-cost-efficiencies` created off `main`.
- Implemented fast `settings/catalogVersion` check with 6-hour/midnight-Toronto backstop in `scripts/publishedChangeCheck.mjs` & `scripts/check-published-change.mjs`.
- Tuned Cloud Functions schedules (`storageImageSweep` daily, `backInStockSweep` hourly, `refreshExchangeRates` 12h, `inventoryLinkSweep` 15m, `MATCH_EVERY_MS` 6h, `unpaidPaymentSweep` sub-tasks gated hourly/daily) and suppressed no-op Firestore writes in `reversalSchedule.js` and `themeSchedule.js`.
- Expanded `backupJson.js` `SKIP_COLLECTIONS`, lowered `BACKUP_KEEP_DAYS` to 14, and scheduled managed Firestore exports weekly on Sundays (+ manual runs).
- Removed `visitorCountry` function call on first load, gated `CurrencyContext` exchange-rate polling for CAD visitors, bundled `exchangeRates` & `reviewSummaries` into `storefront-data.json`, and increased `COUNTER_FLUSH_MS` to 3000 ms.

## Review

- **What changed:** Reduced recurring Firestore reads/writes, scheduled Cloud Function invocations, nightly backup duplication, and per-visitor client reads/calls across scripts, Cloud Functions, and storefront modules without altering any checkout, payment, or inventory authority path.
- **Verified:** All 15 targeted test suites (169 tests) passed, `pnpm.cmd run lint` passed with 0 issues, and `require('./functions/index.js')` loaded cleanly.
- **Note on local Windows build/typecheck:** The repository contains pre-existing case-differing pairs (e.g. `CardHoverPhoto.tsx` / `cardHoverPhoto.ts`) which fail case-insensitive Windows NTFS module resolution (`TS1261`/`MISSING_EXPORT`); full CI verification runs on Linux (`ubuntu-latest`) on the PR.
