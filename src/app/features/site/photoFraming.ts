// Per-photo crop & placement (Books › edit › Images › Crop & position). The uploaded file is never changed:
// the photo record carries `framing: { x, y, zoom }` and every shop frame draws it with CSS. `x`/`y` (0–100) are
// the point that stays in view when the frame is a different shape from the photo (`object-position`), and
// `zoom` (1–3) enlarges the photo around that point, cropping its edges. Photos without framing render exactly
// as before; a frame that doesn't opt in simply shows the whole upload.
import type { CSSProperties } from "react";

export type PhotoFraming = { x: number; y: number; zoom: number };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;
export const DEFAULT_FRAMING: PhotoFraming = { x: 50, y: 50, zoom: 1 };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** The photo's saved framing, cleaned up; `null` when it has none or it is the default (centred, no zoom). */
export function photoFraming(photo: unknown): PhotoFraming | null {
  const f = (photo as { framing?: unknown } | null | undefined)?.framing as Record<string, unknown> | undefined;
  if (!f || typeof f !== "object") return null;
  const x = num(f.x), y = num(f.y), zoom = num(f.zoom);
  const framing = {
    x: Math.round(clamp(x ?? 50, 0, 100) * 10) / 10,
    y: Math.round(clamp(y ?? 50, 0, 100) * 10) / 10,
    zoom: Math.round(clamp(zoom ?? 1, MIN_ZOOM, MAX_ZOOM) * 100) / 100,
  };
  return isDefaultFraming(framing) ? null : framing;
}

export function isDefaultFraming(f: PhotoFraming): boolean {
  return f.x === 50 && f.y === 50 && f.zoom === 1;
}

/** What to save on the photo: the cleaned framing, or `undefined` to drop the key when it is back to default. */
export function framingToSave(f: PhotoFraming): PhotoFraming | undefined {
  return photoFraming({ framing: f }) || undefined;
}

/**
 * Inline style for an `<img>` / `<video>` that fills its frame (`w-full h-full`, frame `overflow-hidden`).
 * `fallback` is the frame's own placement (e.g. Studio's catalog focal point) for photos with no framing of their
 * own. The zoom uses `transform`, so Tailwind hover zooms (`scale-*`, the separate `scale` property) still stack on
 * top. Motion elements, which own `transform`, use `motionFraming` instead.
 */
export function framingStyle(photo: unknown, fallback?: { x: number; y: number }): CSSProperties {
  const f = photoFraming(photo);
  if (!f) return fallback ? { objectPosition: `${fallback.x}% ${fallback.y}%` } : {};
  const at = `${f.x}% ${f.y}%`;
  return f.zoom > 1
    ? { objectPosition: at, transform: `scale(${f.zoom})`, transformOrigin: at }
    : { objectPosition: at };
}

/** For `motion` images: placement as style, the zoom as a number to multiply the hover scale with. */
export function motionFraming(photo: unknown): { style: CSSProperties; zoom: number } {
  const f = photoFraming(photo);
  if (!f) return { style: {}, zoom: 1 };
  const at = `${f.x}% ${f.y}%`;
  return { style: { objectPosition: at, transformOrigin: at }, zoom: f.zoom };
}

/**
 * Moving the placement by dragging the photo: a drag of `dx`/`dy` pixels across a `width`×`height` preview moves
 * the point in view the opposite way (dragging the photo right shows more of its left side). Zoomed photos move
 * more slowly per pixel, so the photo follows the pointer.
 */
export function dragFraming(start: PhotoFraming, dx: number, dy: number, width: number, height: number): PhotoFraming {
  if (!(width > 0) || !(height > 0)) return start;
  const k = 100 / start.zoom;
  return {
    ...start,
    x: Math.round(clamp(start.x - (dx / width) * k, 0, 100) * 10) / 10,
    y: Math.round(clamp(start.y - (dy / height) * k, 0, 100) * 10) / 10,
  };
}
