import { bookInCategory, normalizeCategories } from '../src/app/features/site/categoryMembership.mjs';
import { safeSlug } from './routeSafety.mjs';
import { effectivePublishedSettings, releaseArrived } from './publicStorefrontData.mjs';
import { resolveProductRoutes } from '../src/app/features/site/productRouteData.mjs';
import { artistDirectory } from '../src/app/features/site/artistPages.mjs';
const escapeXml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const absoluteUrl = (value, base) => {
  if (typeof value !== 'string' || !value.trim() || value.startsWith('data:')) return '';
  try { const url = new URL(value.trim(), base); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch { return ''; }
};
/** The latest YYYY-MM-DD among ISO date strings, or undefined. */
const newestDate = values => values.map(value => typeof value === 'string' ? value.slice(0, 10) : '').filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort().pop();
const slugify = (value = '') => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
/** The collection pages the shop shows (Studio categories in the menu), each with its slug, name, description and
 *  published books. Shared by the sitemap and /llms.txt so both always list the same pages. */
export function listedCollections(live, settings = {}, { includeEmptyCollections = false, nowISO = new Date().toISOString() } = {}) {
  // Collection pages resolve Studio category names, not a separate Firestore collection.
  const design = effectivePublishedSettings(settings, nowISO).design || {};
  const categorySource = design.categories ?? design.storefront?.categories ?? design.heroPage?.categories ?? [];
  const categories = normalizeCategories(Array.isArray(categorySource) ? categorySource : []);
  const out = [];
  for (const category of categories) {
    if (category?.showInNav === false) continue;
    const members = live.filter(book => book.status === 'published' && bookInCategory(book, category, categories));
    if (!includeEmptyCollections && !members.length) continue;
    if (category?.parentId && categories.some(parent => parent?.id === category.parentId && parent.showInNav === false)) continue;
    const name = typeof category === 'string' ? category : category?.name;
    const slug = slugify(name);
    if (slug && !out.some(entry => entry.slug === slug)) out.push({ slug, name: String(name), description: typeof category?.description === 'string' ? category.description : '', books: members });
  }
  return out;
}
export function sitemapArtifacts(siteUrl, books, pages, collections, settings = {}, { includeEmptyCollections = false } = {}) {
  const base = siteUrl.replace(/\/$/, '');
  const urls = [{ loc: base + '/' }];
  // Same live-book set (and so the same collision-safe slugs) as the storefront's useSiteData / isLiveBook.
  const nowISO = new Date().toISOString();
  const live = books.filter(book => (!book.status || book.status === 'published') && releaseArrived(book.scheduleDate, nowISO));
  for (const book of resolveProductRoutes(live)) {
    if (book.seoNoindex === true) continue;
    // A free-text slug the prerender cannot write as a file stays out of the sitemap (the book still works in the app).
    if (!safeSlug(book.slug)) { console.warn(`::warning::Book "${book.id}" has an unsafe URL slug and is left out of the sitemap: ${book.slug}`); continue; }
    // Google Images is a main way people find photo and art books: list each listing's photos.
    const images = [...new Set((Array.isArray(book.photos) ? book.photos : []).map(photo => absoluteUrl(photo?.url, base + '/')).filter(Boolean))].slice(0, 10);
    urls.push({ loc: `${base}/books/${encodeURIComponent(book.slug)}`, lastmod: book.updatedAt || book._updateTime, images });
  }
  // Artist pages (/artists/<slug>): one per photographer credited on a live book, so a search for their name has a
  // page to find. Same directory as the shop's ArtistPage; group credits ("Various artists") give none.
  for (const artist of artistDirectory(resolveProductRoutes(live)).values()) {
    if (!safeSlug(artist.slug)) continue;
    const lastmod = artist.books.map(book => book.updatedAt || book._updateTime).filter(value => typeof value === 'string').sort().pop();
    urls.push({ loc: `${base}/artists/${encodeURIComponent(artist.slug)}`, lastmod });
  }
  for (const page of pages) {
    if (page.status !== 'published' || !page.slug) continue;
    if (!safeSlug(page.slug)) { console.warn(`::warning::Page "${page.id}" has an unsafe URL slug and is left out of the sitemap: ${page.slug}`); continue; }
    urls.push({ loc: `${base}/page/${encodeURIComponent(page.slug)}`, lastmod: page.updatedAt || page._updateTime });
  }
  // Store policies (Settings › General › Store policies) are public pages too; card networks and Google
  // must reach the refund and terms pages as real 200 documents.
  for (const key of ['shipping', 'returns', 'privacy', 'terms']) {
    const text = settings?.policies?.[key];
    if (typeof text === 'string' && text.trim()) urls.push({ loc: `${base}/page/policy-${key}` });
  }
  for (const collection of listedCollections(live, settings, { includeEmptyCollections, nowISO })) {
    // A collection page lists its books, so it changes when the newest of them does.
    urls.push({ loc: `${base}/collections/${encodeURIComponent(collection.slug)}`, lastmod: newestDate(collection.books.map(book => book.updatedAt || book._updateTime)) });
  }
  const unique = [...new Map(urls.map(url => [url.loc, url])).values()];
  // The home page lists every book and page, so it changes whenever they do.
  const newest = newestDate(unique.map(url => url.lastmod));
  if (newest) unique[0] = { ...unique[0], lastmod: newest };
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' + unique.map(url => {
    const date = typeof url.lastmod === 'string' ? url.lastmod.slice(0, 10) : '';
    const lastmod = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `\n    <lastmod>${date}</lastmod>` : '';
    const images = (url.images || []).map(image => `\n    <image:image>\n      <image:loc>${escapeXml(image)}</image:loc>\n    </image:image>`).join('');
    return `  <url>\n    <loc>${escapeXml(url.loc)}</loc>${lastmod}${images}\n  </url>`;
  }).join('\n') + '\n</urlset>\n';
  const path = new URL(base).pathname.replace(/\/$/, '');
  // /cart is left crawlable on purpose: it answers with noindex (header + meta), which Google can only see
  // on a URL robots.txt lets it fetch.
  const robots = 'User-agent: *\nAllow: /\n' + ['admin', 'checkout', 'account', 'wishlist', 'track'].map(route => `Disallow: ${path}/${route}\n`).join('') + `\nSitemap: ${base}/sitemap.xml\n`;
  return { xml, robots, count: unique.length };
}
