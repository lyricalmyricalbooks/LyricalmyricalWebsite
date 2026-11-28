import { appendFile, readFile } from 'node:fs/promises';
import { readPublicStorefront, publishedFingerprint } from './publicStorefrontData.mjs';
import { isFingerprint } from './assetManifest.mjs';
import { STOREFRONT_DATA_FILE, readShippingProfiles, shippingProfilesDiffer } from './storefrontDataFile.mjs';
import { fastPublishedDecision } from './publishedChangeCheck.mjs';

const siteUrl = (process.env.SITE_URL || 'https://lyricalmyrical-web-v2.web.app').replace(/\/$/, '');
const config = await readFile(new URL('../src/lib/firebaseApp.ts', import.meta.url), 'utf8');
const project = config.match(/projectId:\s*"([^"]+)"/)?.[1];

const [fpRes, fileRes, markerRes] = await Promise.all([
  fetch(`${siteUrl}/seo-published-fingerprint.txt?check=${Date.now()}`, { signal: AbortSignal.timeout(30000), cache: 'no-store' }).catch(() => null),
  fetch(`${siteUrl}/${STOREFRONT_DATA_FILE}?check=${Date.now()}`, { signal: AbortSignal.timeout(30000), cache: 'no-store' }).catch(() => null),
  project
    ? fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/settings/catalogVersion`, { signal: AbortSignal.timeout(30000) }).catch(() => null)
    : Promise.resolve(null),
]);

let previous = '';
try {
  if (fpRes?.ok) {
    const text = (await fpRes.text()).trim();
    if (isFingerprint(text)) previous = text;
  }
} catch { /* Missing marker triggers a rebuild. */ }

let file = null;
try {
  if (fileRes?.ok && /json/.test(fileRes.headers.get('content-type') || '')) file = await fileRes.json();
} catch { /* Ignore invalid JSON. */ }

let marker = null;
try {
  if (markerRes?.ok) marker = await markerRes.json();
} catch { /* Ignore unreadable marker. */ }

const decision = fastPublishedDecision({ previousFingerprint: previous, file, marker });
let changed = false;

if (decision.action === 'rebuild') {
  changed = true;
  console.log(`Fast check decided rebuild (${decision.reason}); skipping full Firestore fingerprint.`);
} else if (decision.action === 'skip') {
  changed = false;
  console.log(`Fast check skipped full Firestore scan (${decision.reason}).`);
} else {
  const fingerprint = publishedFingerprint(await readPublicStorefront());
  changed = fingerprint !== previous;
  if (!changed && file?.shippingProfiles && project) {
    try {
      const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
      if (shippingProfilesDiffer(file, await readShippingProfiles(base))) {
        changed = true;
        console.log("The catalog file's shipping profiles differ from Firestore's; rebuilding it.");
      }
    } catch { /* Ignore fallback profile check failure. */ }
  }
}

if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
console.log(changed ? 'Published content changed; rebuild required.' : 'Published content unchanged; deployment skipped.');
