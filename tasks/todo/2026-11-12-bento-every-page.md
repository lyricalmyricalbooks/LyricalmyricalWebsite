# Bento look on every admin page (12 November 2026)

Owner chose "Overview now, others next PR" after PR #890 (Daily desk bento).

## Plan
- [x] Orders joins the shared page layer (`keepsOldLook` = Overview only)
- [x] Eyebrow above every page title (`pageEyebrow`, tested)
- [x] "Bento pages" CSS layer: white ground, 54px titles, rounded cream tiles, pill tabs/chips/badges, rounded buttons/inputs
- [x] Page-specific tiles: order covers, book covers, Orders side list, coupons, reviews, customer tiles, Settings choices
- [x] Settings pages indented in the rail as a ruled sub list
- [x] Verify: screenshots of every page (1440 light/dark, 390), `pnpm test`, typecheck, lint
- [ ] Fresh review, PR, merge when green

## Verification
- `pnpm test` 611 files / 4,157 tests pass; typecheck and lint clean.
- Local fixture screenshots: Orders (list + order page + phone), Books, Customers (light, dark, phone), Inventory,
  Discounts, Gift cards, Reviews, Messages, Design, Settings › General (desktop + phone).

## Review
- Fixed while checking: figures on Inventory and the phone Orders desk stepped down by the card-after-card margin;
  the order page's two side cards were offset for the same reason.
- Not changed: each page's content and layout, Studio (its own look), the Overview.
