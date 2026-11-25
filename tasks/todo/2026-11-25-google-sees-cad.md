# Google always sees CAD prices (2026-11-25)

Owner asked: "yes always CAD prices". Googlebot renders from the US, so the time-zone and country guesses gave it USD
in the book JSON-LD, while Merchant Center and the shipping rates use CAD.

- [x] `CurrencyProvider` skips the time-zone and country guesses when `looksAutomated()` (bots, headless, webdriver).
- [x] `looksAutomated` also matches `Google-InspectionTool` (Search Console live test); tests for it, Storebot and
      Googlebot smartphone.
- [x] Release note.
- [ ] Tests, typecheck, lint; PR; merge when green.
- [ ] After deploy: Search Console live test of The Hound shows `priceCurrency: CAD`.

## Review
Smallest change: one early return reusing the existing bot check, so the prerender snapshot (webdriver) is CAD too.
Real shoppers keep their saved choice, time zone and country starting currency.
