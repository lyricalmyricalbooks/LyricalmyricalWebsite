import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export function decodeValue(value = {}) {
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, child]) => [key, decodeValue(child)]));
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('integerValue' in value) return Number(value.integerValue);
  return value.stringValue ?? value.doubleValue ?? value.booleanValue ?? value.timestampValue ?? null;
}
const decodeDocument = document => ({ ...decodeValue({ mapValue: { fields: document.fields } }), id: document.name.split('/').at(-1), _updateTime: document.updateTime });
async function publicRead(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Public data read failed: ${response.status}`);
  return response.json();
}
export async function readPublicStorefront() {
  const config = await readFile(new URL('../src/lib/firebaseApp.ts', import.meta.url), 'utf8');
  const project = config.match(/projectId:\s*"([^"]+)"/)?.[1];
  if (!project) throw new Error('Firebase project ID missing');
  const endpoint = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/`;
  const [books, pages, settings] = await Promise.all([readPublishedBooks(endpoint), readPublishedPages(endpoint), publicRead(endpoint + 'settings/website').then(decodeDocument)]);
  return { books, pages, settings };
}
// firestore.rules let the public read only books whose status is "published" (private fields live in books/{id}/private/admin),
// so an unfiltered listing is refused: ask for exactly those, a page of `size` at a time by document name.
export const publishedBooksQuery = (afterName = '', size = 300) => ({
  structuredQuery: {
    from: [{ collectionId: 'books' }],
    where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'published' } } },
    orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
    limit: size,
    ...(afterName ? { startAt: { values: [{ referenceValue: afterName }], before: false } } : {}),
  },
});
export async function readPublishedBooks(endpoint, fetchImpl = fetch, size = 300) {
  const books = [];
  let after = '';
  for (;;) {
    const response = await fetchImpl(endpoint.replace(/\/$/, '') + ':runQuery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(publishedBooksQuery(after, size)),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Public data read failed: ${response.status}`);
    const rows = await response.json();
    const documents = (Array.isArray(rows) ? rows : []).filter(row => row && row.document).map(row => row.document);
    books.push(...documents.map(decodeDocument));
    if (documents.length < size) return books;
    after = documents.at(-1).name;
  }
}
// firestore.rules let the public read only published pages, so an unfiltered listing of
// `pages` is refused: ask for exactly the published ones (a status == "published" query).
export const publishedPagesQuery = () => ({
  structuredQuery: {
    from: [{ collectionId: 'pages' }],
    where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'published' } } },
  },
});
export async function readPublishedPages(endpoint, fetchImpl = fetch) {
  const response = await fetchImpl(endpoint.replace(/\/$/, '') + ':runQuery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(publishedPagesQuery()),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Public data read failed: ${response.status}`);
  const rows = await response.json();
  return (Array.isArray(rows) ? rows : []).filter(row => row && row.document).map(row => decodeDocument(row.document));
}
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().filter(key => !['updatedAt', '_updateTime'].includes(key)).map(key => [key, stable(value[key])])) : value;
// Only the published design counts: scheduled designs and campaigns are published into `design` by the server
// scheduler (functions/themeSchedule.js, Studio 3.5). A leftover `scheduledPublish` field is ignored.
export function effectivePublishedSettings(settings, _now = new Date().toISOString()) {
  const { draftDesign, scheduledPublish, savedThemes, designPublishedAt, ...published } = settings;
  return published;
}
// A plain release date starts that day in Toronto (src/app/features/site/liveBook.ts releaseArrived).
export function releaseArrived(scheduleDate, nowISO = new Date().toISOString()) {
  if (!scheduleDate) return true;
  const value = String(scheduleDate);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowISO));
    return value <= today;
  }
  const at = Date.parse(value);
  return Number.isFinite(at) ? at <= Date.parse(nowISO) : value <= nowISO;
}
export function publishedFingerprint({ books, pages, settings }, now = new Date().toISOString()) {
  const publishedSettings = effectivePublishedSettings(settings, now);
  const live = books.filter(book => (!book.status || book.status === 'published') && releaseArrived(book.scheduleDate, now));
  const snapshot = { books: [...live].sort((a, b) => a.id.localeCompare(b.id)), pages: pages.filter(page => page.status === 'published').sort((a, b) => a.id.localeCompare(b.id)), settings: publishedSettings };
  return createHash('sha256').update(JSON.stringify(stable(snapshot))).digest('hex');
}
