// Per-photo crop & placement (Books › edit › Images › Crop & edit). The uploaded file is never changed:
// the photo record carries `framing: { x, y, zoom }` and every shop frame draws it with CSS. `x`/`y` (0–100) are
// the point that stays in view when the frame is a different shape from the photo (`object-position`), and
// `zoom` (1–3) enlarges the photo around that point, cropping its edges. Photos without framing render exactly
// as before; a frame that doesn't opt in simply shows the whole upload. Quick edits (`adjust`) are below.
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
 * Quick edits (same dialog): light, contrast, colour and mirroring, saved on the photo as `adjust`. Like the crop
 * they are drawn by the browser (CSS `filter` and a flip), so the uploaded file and its sharp copies never change.
 * Brightness and contrast are 50–150 (%), saturation 0–200 (0 = black & white); 100 = unchanged.
 */
export type PhotoAdjust = { brightness: number; contrast: number; saturation: number; flipX: boolean; flipY: boolean };

export const DEFAULT_ADJUST: PhotoAdjust = { brightness: 100, contrast: 100, saturation: 100, flipX: false, flipY: false };
export const ADJUST_RANGES = { brightness: [50, 150], contrast: [50, 150], saturation: [0, 200] } as const;

/** The photo's saved quick edits, cleaned up; `null` when it has none or they change nothing. */
export function photoAdjust(photo: unknown): PhotoAdjust | null {
  const a = (photo as { adjust?: unknown } | null | undefined)?.adjust as Record<string, unknown> | undefined;
  if (!a || typeof a !== "object") return null;
  const level = (key: keyof typeof ADJUST_RANGES) => {
    const [lo, hi] = ADJUST_RANGES[key];
    return Math.round(clamp(num(a[key]) ?? 100, lo, hi));
  };
  const adjust: PhotoAdjust = {
    brightness: level("brightness"),
    contrast: level("contrast"),
    saturation: level("saturation"),
    flipX: a.flipX === true,
    flipY: a.flipY === true,
  };
  return isDefaultAdjust(adjust) ? null : adjust;
}

export function isDefaultAdjust(a: PhotoAdjust): boolean {
  return a.brightness === 100 && a.contrast === 100 && a.saturation === 100 && !a.flipX && !a.flipY;
}

/** What to save on the photo: the cleaned edits, or `undefined` to drop the key when nothing is changed. */
export function adjustToSave(a: PhotoAdjust): PhotoAdjust | undefined {
  return photoAdjust({ adjust: a }) || undefined;
}

/** CSS `filter` for the edits, or `undefined` when light and colour are unchanged. */
export function adjustFilter(a: PhotoAdjust | null): string | undefined {
  if (!a) return undefined;
  const parts = [
    a.brightness !== 100 && `brightness(${a.brightness / 100})`,
    a.contrast !== 100 && `contrast(${a.contrast / 100})`,
    a.saturation !== 100 && `saturate(${a.saturation / 100})`,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

const pct = (n: number) => `${Math.round(n * 100) / 100}%`;

/**
 * Inline style for an `<img>` / `<video>` that fills its frame (`w-full h-full`, frame `overflow-hidden`).
 * `fallback` is the frame's own placement (e.g. Studio's catalog focal point) for photos with no framing of their
 * own. The zoom uses `transform`, so Tailwind hover zooms (`scale-*`, the separate `scale` property) still stack on
 * top. Motion elements, which own `transform`, use `motionFraming` instead.
 *
 * The framing's point is where it sits on the photo as shown (mirrored when flipped). A flip mirrors the photo about
 * the frame's centre, so `object-position` is mirrored too and the same part stays in view; the zoom then grows
 * from the chosen point as before.
 */
export function framingStyle(photo: unknown, fallback?: { x: number; y: number }): CSSProperties {
  const f = photoFraming(photo);
  const a = photoAdjust(photo);
  if (!f && !a) return fallback ? { objectPosition: `${fallback.x}% ${fallback.y}%` } : {};
  const point = f || { ...(fallback || DEFAULT_FRAMING), zoom: 1 };
  const sx = a?.flipX ? -1 : 1, sy = a?.flipY ? -1 : 1;
  const style: CSSProperties = {};
  if (f || fallback || sx < 0 || sy < 0) {
    style.objectPosition = `${sx < 0 ? 100 - point.x : point.x}% ${sy < 0 ? 100 - point.y : point.y}%`;
  }
  const transform: string[] = [];
  if (point.zoom > 1) transform.push(`scale(${point.zoom})`);
  if (sx < 0 || sy < 0) {
    // Mirror about the frame's centre, written relative to the transform origin (the chosen point).
    const cx = 50 - point.x, cy = 50 - point.y;
    transform.push(cx || cy
      ? `translate(${pct(cx)}, ${pct(cy)}) scale(${sx}, ${sy}) translate(${pct(-cx)}, ${pct(-cy)})`
      : `scale(${sx}, ${sy})`);
  }
  if (transform.length) {
    style.transform = transform.join(" ");
    style.transformOrigin = `${point.x}% ${point.y}%`;
  }
  const filter = adjustFilter(a);
  if (filter) style.filter = filter;
  return style;
}

/** The quick edits alone, for a view that shows the whole photo (the enlarged viewer): colour and mirroring. */
export function adjustStyle(photo: unknown): CSSProperties {
  const a = photoAdjust(photo);
  if (!a) return {};
  const style: CSSProperties = {};
  if (a.flipX || a.flipY) style.transform = `scale(${a.flipX ? -1 : 1}, ${a.flipY ? -1 : 1})`;
  const filter = adjustFilter(a);
  if (filter) style.filter = filter;
  return style;
}

/**
 * For `motion` images, which own `transform`: placement, colour and the zoom/flip as motion values, plus the hover
 * target (`hoverScale` × the crop's zoom). Motion writes translate → scale → scaleX/scaleY, so a flip about the frame's
 * centre becomes a translate that depends on the scale, given for both the resting and the hover size.
 */
export function motionFraming(photo: unknown, hoverScale = 1): { style: Record<string, string | number>; hover: Record<string, string | number> } {
  const f = photoFraming(photo);
  const a = photoAdjust(photo);
  if (!f && !a) return { style: {}, hover: { scale: hoverScale } };
  const point = f || { ...DEFAULT_FRAMING };
  const sx = a?.flipX ? -1 : 1, sy = a?.flipY ? -1 : 1;
  const shift = (zoom: number) => {
    const out: Record<string, string> = {};
    if (sx < 0 && point.x !== 50) out.x = pct(zoom * (50 - point.x) * 2);
    if (sy < 0 && point.y !== 50) out.y = pct(zoom * (50 - point.y) * 2);
    return out;
  };
  const style: Record<string, string | number> = {
    objectPosition: `${sx < 0 ? 100 - point.x : point.x}% ${sy < 0 ? 100 - point.y : point.y}%`,
    transformOrigin: `${point.x}% ${point.y}%`,
    scale: point.zoom,
    ...shift(point.zoom),
  };
  if (sx < 0) style.scaleX = -1;
  if (sy < 0) style.scaleY = -1;
  const filter = adjustFilter(a);
  if (filter) style.filter = filter;
  const hoverZoom = hoverScale * point.zoom;
  return { style, hover: { scale: hoverZoom, ...shift(hoverZoom) } };
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
