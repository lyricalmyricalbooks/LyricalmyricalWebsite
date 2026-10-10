// public/404.html (GitHub Pages SPA fallback) keeps the first N path segments as the site's folder.
// N must match the build's base: 1 for /LyricalmyricalWebsite/, 0 for a custom domain at /.
// The Vite build writes it (vite.config.ts `spaFallbackBase`) so it can never disagree with the base.
const SEGMENTS = /var pathSegmentsToKeep = \d+;[^\n]*/;

export const baseSegments = base => String(base || '/').split('/').filter(Boolean).length;

export function withBaseSegments(html, base) {
  if (!SEGMENTS.test(html)) throw new Error('404.html has no "var pathSegmentsToKeep = N;" line to set');
  const n = baseSegments(base);
  return html.replace(SEGMENTS, `var pathSegmentsToKeep = ${n}; // set by the build from the site base (${base || '/'})`);
}
