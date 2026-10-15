// Book photos uploaded since October 2026 carry their resized copies (`srcset`: 480–2400 px, see
// admin/bookPhotoUpload.ts). `photoSrcSet` turns them into `<img srcSet sizes>` so the browser picks
// the sharpest copy the screen can show (the 2400 px one on a retina product page) without shop
// cards downloading it. Older photos and typed URLs have no list and render exactly as before.
import { responsiveSource } from "./mediaRef";

/** How wide a shop card photo is drawn: 2 across on phones, 3–4 on bigger screens. */
export const CARD_PHOTO_SIZES = "(max-width: 767px) 50vw, (max-width: 1023px) 33vw, 25vw";
/** The product page's big photo: full width on phones, up to its 900 px maximum beside the buy card. */
export const PDP_PHOTO_SIZES = "(max-width: 1023px) 100vw, 900px";
/** Featured product / book spotlight sections: half the page beside the text, full width on phones. */
export const FEATURE_PHOTO_SIZES = "(max-width: 767px) 100vw, 600px";
/** The product page's thumbnail rail. */
export const THUMB_PHOTO_SIZES = "120px";

export function photoSrcSet(photo: unknown, sizes: string): { srcSet?: string; sizes?: string } {
  const p = photo as { url?: unknown; srcset?: unknown } | null | undefined;
  if (!p || typeof p !== "object") return {};
  const source = responsiveSource(p.url, { src: p.url, srcset: p.srcset });
  return source ? { srcSet: source.srcSet, sizes } : {};
}

/**
 * One URL for a small fixed-size picture (bag and checkout lines, search results, sticky bar): the
 * smallest copy at least `minWidth` px wide, so a 64 px thumbnail never downloads the original photo.
 * Photos without copies keep their `url`.
 */
export function smallPhotoUrl(photo: unknown, minWidth = 160): string {
  const p = photo as { url?: unknown; srcset?: unknown } | null | undefined;
  if (!p || typeof p !== "object") return "";
  const url = typeof p.url === "string" ? p.url : "";
  const copies = Array.isArray(p.srcset)
    ? (p.srcset as { url?: unknown; w?: unknown }[])
        .filter((v): v is { url: string; w: number } => !!v && typeof v.url === "string" && !!v.url && typeof v.w === "number" && v.w > 0)
        .sort((a, b) => a.w - b.w)
    : [];
  if (!copies.length) return url;
  return (copies.find(v => v.w >= minWidth) || copies[copies.length - 1]).url;
}
