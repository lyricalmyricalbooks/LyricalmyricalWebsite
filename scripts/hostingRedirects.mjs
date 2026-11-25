#!/usr/bin/env node
// URL redirects answered by Firebase Hosting itself (a real 301), the way Shopify serves its URL redirects. The owner's
// list (Settings › General › URL redirects, and the automatic ones added when a book or page changes address) lives in
// the public settings/redirects doc; the storefront follows it in the browser (useMissingRedirect), which search
// engines only see after running the page. The build writes the Hosting form of the list to dist/hosting-redirects.json
// (generate-sitemap.mjs); both Hosting jobs then run this file to add it to firebase.json before the emulator check and
// the deploy. Any problem leaves firebase.json as committed: the shop still deploys and the browser fallback still works.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const HOSTING_REDIRECTS_FILE = 'hosting-redirects.json';
/** Firebase Hosting accepts at most 1,000 redirects per site; keep room for the committed ones. */
export const MAX_HOSTING_REDIRECTS = 900;

const RESERVED = /^\/(admin|checkout|track|account|wishlist|cart|assets|spa|404)(\/|$|\.)/;
// On-site paths the list may claim: no query, hash, whitespace or control characters (and so nothing that could break
// out of the JSON or the RE2 pattern).
const SAFE_PATH = /^\/[^\s?#\\\u0000-\u001f]*$/;

const escapeRe = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Shoppers and old links mix capitals ("/product/Archaeology_of_Presence"); the list stores lower case. Match each
// letter either way with a character class, which RE2 (live) and JavaScript (emulator) read the same.
const anyCase = text => escapeRe(text).replace(/[a-z]/g, c => `[${c}${c.toUpperCase()}]`);
const rulePattern = path => `^${anyCase(path)}$`;
/** The lower-case address a rule from `hostingRedirects` matches (for the smoke check). */
export const rulePath = regex => String(regex).slice(1, -1).replace(/\[([a-z])[A-Z]\]/g, '$1').replace(/\\(.)/g, '$1');

/** "/Books/Old/" → "/books/old"; "" when it isn't an on-site path. Same rule as normalizePath in features/site/redirects.ts. */
export function hostingPath(input) {
  let s = String(input || '').trim();
  if (!s.startsWith('/') || s.startsWith('//')) return '';
  s = s.replace(/[?#].*$/, '').replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  try { s = decodeURI(s); } catch { /* keep as typed */ }
  s = s.toLowerCase();
  return s && SAFE_PATH.test(s) ? s : '';
}

function hostingTarget(input) {
  const s = String(input || '').trim();
  if (/^https:\/\/[^/\s:]+(\/[^\s]*)?$/i.test(s) && !s.slice(8).includes(':')) return s;
  if (s.startsWith('/') && !s.startsWith('//') && /^\/[^\s:\\]*$/.test(s)) return s;
  return '';
}

/**
 * The Hosting redirect rules for the owner's list. `livePaths` are the shop's real pages (published books, pages and
 * collections, lower case): a redirect never takes over a page that exists, matching the browser rule that only a
 * missing page follows one. Chains are left as they are (the browser and Google both follow a few hops).
 */
export function hostingRedirects(list, livePaths = []) {
  const live = new Set([...livePaths].map(hostingPath).filter(Boolean));
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const from = hostingPath(item?.from);
    const destination = hostingTarget(item?.to);
    if (!from || from === '/' || !destination || RESERVED.test(from) || live.has(from) || seen.has(from)) continue;
    if (!/^https:/i.test(destination) && hostingPath(destination) === from) continue;
    seen.add(from);
    out.push({ regex: rulePattern(from), destination, type: 301 });
    if (out.length >= MAX_HOSTING_REDIRECTS) break;
  }
  return out;
}

/** firebase.json with the rules added after the committed redirects; a committed rule for the same address wins. */
export function withHostingRedirects(config, rules) {
  const hosting = config?.hosting;
  if (!hosting || !Array.isArray(rules) || !rules.length) return config;
  const committed = Array.isArray(hosting.redirects) ? hosting.redirects : [];
  const taken = new Set(committed.map(rule => hostingPath(rule.source)).filter(Boolean).map(rulePattern));
  const added = rules.filter(rule => !taken.has(rule.regex));
  return { ...config, hosting: { ...hosting, redirects: [...committed, ...added] } };
}

// node scripts/hostingRedirects.mjs [dist/hosting-redirects.json] [firebase.json]
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [listFile = `dist/${HOSTING_REDIRECTS_FILE}`, configFile = 'firebase.json'] = process.argv.slice(2);
  try {
    if (!existsSync(listFile)) {
      console.log(`No ${listFile}; firebase.json keeps its committed redirects.`);
    } else {
      const rules = JSON.parse(readFileSync(listFile, 'utf8'));
      if (!Array.isArray(rules) || rules.some(rule => !rule || typeof rule.regex !== 'string' || typeof rule.destination !== 'string' || rule.type !== 301)) {
        throw new Error(`${listFile} is not a list of redirect rules`);
      }
      const config = JSON.parse(readFileSync(configFile, 'utf8'));
      const next = withHostingRedirects(config, rules);
      const count = (next.hosting?.redirects?.length || 0) - (config.hosting?.redirects?.length || 0);
      if (count > 0) writeFileSync(configFile, JSON.stringify(next, null, 2) + '\n');
      console.log(`Hosting answers ${count} URL redirect${count === 1 ? '' : 's'} from Settings › General › URL redirects.`);
    }
  } catch (error) {
    console.log(`::warning::URL redirects were not added to Hosting (${error.message}); the shop still forwards them in the browser.`);
  }
}
