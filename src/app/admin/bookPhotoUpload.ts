// Book photo uploads (Books › edit › Photos). Each photo is stored as sharp WebP copies 480–2400 px
// wide (`prepareMediaVariants`), so the product page can show the 2400 px copy on big or retina
// screens while shop cards and phones download a small one. The book keeps the largest copy as its
// `url` (shared links, search engines, emails) plus a public `srcset` list the storefront turns into
// `<img srcset>` (features/site/photoSources.ts). GIFs/SVGs, and browsers that can't decode the file,
// keep the old single upload.
import { adminApi } from "./api";
import { mediaApi } from "./mediaApi";
import { prepareMediaVariants, prepareProductImage } from "./prepareImage";
import type { MediaVariantRef } from "../features/site/mediaRef";

export type BookPhotoFile = { url: string; srcset?: MediaVariantRef[]; width?: number; height?: number };

/** `products/1700000000000-cover-960w.webp` — safe file name, one stamp shared by a photo's copies. */
export function bookPhotoPath(stamp: number, fileName: string): string {
  const safe = fileName.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "photo";
  return `products/${stamp}-${safe}`;
}

export async function uploadBookPhoto(file: File, now = Date.now()): Promise<BookPhotoFile> {
  const prepared = await prepareMediaVariants(file);
  if (!prepared.resized) {
    const ready = await prepareProductImage(file);
    return { url: await adminApi.uploadFile(ready, bookPhotoPath(now, ready.name)) };
  }
  const stored: { url: string; w: number; path: string }[] = [];
  try {
    for (const v of prepared.variants) {
      const path = bookPhotoPath(now, v.file.name);
      stored.push({ url: await adminApi.uploadFile(v.file, path), w: v.width, path });
    }
  } catch (error) {
    // Nothing half-added: copies already stored are removed before the error is shown.
    await mediaApi.removeFiles(stored.map(s => s.path)).catch(() => {});
    throw error;
  }
  const srcset = stored.map(({ url, w }) => ({ url, w })).sort((a, b) => a.w - b.w);
  return { url: srcset[srcset.length - 1].url, srcset, width: prepared.width, height: prepared.height };
}
