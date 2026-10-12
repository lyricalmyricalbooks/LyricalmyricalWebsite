import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// firebase.json decides how Firebase Hosting answers every storefront URL. Its rules are anchored regular
// expressions (Firebase evaluates them with RE2) so this test can run them exactly as written. The Hosting emulator
// check (scripts/hosting-smoke.mjs, in CI and before each deploy) covers what the live server does with them.
const root = join(__dirname, '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const hosting = JSON.parse(read('firebase.json')).hosting;
const rewrites: { regex?: string; source?: string; destination: string }[] = hosting.rewrites;
const headerRules: { regex?: string; source?: string; headers: { key: string; value: string }[] }[] = hosting.headers;
const rewriteFor = (path: string) => rewrites.find(rule => new RegExp(rule.regex!).test(path));
const headersFor = (path: string) => headerRules.filter(rule => new RegExp(rule.regex!).test(path)).flatMap(rule => rule.headers);

// Every <Route path> in App.tsx, made concrete (":slug" → a sample slug, "/*" → the bare path and a sub-page).
const appRoutes = [...read('src/app/App.tsx').matchAll(/<Route path="([^"]+)"/g)].map(match => match[1]);
const concrete = (route: string) => {
  const path = route.replace(/:[^/]+/g, 'sample-slug');
  return path.endsWith('/*') ? [path.slice(0, -2), path.slice(0, -2) + '/orders'] : [path];
};

describe('Firebase Hosting serves every storefront route (firebase.json)', () => {
  it('uses only anchored RE2-compatible regexes', () => {
    for (const rule of [...rewrites, ...headerRules]) {
      expect(rule.source, 'use "regex" so these tests can evaluate the rule').toBeUndefined();
      expect(rule.regex).toMatch(/^\^.*\$$/);
      expect(rule.regex, 'RE2 has no lookaround or backreferences').not.toMatch(/\(\?[=!<]|\\[1-9]/);
    }
  });

  it('sends every app route without its own file to the app shell', () => {
    expect(appRoutes.length).toBeGreaterThan(5);
    for (const route of appRoutes.filter(r => r !== '/' && r !== '*')) {
      for (const path of concrete(route)) expect(rewriteFor(path)?.destination, path).toBe('/spa.html');
    }
    // A book page published after the last build, with or without a trailing slash, still opens.
    expect(rewriteFor('/books/new-title/')?.destination).toBe('/spa.html');
  });

  it('has no catch-all: unknown URLs fall to 404.html (the app shell) with a real 404 status', () => {
    for (const path of ['/', '/no-such-page', '/studio-missing-page', '/assets/missing.js', '/seo-published-fingerprint.txt', '/books', '/books/a/b']) {
      expect(rewriteFor(path), path).toBeUndefined();
    }
  });

  it('serves prerendered books/<slug>.html at the slash-less address and keeps .well-known files', () => {
    expect(hosting.public).toBe('dist');
    expect(hosting.cleanUrls).toBe(true);
    expect(hosting.trailingSlash).toBe(false);
    expect(hosting.ignore ?? []).not.toContain('**/.*');
  });

  const samples = ['/', '/index.html', '/books/x', '/books/a.b', '/books/x.html', '/collections/x', '/page/about', '/account', '/account/orders',
    '/admin', '/checkout', '/track', '/wishlist', '/spa', '/404', '/assets/index-Ab12.js', '/assets/index-Ab12.css', '/sitemap.xml', '/robots.txt',
    '/google-merchant-feed.xml', '/seo-published-fingerprint.txt', '/asset-manifest.txt'];

  it('never gives one URL two different values for the same header', () => {
    for (const path of samples) {
      const seen = new Map<string, string>();
      for (const { key, value } of headersFor(path)) {
        const name = key.toLowerCase();
        if (seen.has(name)) expect(value, `${path}: ${key}`).toBe(seen.get(name));
        seen.set(name, value);
      }
    }
  });

  it('caches hashed assets for a year and revalidates everything else', () => {
    const cache = (path: string) => headersFor(path).find(h => h.key === 'Cache-Control')?.value;
    for (const path of samples) {
      if (path.startsWith('/assets/')) expect(cache(path), path).toContain('immutable');
      else expect(cache(path), path).toBe('no-cache');
    }
  });

  it('sends the security headers everywhere, allowing only same-origin framing (Studio previews the shop in a frame)', () => {
    for (const path of samples) {
      const headers = Object.fromEntries(headersFor(path).map(h => [h.key, h.value]));
      expect(headers['X-Content-Type-Options'], path).toBe('nosniff');
      expect(headers['Referrer-Policy'], path).toBe('strict-origin-when-cross-origin');
      expect(headers['X-Frame-Options'], path).toBe('SAMEORIGIN');
      expect(headers['Content-Security-Policy'], 'a strict CSP would break Studio, custom code and Stripe').toBeUndefined();
      expect(headers['Cross-Origin-Opener-Policy'], 'Google sign-in uses popups').toBeUndefined();
    }
  });

  it('keeps the bare app shell out of search results, and lets search engines list the shop', () => {
    for (const path of ['/spa', '/404']) expect(headersFor(path).find(h => h.key === 'X-Robots-Tag')?.value, path).toBe('noindex');
    for (const path of samples.filter(p => !/^\/(spa|404)$/.test(p))) {
      expect(headersFor(path).find(h => h.key === 'X-Robots-Tag'), path).toBeUndefined();
    }
  });
});

describe('deploy workflows agree', () => {
  it('waits for the backend deploy on exactly the paths deploy-firebase.yml watches', () => {
    const firebaseYml = read('.github/workflows/deploy-firebase.yml');
    const paths = firebaseYml.slice(firebaseYml.indexOf('paths:'), firebaseYml.indexOf('workflow_dispatch:'))
      .split('\n').map(line => line.match(/^\s+-\s+"?([^"]+?)"?\s*$/)?.[1]).filter(Boolean) as string[];
    const asRegex = paths.map(p => p.replace(/\./g, '\\.').replace(/\/\*\*$/, '/.*')).sort();
    const watched = read('.github/workflows/deploy-pages.yml').match(/WATCHED='\^\(([^']+)\)\$'/)?.[1];
    expect(watched?.split('|').sort()).toEqual(asRegex);
  });

  it('pins one firebase-tools version in every workflow that runs it', () => {
    const versions = ['deploy-firebase.yml', 'deploy-pages.yml', 'ci.yml'].map(file => read(`.github/workflows/${file}`).match(/FIREBASE_TOOLS_VERSION: (\S+)/)?.[1]);
    expect(versions[0]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(new Set(versions).size).toBe(1);
  });

  it('GitHub Pages only gets the forwarding pages, and only after the shop itself deployed', () => {
    const storefront = read('.github/workflows/deploy-pages.yml');
    const uploads = [...storefront.matchAll(/upload-pages-artifact@\S+\s+with:\s+path: (\S+)/g)].map(m => m[1]);
    expect(uploads).toEqual(['./pages-redirect']);
    const redirectJob = storefront.slice(storefront.indexOf('  redirect-old-address:'));
    expect(redirectJob).toMatch(/needs: \[build-hosting, deploy-hosting\]/);
    expect(redirectJob).toMatch(/if: github\.event_name != 'schedule'/);
  });

  it('never deploys Hosting from the backend workflow, nor the backend from the storefront one', () => {
    expect(read('.github/workflows/deploy-firebase.yml')).not.toMatch(/--only[^\n]*hosting/);
    for (const line of read('.github/workflows/deploy-pages.yml').split('\n').filter(l => l.includes('--only'))) {
      expect(line).toMatch(/--only hosting\b/);
    }
  });

  it('never cancels runs on main, and the storefront deploy skips superseded commits instead', () => {
    for (const file of ['ci.yml', 'deploy-pages.yml', 'deploy-firebase.yml']) {
      expect(read(`.github/workflows/${file}`)).not.toMatch(/cancel-in-progress: (true|\$\{\{ github\.event_name != )/);
    }
    const storefront = read('.github/workflows/deploy-pages.yml');
    expect(storefront).toMatch(/superseded: \$\{\{ steps\.newest\.outputs\.superseded \}\}/);
    expect(storefront).toMatch(/needs\.deploy-hosting\.outputs\.deployed == 'true'/);
  });

  it('builds while the backend deploys, but publishes only after firebase-first succeeded', () => {
    const storefront = read('.github/workflows/deploy-pages.yml');
    const job = (name: string) => storefront.slice(storefront.indexOf(`  ${name}:`)).split(/\n  [a-z-]+:\n/)[0];
    expect(job('build-hosting')).toMatch(/needs: newest\n/);
    expect(job('deploy-hosting')).toMatch(/needs: \[build-hosting, firebase-first\]/);
    expect(job('deploy-hosting')).toMatch(/needs\.firebase-first\.result == 'success'/);
    expect(job('deploy-hosting')).not.toMatch(/actions\/cache/);
  });
});
