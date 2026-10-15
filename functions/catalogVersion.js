// settings/catalogVersion: when the shop's public catalog last changed (October 2026).
//
// The storefront reads its books, settings and pages from a file the site build saves on Hosting
// (scripts/storefrontDataFile.mjs) instead of Firestore, but only while this marker is not newer than the file's
// Firestore snapshot (features/site/storefrontDataFile.ts). Every write to books/{id}, pages/{id} or settings/website
// sets `changedAt` to the server time of the marker write. That runs after the change committed, so it is always at
// or after the change, and later marker writes always carry later times, so no transaction is needed (many book
// writes at once never contend). After any change shoppers read Firestore until the next build replaces the file.
"use strict";

const MARKER = ["settings", "catalogVersion"];

async function bumpCatalogVersion(db, FieldValue, source) {
  await db.collection(MARKER[0]).doc(MARKER[1]).set({
    changedAt: FieldValue.serverTimestamp(),
    source: String(source || "").slice(0, 120),
  });
}

module.exports = { bumpCatalogVersion, MARKER };
