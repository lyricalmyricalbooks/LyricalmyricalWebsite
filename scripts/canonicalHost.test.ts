import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { canonicalHostScript, moveToCanonicalHost } from './canonicalHost.mjs';

const project = 'lyricalmyrical-web-v2';
const at = (href: string) => {
  const url = new URL(href);
  return { hostname: url.hostname, pathname: url.pathname, search: url.search, hash: url.hash };
};

describe('one public address on Firebase Hosting', () => {
  const site = 'https://lyricalmyrical-web-v2.web.app';

  it('sends the firebaseapp.com twin to the same page on SITE_URL', () => {
    expect(moveToCanonicalHost(site, project, at('https://lyricalmyrical-web-v2.firebaseapp.com/books/x?a=1#top'))).toBe(`${site}/books/x?a=1#top`);
  });

  it('later sends both default hosts to the shop domain', () => {
    const domain = 'https://www.lyricalmyricalbooks.com';
    expect(moveToCanonicalHost(domain, project, at(`${site}/track?orderId=1&key=k`))).toBe(`${domain}/track?orderId=1&key=k`);
    expect(moveToCanonicalHost(domain, project, at('https://lyricalmyrical-web-v2.firebaseapp.com/'))).toBe(`${domain}/`);
  });

  it('does nothing on the canonical host, GitHub Pages, localhost or the prerender server', () => {
    expect(moveToCanonicalHost(site, project, at(`${site}/admin`))).toBeNull();
    for (const href of ['https://lyricalmyricalbooks.github.io/LyricalmyricalWebsite/', 'http://localhost:5173/', 'http://127.0.0.1:41234/books/x']) {
      expect(moveToCanonicalHost(site, project, at(href))).toBeNull();
    }
  });

  it('is inert while the build targets the GitHub Pages sub-path', () => {
    expect(moveToCanonicalHost('https://lyricalmyricalbooks.github.io/LyricalmyricalWebsite', project, at(`${site}/`))).toBeNull();
  });

  it("leaves Firebase's reserved sign-in paths alone and survives a bad address", () => {
    expect(moveToCanonicalHost('https://shop.example', project, at(`${site}/__/auth/handler`))).toBeNull();
    expect(moveToCanonicalHost('not a url', project, at(`${site}/`))).toBeNull();
  });

  it('runs as the inline script the build writes, and calls location.replace', () => {
    const calls: string[] = [];
    const location = { ...at('https://lyricalmyrical-web-v2.firebaseapp.com/page/about'), replace: (to: string) => calls.push(to) };
    vm.runInNewContext(canonicalHostScript(site), { window: { location }, URL });
    expect(calls).toEqual([`${site}/page/about`]);
  });

  it('cannot break out of its <script> tag', () => {
    expect(canonicalHostScript('https://x.web.app/</script><script>alert(1)')).not.toContain('</script>');
  });
});
