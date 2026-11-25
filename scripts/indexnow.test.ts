import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { changedUrls, INDEXNOW_KEY, payload, sitemapEntries } from './indexnow.mjs';

const sitemap = (rows: [string, string?][]) => `<?xml version="1.0"?>\n<urlset>\n${rows.map(([loc, lastmod]) => `  <url>\n    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n    <image:image><image:loc>https://img.example/a.jpg?x=1&amp;y=2</image:loc></image:image>\n  </url>`).join('\n')}\n</urlset>`;
const base = 'https://shop.example';

describe('IndexNow', () => {
  it('reads each page and its lastmod, not the image addresses', () => {
    expect([...sitemapEntries(sitemap([[`${base}/`, '2026-11-25'], [`${base}/books/a`]]))]).toEqual([[`${base}/`, '2026-11-25'], [`${base}/books/a`, '']]);
  });
  it('sends only new, re-dated and removed pages', () => {
    const before = sitemap([[`${base}/`, '2026-11-20'], [`${base}/books/a`, '2026-11-01'], [`${base}/books/gone`, '2026-10-01']]);
    const after = sitemap([[`${base}/`, '2026-11-25'], [`${base}/books/a`, '2026-11-01'], [`${base}/books/new`, '2026-11-25']]);
    expect(changedUrls(after, before, base)).toEqual([`${base}/`, `${base}/books/new`, `${base}/books/gone`]);
    expect(changedUrls(after, after, base)).toEqual([]);
  });
  it('sends every page when there is nothing to compare with, and never another host', () => {
    expect(changedUrls(sitemap([[`${base}/`], ['https://other.example/x']]), null, base)).toEqual([`${base}/`]);
  });
  it('names the key file the engines check, which the site serves', () => {
    expect(payload([`${base}/`], base)).toEqual({ host: 'shop.example', key: INDEXNOW_KEY, keyLocation: `${base}/${INDEXNOW_KEY}.txt`, urlList: [`${base}/`] });
    const file = new URL(`../public/${INDEXNOW_KEY}.txt`, import.meta.url);
    expect(existsSync(file) && readFileSync(file, 'utf8')).toBe(INDEXNOW_KEY);
  });
});
