#!/usr/bin/env node
// IndexNow: after each storefront deploy, tell Bing (and the other IndexNow engines: Yandex, Seznam, Naver…) which
// pages changed, so new books, price and stock changes reach Bing, Copilot and ChatGPT search within minutes instead
// of waiting for the next crawl. Google does not use IndexNow; it reads the sitemap's lastmod.
//
//   node scripts/indexnow.mjs save   --base <SITE_URL> --out <file>    # before deploy: keep the live sitemap
//   node scripts/indexnow.mjs submit --base <SITE_URL> --sitemap dist/sitemap.xml --previous <file>
//
// Only pages that are new, removed, or whose lastmod moved are sent. With no saved sitemap (the first deploy that
// serves the key file, or the live site unreachable) every page is sent once. Never fails a deploy: problems are
// printed as warnings. The key is public by design: the engines fetch /<key>.txt to check the site owns it.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const INDEXNOW_KEY = '6bca1211954773a458810db5d929ffce';
export const ENDPOINT = 'https://api.indexnow.org/indexnow';

/** loc → lastmod ('' when missing) for every <url> in a sitemap. */
export function sitemapEntries(xml) {
  const out = new Map();
  for (const block of String(xml || '').match(/<url>[\s\S]*?<\/url>/g) || []) {
    const loc = block.match(/<loc>\s*([^<]+?)\s*<\/loc>/)?.[1];
    if (!loc) continue;
    out.set(loc.replace(/&amp;/g, '&'), block.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/)?.[1] || '');
  }
  return out;
}

/** Pages to announce: new or re-dated pages, plus pages that left the sitemap (the engines then see their 404).
 *  `previous` null = nothing to compare with, so every current page. Only addresses on `base`'s host. */
export function changedUrls(currentXml, previousXml, base) {
  const host = new URL(base).host;
  const current = sitemapEntries(currentXml);
  const previous = previousXml == null ? null : sitemapEntries(previousXml);
  const urls = previous
    ? [...[...current].filter(([loc, lastmod]) => previous.get(loc) !== lastmod).map(([loc]) => loc), ...[...previous.keys()].filter(loc => !current.has(loc))]
    : [...current.keys()];
  return [...new Set(urls)].filter(url => { try { return new URL(url).host === host; } catch { return false; } }).slice(0, 10000);
}

export function payload(urls, base) {
  const origin = new URL(base).origin;
  return { host: new URL(base).host, key: INDEXNOW_KEY, keyLocation: `${origin}/${INDEXNOW_KEY}.txt`, urlList: urls };
}

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'lyricalmyrical-indexnow' } });
  return response.ok ? response.text() : null;
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const base = (option('--base') || process.env.SITE_URL || '').replace(/\/+$/, '');
  if (!/^https:\/\/[^/]+$/.test(base)) return console.warn(`::warning::IndexNow skipped: no site address (${base || 'empty'}).`);
  if (/\.(web\.app|firebaseapp\.com)$/.test(new URL(base).host)) return console.log('IndexNow skipped: the default Firebase address is not the public one.');
  if (mode === 'save') {
    const out = option('--out');
    // Compare with the live sitemap only once the live site serves the key; before that, the first submit sends all.
    const key = await fetchText(`${base}/${INDEXNOW_KEY}.txt`).catch(() => null);
    const xml = key?.trim() === INDEXNOW_KEY ? await fetchText(`${base}/sitemap.xml`).catch(() => null) : null;
    if (xml && out) writeFileSync(out, xml);
    return console.log(xml ? `Saved the live sitemap (${sitemapEntries(xml).size} pages).` : 'No live sitemap to compare with: every page will be sent.');
  }
  if (mode !== 'submit') throw new Error('usage: indexnow.mjs save|submit');
  const previousFile = option('--previous');
  const previous = previousFile && existsSync(previousFile) ? readFileSync(previousFile, 'utf8') : null;
  const urls = changedUrls(readFileSync(option('--sitemap') || 'dist/sitemap.xml', 'utf8'), previous, base);
  if (!urls.length) return console.log('IndexNow: no page changed.');
  const response = await fetch(ENDPOINT, {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload(urls, base)),
  });
  // 200 = received, 202 = received, key check pending. Anything else is reported, never fatal.
  if (response.status === 200 || response.status === 202) console.log(`IndexNow: sent ${urls.length} page(s) (${response.status}).\n${urls.join('\n')}`);
  else console.warn(`::warning::IndexNow answered ${response.status} for ${urls.length} page(s): ${(await response.text()).slice(0, 300)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => console.warn(`::warning::IndexNow skipped: ${error?.message || error}`));
}
