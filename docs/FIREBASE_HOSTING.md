# Moving the storefront to Firebase Hosting

GitHub stays the code home and the place builds run. Only where the built shop is served changes: from
GitHub Pages (`https://lyricalmyricalbooks.github.io/LyricalmyricalWebsite/`) to Firebase Hosting
(`https://lyricalmyrical-web-v2.web.app`, at the root of its own address; your own domain later). Stripe,
Firestore and the Cloud Functions' payment and order logic do not change.

The move happens in three steps so that each one can be checked, and undone, on its own.

| Step | What changes | Status |
| --- | --- | --- |
| 1. Side by side | Every release also publishes the shop to web.app, hidden from search engines. GitHub Pages stays the live shop. | This change |
| 2. Cutover | web.app becomes the shop's address: links in emails, sitemap and search listings. The old Pages address forwards every link (including ones in emails already sent) to the same page on web.app. | Later |
| 3. Cleanup | Remove the GitHub Pages-only redirect code; after 30–60 days stop accepting checkout calls from the old address. | Later |

## Before switching step 1 on (owner, in the consoles)

1. **Hosting site.** Firebase console › Hosting: open it once (Get started) so the default site
   `lyricalmyrical-web-v2` exists. `firebase.json` pins that site ID, so a different ID fails the deploy loudly.
2. **Deploy key.** Google Cloud console › IAM › Service accounts: create one with only the
   **Firebase Hosting Admin** role, make a JSON key and save it as the GitHub repository secret
   `FIREBASE_HOSTING_SERVICE_ACCOUNT`. Without it the workflow uses `FIREBASE_SERVICE_ACCOUNT`, if that account
   may deploy Hosting.
3. **Allowed addresses.** Add `lyricalmyrical-web-v2.web.app` to:
   - the reCAPTCHA Enterprise key's domains, if a key is set (docs/RECAPTCHA.md);
   - Firebase Auth › Settings › Authorized domains in the legacy project `lyricalmyrical-37c46`, for the
     admin's inventory sync sign-in (the main project allows web.app by default);
   - any HTTP-referrer restrictions on the browser API key (Google Cloud › APIs & Services › Credentials).
4. **Variables.** `RECAPTCHA_ENTERPRISE_SITE_KEY` and `APP_CHECK_MODE`, if used, must be **repository** variables,
   not only `github-pages` environment variables.
5. **Release history.** Firebase console › Hosting › Release storage settings: keep about 30 versions.
6. **Deploy the Cloud Functions** that allow web.app (Deploy Firebase runs on merge). Then set the repository
   variable **`FIREBASE_HOSTING_ENABLED` = `true`** and run **Actions › Deploy storefront › Run workflow**.

## Trying the new address (a few days)

The deploy job checks the live site itself (`scripts/hosting-smoke.mjs`). Then, on
`https://lyricalmyrical-web-v2.web.app`:

- Sign in to the admin with Google. Run the inventory sync once, because it opens a second sign-in.
- Open Studio and preview every template, including Page not found.
- Publish a change in Studio. Within about 15 minutes both addresses should rebuild.
- Firebase console › App Check: requests from web.app are verified (if a key is set).
- Settings › Payments › **Register this site with Stripe**, once in test mode and once in live mode.
- Place one real low-value order by card and one by PayPal, then refund them. Test mode applies to the whole
  shop, so don't switch it on while shoppers are buying.
- Sign up for the newsletter and send a contact message (these call the Cloud Functions).
- Emails still link to the GitHub Pages address until the cutover. That is expected.

`https://lyricalmyrical-web-v2.firebaseapp.com` serves the same files but forwards visitors to web.app, so there is
only one public address.

## How Firebase Hosting serves the shop (`firebase.json`)

- `books/<slug>.html` (prerendered) answers at `/books/<slug>` with 200. `/books/<slug>/` and `/books/<slug>.html`
  301-redirect there.
- Account, checkout, admin, tracking, wishlist, and book/page/category addresses that have no snapshot get the
  app shell (`spa.html`).
- Any other address gets a real **404** that still shows the shop's editable missing page (`404.html` is the same
  app shell). There is deliberately no catch-all rewrite.
- `/assets/*` (hashed file names) are cached for a year; pages, the sitemap, robots and the feed are revalidated
  on every visit.
- Every response sends `nosniff`, `Referrer-Policy` and `X-Frame-Options: SAMEORIGIN` (Studio shows the shop in a
  frame). Until the cutover, every response also sends `X-Robots-Tag: noindex`.

`scripts/hostingConfig.test.ts` checks these rules (and that every app route is covered). The Hosting emulator check
runs in CI and before every deploy.

## Undoing it

- **Step 1:** set `FIREBASE_HOSTING_ENABLED` to anything but `true`, or revert the change. GitHub Pages is never
  touched.
- **A bad release:** Firebase console › Hosting › Release history › Rollback.
- **After the cutover:** never turn Hosting off, because emails link there.
