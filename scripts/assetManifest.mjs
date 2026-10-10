// Pure helpers for carry-previous-assets.mjs (tested in assetManifest.test.ts).
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;

/** A plain file name inside dist/assets — never a path, never `..`. */
export const safeAssetName = name => typeof name === 'string' && SAFE_NAME.test(name) && !name.includes('..');

/** This build's asset file names, sorted, unsafe names dropped. */
export const assetNames = names => [...new Set(names.filter(safeAssetName))].sort();

/** Reads a published asset-manifest.txt; anything that is not a safe file name is ignored. */
export const parseAssetManifest = text => assetNames(String(text ?? '').split(/\r?\n/).map(line => line.trim()));
