import { describe, expect, it } from 'vitest';
import { assetNames, parseAssetManifest, safeAssetName } from './assetManifest.mjs';

describe('asset manifest (keeps the previous deploy styles reachable)', () => {
  it('accepts hashed Vite asset names', () => {
    expect(safeAssetName('index-Dx1LnaHn.css')).toBe(true);
    expect(safeAssetName('MainSite-JEsNvdMP.js')).toBe(true);
  });

  it('refuses paths and traversal', () => {
    for (const bad of ['../index.html', 'a/b.js', '..', '.hidden', '', 'x\\y.js', 'a..b.js']) expect(safeAssetName(bad)).toBe(false);
  });

  it('parses a published list, dropping blanks, duplicates and unsafe lines', () => {
    expect(parseAssetManifest('b.js\n\na.css\r\nb.js\n../../etc/passwd\n<html>\n')).toEqual(['a.css', 'b.js']);
    expect(parseAssetManifest(undefined)).toEqual([]);
  });

  it('sorts its own list', () => {
    expect(assetNames(['z.js', 'a.css'])).toEqual(['a.css', 'z.js']);
  });
});
