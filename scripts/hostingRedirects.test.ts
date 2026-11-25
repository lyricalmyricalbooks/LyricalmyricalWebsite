import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { hostingPath, hostingRedirects, rulePath, withHostingRedirects } from './hostingRedirects.mjs';
import { publishedFingerprint } from './publicStorefrontData.mjs';

const matches = (rule: { regex: string }, path: string) => new RegExp(rule.regex).test(path);

describe('URL redirects answered by Hosting', () => {
  it('turns the owner list into anchored, any-case 301 rules', () => {
    const [rule] = hostingRedirects([{ from: '/books/old-title', to: '/books/new-title' }]);
    expect(rule).toEqual({ regex: expect.stringMatching(/^\^.*\$$/), destination: '/books/new-title', type: 301 });
    expect(matches(rule, '/books/old-title')).toBe(true);
    expect(matches(rule, '/Books/Old-Title')).toBe(true);
    expect(matches(rule, '/books/old-title-2')).toBe(false);
    expect(matches(rule, '/x/books/old-title')).toBe(false);
    expect(rulePath(rule.regex)).toBe('/books/old-title');
  });

  it('escapes characters that mean something in a pattern', () => {
    const [rule] = hostingRedirects([{ from: '/old.page(1)', to: '/page/new' }]);
    expect(matches(rule, '/old.page(1)')).toBe(true);
    expect(matches(rule, '/oldxpage1')).toBe(false);
    expect(rulePath(rule.regex)).toBe('/old.page(1)');
  });

  it('never takes over a real page, the shop’s own routes, or itself', () => {
    const rules = hostingRedirects([
      { from: '/books/live', to: '/books/other' },
      { from: '/checkout', to: '/books/a' },
      { from: '/', to: '/books/a' },
      { from: '/books/same', to: '/Books/Same/' },
      { from: '/ok', to: 'javascript:alert(1)' },
      { from: '/ok', to: 'http://insecure.example' },
      { from: '/ok', to: '//evil.example' },
      { from: '/books/dupe', to: '/books/a' },
      { from: '/Books/Dupe/', to: '/books/b' },
    ], ['/books/live']);
    expect(rules.map(r => rulePath(r.regex))).toEqual(['/books/dupe']);
    expect(rules[0].destination).toBe('/books/a');
  });

  it('keeps full https links and query strings on the new address', () => {
    expect(hostingRedirects([{ from: '/press', to: 'https://example.com/review' }, { from: '/sale', to: '/collections/all?sort=price' }]).map(r => r.destination))
      .toEqual(['https://example.com/review', '/collections/all?sort=price']);
  });

  it('normalises old addresses like the storefront does', () => {
    expect(hostingPath('/Books/Old/?utm=1#x')).toBe('/books/old');
    expect(hostingPath('/books/caf%C3%A9')).toBe('/books/café');
    expect(hostingPath('books/old')).toBe('');
    expect(hostingPath('/a b')).toBe('');
  });

  it('adds the rules after the committed ones, and a committed address wins', () => {
    const config = { hosting: { site: 's', redirects: [{ source: '/product/Old', destination: 'https://shop/books/x', type: 301 }] } };
    const rules = hostingRedirects([{ from: '/product/old', to: '/books/y' }, { from: '/books/a', to: '/books/b' }]);
    const next = withHostingRedirects(config, rules);
    expect(next.hosting.redirects).toEqual([config.hosting.redirects[0], rules[1]]);
    expect(next.hosting.site).toBe('s');
    expect(withHostingRedirects(config, [])).toBe(config);
  });

  it('the command merges into firebase.json, and leaves it alone when the list is bad or missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hosting-redirects-'));
    const config = join(dir, 'firebase.json'), list = join(dir, 'list.json');
    const original = JSON.stringify({ hosting: { redirects: [] } });
    const run = () => execFileSync(process.execPath, [join(__dirname, 'hostingRedirects.mjs'), list, config], { encoding: 'utf8' });
    writeFileSync(config, original);
    expect(run()).toMatch(/No .*list\.json/);
    writeFileSync(list, '{"not":"a list"}');
    expect(run()).toMatch(/::warning::/);
    expect(readFileSync(config, 'utf8')).toBe(original);
    writeFileSync(list, JSON.stringify(hostingRedirects([{ from: '/books/a', to: '/books/b' }])));
    expect(run()).toMatch(/answers 1 URL redirect\b/);
    expect(JSON.parse(readFileSync(config, 'utf8')).hosting.redirects).toHaveLength(1);
  });

  it('a changed redirect list redeploys, and no list keeps the old fingerprint', () => {
    const data = { books: [], pages: [], settings: {}, reviews: [] };
    const now = '2026-11-25T00:00:00.000Z';
    expect(publishedFingerprint({ ...data, redirects: [] }, now)).toBe(publishedFingerprint(data, now));
    expect(publishedFingerprint({ ...data, redirects: [{ from: '/a', to: '/b' }] }, now)).not.toBe(publishedFingerprint(data, now));
  });
  it('both Hosting jobs merge the list before checking and deploying', () => {
    const workflow = readFileSync(join(__dirname, '..', '.github/workflows/deploy-pages.yml'), 'utf8');
    const merge = 'node scripts/hostingRedirects.mjs dist/hosting-redirects.json firebase.json';
    const build = workflow.slice(workflow.indexOf('  build-hosting:'), workflow.indexOf('  deploy-hosting:'));
    const deploy = workflow.slice(workflow.indexOf('  deploy-hosting:'));
    expect(build.indexOf(merge)).toBeGreaterThan(-1);
    expect(build.indexOf(merge)).toBeLessThan(build.indexOf('hosting-smoke.mjs'));
    expect(deploy.indexOf(merge)).toBeGreaterThan(-1);
    expect(deploy.indexOf(merge)).toBeLessThan(deploy.indexOf('deploy --only hosting'));
  });
});
