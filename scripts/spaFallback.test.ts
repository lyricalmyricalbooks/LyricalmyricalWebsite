import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baseSegments, withBaseSegments } from './spaFallback.mjs';

const page = readFileSync(join(__dirname, '..', 'public', '404.html'), 'utf8');

describe('404.html SPA fallback follows the site base', () => {
  it('counts the base folders', () => {
    expect(baseSegments('/LyricalmyricalWebsite/')).toBe(1);
    expect(baseSegments('/')).toBe(0);
    expect(baseSegments('/a/b/')).toBe(2);
  });

  it('rewrites the shipped page for the repository folder and for a custom domain', () => {
    expect(withBaseSegments(page, '/LyricalmyricalWebsite/')).toMatch(/var pathSegmentsToKeep = 1;/);
    expect(withBaseSegments(page, '/')).toMatch(/var pathSegmentsToKeep = 0;/);
  });

  it('refuses a page without the line rather than shipping a wrong redirect', () => {
    expect(() => withBaseSegments('<html></html>', '/')).toThrow();
  });
});
