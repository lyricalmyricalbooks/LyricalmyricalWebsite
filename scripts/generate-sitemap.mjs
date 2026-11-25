#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sitemapArtifacts } from './sitemapData.mjs';
import { readPublicStorefront, publishedFingerprint, effectivePublishedSettings, releaseArrived } from './publicStorefrontData.mjs';
import { resolveProductRoutes } from '../src/app/features/site/productRouteData.mjs';
import { llmsTxt } from './llmsTxt.mjs';
import { HOSTING_REDIRECTS_FILE, hostingRedirects } from './hostingRedirects.mjs';
import { FEED_FILE, merchantFeedItems, merchantFeedXml } from '../src/app/features/site/merchantFeed.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const siteUrl = process.env.SITE_URL || 'https://lyricalmyrical-web-v2.web.app';
const { books, pages, settings, reviews, redirects } = await readPublicStorefront();
const indexed = sitemapArtifacts(siteUrl, books, pages, [], settings);
// Keep noindex public listings crawlable so Google can read their robots tags.
const rendered = sitemapArtifacts(siteUrl, books.map(book => ({ ...book, seoNoindex: false })), pages.map(page => ({ ...page, seoNoindex: false })), [], settings, { includeEmptyCollections: true });
for (const directory of ['dist', 'public']) {
  mkdirSync(resolve(root, directory), { recursive: true });
  writeFileSync(resolve(root, directory, 'sitemap.xml'), indexed.xml);
  writeFileSync(resolve(root, directory, 'robots.txt'), indexed.robots);
}
writeFileSync(resolve(root, 'dist/prerender-routes.xml'), rendered.xml);
writeFileSync(resolve(root, 'dist/seo-published-fingerprint.txt'), publishedFingerprint({ books, pages, settings, reviews, redirects }) + '\n');
// Google Merchant Center fetches this file (Books › Google Shopping feed shows its address).
const design = effectivePublishedSettings(settings).design || {};
const shopName = (typeof design.copy?.siteName === 'string' && design.copy.siteName.trim()) || (typeof design.siteName === 'string' && design.siteName.trim()) || 'Lyricalmyrical Books';
const feed = merchantFeedItems(siteUrl, books, { shopName });
mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist', FEED_FILE), merchantFeedXml(siteUrl, feed.items, { shopName }));
// AI assistants and AI search read /llms.txt for a plain summary of the shop and its books.
writeFileSync(resolve(root, 'dist', 'llms.txt'), llmsTxt(siteUrl, books, pages, settings, { shopName }));
// URL redirects as Hosting rules; the deploy adds them to firebase.json (scripts/hostingRedirects.mjs).
// A redirect never covers a live book or page, including ones the sitemap leaves out (unsafe slugs).
const liveBooks = resolveProductRoutes(books.filter(book => (!book.status || book.status === 'published') && releaseArrived(book.scheduleDate, new Date().toISOString())));
const livePaths = [...rendered.paths, ...liveBooks.map(book => `/books/${book.slug}`), ...pages.filter(page => page.status === 'published' && page.slug).map(page => `/page/${page.slug}`)];
const hostingRules = hostingRedirects(redirects, livePaths);
writeFileSync(resolve(root, 'dist', HOSTING_REDIRECTS_FILE), JSON.stringify(hostingRules, null, 2) + '\n');
console.log(`URL redirects for Hosting: ${hostingRules.length} of ${redirects.length}.`);
console.log(`Google Shopping feed: ${feed.items.length} items, ${feed.skipped.length} published books left out.`);
console.log(`Generated ${indexed.count} indexable URLs and ${rendered.count} public HTML routes.`);
