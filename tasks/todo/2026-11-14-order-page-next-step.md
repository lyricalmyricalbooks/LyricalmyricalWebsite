# Order page: concept A "Next step" (14 November 2026)

Owner's ask: "order page is WAY too hard and not user friendly". Concepts: https://claude.ai/artifact/Gu9Gcz6GSMPe1sTBCQrJBa, owner picked A.

## Plan
- [x] Pure rules `orderPage.ts` (`orderPill`, `orderProgress`, `onlyAddressLeft`) + tests
- [x] Header: back link + pager ("1 of N to ship", J/K), name as title, one pill, meta line (number · date · total)
- [x] Three-part progress bar replacing Paid badge, queue badge, step boxes and checklist ticks
- [x] Alerts (former side cards) above one Next step card: title, detail, secondary actions, one main button
- [x] Ship to + In the parcel side by side (contact and payment folded into them)
- [x] How they found you / gift cards row; History folded into one row
- [x] Full-width order page (list pane removed on desktop); Print pick list moved to the grid
- [x] Phone: main button pinned to the bottom, short progress labels
- [x] Update FulfillmentWorkbench / OrdersDesk tests
- [x] Verify: `pnpm test`, typecheck, lint, screenshots (label, pack, address, hold, request, transit; desktop, phone, night)

## Review
Every concept-A item is built: header pill, meta line, pager, progress bar, alerts, one next-step card with one main
button, side-by-side Ship to / In the parcel, extras row, folded history, pinned phone button. Server calls, label
safeguards, payment and refund paths are unchanged (same handlers, re-wired). 4165 tests pass, typecheck and lint clean.
