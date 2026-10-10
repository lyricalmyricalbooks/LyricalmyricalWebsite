import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The shop's public address is written down in several places (Vite base, build scripts, the app shell and the
// Cloud Functions that put links in emails). After the repository rename (October 2026) they disagreed, which
// left the live site unstyled and email links pointing at a dead address. Keep every default identical.
const root = join(__dirname, '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const defaultUrl = (file: string) => {
  const match = read(file).match(/SITE_URL \|\| ["'](https:\/\/[^"']+)["']/);
  if (!match) throw new Error(`No SITE_URL default in ${file}`);
  return match[1].replace(/\/+$/, '');
};

describe('one site address everywhere', () => {
  const viteBase = read('vite.config.ts').match(/SITE_BASE \?\? '([^']+)'/)?.[1];
  const files = ['functions/index.js', 'vite.config.ts', 'scripts/generate-sitemap.mjs', 'scripts/prerender-storefront.mjs', 'scripts/check-published-change.mjs', 'scripts/carry-previous-assets.mjs'];

  it('every SITE_URL default matches the Vite base', () => {
    expect(viteBase).toMatch(/^\/.*\/$/);
    for (const file of files) expect(new URL(defaultUrl(file)).pathname + '/', file).toBe(viteBase);
  });

  it('every SITE_URL default is the same address', () => {
    expect(new Set(files.map(defaultUrl)).size).toBe(1);
  });

  it('the app shell links to that address', () => {
    const url = defaultUrl('functions/index.js') + '/';
    const shell = read('index.html');
    expect(shell).toContain(`<meta property="og:url" content="${url}" />`);
    expect(shell).toContain(`"url": "${url}"`);
  });

  it('the Cloud Functions accept browser calls from every address the shop is built for', () => {
    const functions = read('functions/index.js');
    const allowed = functions.slice(functions.indexOf('const ALLOWED_ORIGINS'), functions.indexOf('];', functions.indexOf('const ALLOWED_ORIGINS')));
    const hostingUrl = read('.github/workflows/deploy-pages.yml').match(/SITE_URL: (https:\/\/\S+)/)?.[1];
    expect(hostingUrl, 'the Firebase Hosting job sets SITE_URL').toBeTruthy();
    for (const url of [defaultUrl('functions/index.js'), hostingUrl!]) expect(allowed).toContain(`"${new URL(url).origin}"`);
  });
});
