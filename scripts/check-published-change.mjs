import { appendFile } from 'node:fs/promises';
import { readPublicStorefront, publishedFingerprint } from './publicStorefrontData.mjs';
import { isFingerprint } from './assetManifest.mjs';
const siteUrl = (process.env.SITE_URL || 'https://lyricalmyricalbooks.github.io/LyricalmyricalWebsite').replace(/\/$/, '');
const fingerprint = publishedFingerprint(await readPublicStorefront());
let previous = '';
try {
  const response = await fetch(`${siteUrl}/seo-published-fingerprint.txt?check=${Date.now()}`, { signal: AbortSignal.timeout(30000), cache: 'no-store' });
  // Only a real digest counts; an HTML page answering for a missing marker means "rebuild".
  if (response.ok) { const text = (await response.text()).trim(); if (isFingerprint(text)) previous = text; }
} catch { /* Missing marker or unavailable deployment triggers a rebuild. */ }
const changed = fingerprint !== previous;
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
console.log(changed ? 'Published content changed; rebuild required.' : 'Published content unchanged; deployment skipped.');
