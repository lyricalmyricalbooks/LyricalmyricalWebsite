#!/usr/bin/env node
// Checks that Firebase Hosting serves the built storefront the way firebase.json promises: prerendered pages
// at their slash-less address, the app shell for app routes, a real 404 (still the app) for unknown URLs,
// immutable hashed assets, no-cache HTML and the security headers. Node built-ins only.
//
// Against the Hosting emulator (CI and the deploy workflow, after a build):
//   npx firebase-tools@<FIREBASE_TOOLS_VERSION> emulators:exec --only hosting --project demo-lyricalmyrical \
//     "node scripts/hosting-smoke.mjs"
// Against the live site after a deploy (reads the same dist/ that was deployed):
//   node scripts/hosting-smoke.mjs --base https://lyricalmyrical-web-v2.web.app
// --expect-noindex: every page must carry X-Robots-Tag: noindex (a copy kept out of search engines).
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicRoutes, routeOutputPath } from './prerenderHtml.mjs';
import { parseAssetManifest, isFingerprint } from './assetManifest.mjs';
import { FIREBASE_PROJECT } from './canonicalHost.mjs';

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, option('--dist') || 'dist');
const expectNoindex = flag('--expect-noindex');

async function emulatorBase() {
  const hub = process.env.FIREBASE_EMULATOR_HUB;
  if (!hub) throw new Error('Pass --base <url>, or run inside `firebase emulators:exec --only hosting`.');
  const list = await (await fetch(`http://${hub}/emulators`)).json();
  if (!list.hosting) throw new Error('The Hosting emulator is not running.');
  return `http://${list.hosting.host}:${list.hosting.port}`;
}
const base = (option('--base') || await emulatorBase()).replace(/\/+$/, '');
const live = Boolean(option('--base'));

const read = name => readFile(resolve(dist, name), 'utf8');
const shell = await read('spa.html');
const failures = [];
let checked = 0;

async function request(path, url = base + path) {
  const response = await fetch(url, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20000) });
  return { status: response.status, headers: response.headers, body: await response.text() };
}

async function check(path, expect) {
  checked += 1;
  let res;
  try { res = await request(path, expect.url); } catch (error) { failures.push(`${path}: ${error.message}`); return; }
  const problems = [];
  const header = name => res.headers.get(name) || '';
  if (expect.status && res.status !== expect.status) problems.push(`status ${res.status}, expected ${expect.status}`);
  if (expect.location !== undefined) {
    const location = header('location').replace(base, '');
    if (location !== expect.location) problems.push(`Location "${header('location')}", expected "${expect.location}"`);
  }
  if (expect.body !== undefined && res.body !== expect.body) problems.push(`body is not ${expect.bodyName}`);
  if (expect.contains && !res.body.includes(expect.contains)) problems.push(`body lacks "${expect.contains}"`);
  if (expect.match && !expect.match.test(res.body)) problems.push(`body does not match ${expect.match}`);
  if (expect.cache && !header('cache-control').includes(expect.cache)) problems.push(`Cache-Control "${header('cache-control')}", expected "${expect.cache}"`);
  if (expect.security) {
    if (header('x-content-type-options') !== 'nosniff') problems.push('missing X-Content-Type-Options: nosniff');
    if (header('referrer-policy') !== 'strict-origin-when-cross-origin') problems.push('missing Referrer-Policy');
    if (header('x-frame-options') !== 'SAMEORIGIN') problems.push('X-Frame-Options must be SAMEORIGIN (Studio frames the shop)');
  }
  if (expect.noindex !== undefined) {
    const noindex = header('x-robots-tag').includes('noindex');
    if (noindex !== expect.noindex) problems.push(expect.noindex ? 'missing X-Robots-Tag: noindex' : 'unexpected X-Robots-Tag: noindex');
  }
  if (problems.length) failures.push(`${path}: ${problems.join('; ')}`);
}

const page = { status: 200, cache: 'no-cache', security: true, noindex: expectNoindex };
const appShell = { ...page, body: shell, bodyName: 'the app shell (spa.html)' };

// Home and prerendered pages (only when this dist was prerendered).
await check('/', { ...page, contains: 'id="root"' });
await check('/', { contains: 'moveToCanonicalHost' });
await check('/index.html', { status: 301, location: '/' });
if (existsSync(resolve(dist, 'prerender-routes.xml'))) {
  const siteUrl = process.env.SITE_URL || (live ? base : '');
  const routes = siteUrl ? publicRoutes(await read('prerender-routes.xml'), siteUrl, () => {}) : [];
  for (const kind of ['books', 'page', 'collections']) {
    const route = routes.find(r => r.startsWith(`/${kind}/`) && existsSync(resolve(dist, routeOutputPath(r))));
    if (!route) continue;
    const snapshot = await read(routeOutputPath(route));
    await check(route, { ...page, body: snapshot, bodyName: `the prerendered ${routeOutputPath(route)}` });
    await check(route + '/', { status: 301, location: route });
    await check(route + '.html', { status: 301, location: route });
  }
}

// App routes without a prerendered page get the app shell with 200.
for (const path of ['/books/zz-hosting-smoke-not-a-book', '/account', '/account/orders', '/admin', '/checkout?cartId=smoke', '/track?orderId=smoke&key=smoke', '/wishlist']) {
  await check(path, appShell);
}
// Unknown URLs: a real 404 that still boots the app (editable missing page; Studio previews it too).
for (const path of ['/no-such-page-hosting-smoke', '/studio-missing-page?preview=true']) {
  await check(path, { status: 404, body: shell, bodyName: 'the app shell (404.html)', security: true });
}
await check('/spa', { status: 200, noindex: true });

// Hashed assets: immutable; a missing one is a 404, never HTML with 200.
const manifest = existsSync(resolve(dist, 'asset-manifest.txt')) ? parseAssetManifest(await read('asset-manifest.txt')) : [];
const assets = manifest.length ? manifest : (await readdir(resolve(dist, 'assets'))).sort();
const asset = assets.find(name => name.endsWith('.js')) || assets[0];
if (asset) await check(`/assets/${asset}`, { status: 200, cache: 'immutable', security: true });
await check('/assets/hosting-smoke-missing.js', { status: 404 });

// Files the deploy workflow and search engines read back from the live site.
if (existsSync(resolve(dist, 'seo-published-fingerprint.txt'))) {
  const fingerprint = (await read('seo-published-fingerprint.txt')).trim();
  if (!isFingerprint(fingerprint)) failures.push('dist/seo-published-fingerprint.txt is not a SHA-256 fingerprint');
  await check('/seo-published-fingerprint.txt', { status: 200, cache: 'no-cache', match: new RegExp(`^${fingerprint}\\s*$`) });
}
for (const file of ['sitemap.xml', 'robots.txt', 'google-merchant-feed.xml']) {
  if (existsSync(resolve(dist, file))) await check(`/${file}`, { status: 200, cache: 'no-cache' });
}

// The project's other default address must hand visitors to the canonical one.
if (live && new URL(base).hostname === `${FIREBASE_PROJECT}.web.app`) {
  await check('firebaseapp.com /', { url: `https://${FIREBASE_PROJECT}.firebaseapp.com/`, status: 200, contains: 'moveToCanonicalHost' });
}

if (failures.length) {
  console.error(`Firebase Hosting check failed (${failures.length} of ${checked} checks) at ${base}:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`Firebase Hosting check passed: ${checked} checks at ${base}.`);
