import { isFingerprint } from './assetManifest.mjs';
import { STOREFRONT_DATA_VERSION, markerNewerThanFile, nanoTime } from './storefrontDataFile.mjs';

const TORONTO_TZ = 'America/Toronto';

/** Valid ISO timestamp -> YYYY-MM-DD in Toronto time, or "" when invalid. */
export function torontoDay(iso) {
  if (typeof iso !== 'string' || !iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TORONTO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

/** True during the first 15-minute window of every 6th UTC hour (4 backstop full checks/day). */
export function isBackstopWindow(now = new Date()) {
  return now.getUTCMinutes() < 15 && now.getUTCHours() % 6 === 0;
}

/**
 * Fast decision for the 15-minute storefront refresh check:
 * - "rebuild" if the published fingerprint is missing or `catalogVersion` is newer than the deployed file;
 * - "skip" if the file and marker agree, it was built today in Toronto, and this isn't a 6-hour backstop run;
 * - "full-check" on Toronto day rollover or 6-hour backstop (catches date-driven sales/preorders & approved reviews).
 */
export function fastPublishedDecision({ previousFingerprint, file, marker, now = new Date() }) {
  if (!isFingerprint(previousFingerprint)) {
    return { action: 'rebuild', reason: 'missing-fingerprint' };
  }
  if (markerNewerThanFile(marker, file)) {
    return { action: 'rebuild', reason: 'catalog-version-newer' };
  }
  const hasFile = file && typeof file === 'object' && file.v === STOREFRONT_DATA_VERSION && !!nanoTime(file.readTime);
  const hasMarker = !!nanoTime(marker?.fields?.changedAt?.timestampValue);
  if (hasFile && hasMarker && !markerNewerThanFile(marker, file)) {
    const builtDay = torontoDay(file.builtAt);
    const today = torontoDay(now.toISOString());
    if (builtDay && today && builtDay === today && !isBackstopWindow(now)) {
      return { action: 'skip', reason: 'catalog-version-current' };
    }
  }
  return { action: 'full-check', reason: 'backstop-or-day-rollover' };
}
