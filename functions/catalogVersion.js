// settings/catalogVersion: when the shop's public catalog last changed (October 2026).
//
// The storefront reads its books, settings and pages from a file the site build saves on Hosting
// (scripts/storefrontDataFile.mjs) instead of Firestore, but only while this marker is not newer than the file's
// Firestore snapshot (features/site/storefrontDataFile.ts). Every write to books/{id}, pages/{id} or settings/website
// sets `changedAt` to the server time of the marker write. That runs after the change committed, so it is always at
// or after the change, and later marker writes always carry later times, so no transaction is needed (many book
// writes at once never contend). After any change shoppers read Firestore until the next build replaces the file.
//
// The triggers can't use the platform's retry setting (deploying it needs `firebase deploy --force`, which the deploy
// workflow deliberately never passes), so a failed write is retried here a few times. If every try fails, the
// 15-minute storefront refresh still rebuilds the file, because the change also changes the published fingerprint.
"use strict";

const MARKER = ["settings", "catalogVersion"];
const RETRY_DELAYS_MS = [500, 1000, 2000, 4000];

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function bumpCatalogVersion(db, FieldValue, source, { delays = RETRY_DELAYS_MS, sleep = wait } = {}) {
  const write = () => db.collection(MARKER[0]).doc(MARKER[1]).set({
    changedAt: FieldValue.serverTimestamp(),
    source: String(source || "").slice(0, 120),
  });
  for (let attempt = 0; ; attempt++) {
    try {
      return await write();
    } catch (err) {
      if (attempt >= delays.length) throw err;
      await sleep(delays[attempt]);
    }
  }
}

module.exports = { bumpCatalogVersion, MARKER, RETRY_DELAYS_MS };
