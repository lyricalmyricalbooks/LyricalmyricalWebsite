// Firebase Hosting answers on two default addresses (<project>.web.app and <project>.firebaseapp.com) and,
// later, on the shop's own domain. Only SITE_URL may be the public address: the other hosts would be duplicate
// sites for search engines, and checkout fails on any origin the Cloud Functions don't allow (ALLOWED_ORIGINS).
// vite.config.ts inlines this function at the top of index.html; it sends visitors on a default Firebase host
// to the same page on SITE_URL. It does nothing on GitHub Pages, localhost or the prerender server.
export const FIREBASE_PROJECT = 'lyricalmyrical-web-v2';

/** Runs in the browser (inlined with toString), so it stays plain ES5 and self-contained. */
export function moveToCanonicalHost(target, project, here) {
  try {
    var to = new URL(target);
    if (to.pathname.replace(/\/+$/, '') !== '') return null; // only a site served from the root of its host
    if (here.hostname === to.hostname) return null;
    if (here.hostname !== project + '.web.app' && here.hostname !== project + '.firebaseapp.com') return null;
    if (here.pathname.indexOf('/__/') === 0) return null; // Firebase's reserved paths (sign-in handler)
    var next = to.origin + here.pathname + here.search + here.hash;
    if (here.replace) here.replace(next);
    return next;
  } catch (e) {
    return null;
  }
}

export function canonicalHostScript(siteUrl, project = FIREBASE_PROJECT) {
  const json = value => JSON.stringify(String(value)).replace(/</g, '\\u003c');
  return `(${moveToCanonicalHost.toString()})(${json(siteUrl)}, ${json(project)}, window.location);`;
}
