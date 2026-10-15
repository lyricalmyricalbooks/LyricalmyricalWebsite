import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useFocusTrap } from "../../lib/useFocusTrap";

export type LightboxPhoto = { url: string; alt: string; srcSet?: string };

type Labels = { close: string; prev: string; next: string; dialog: string; count: string };

/**
 * Full-screen photo viewer for the product page (click the main photo to enlarge).
 * Arrow keys / buttons move between photos, Escape or a click on the shade closes it.
 * All words come from Text & labels › Product page, so nothing is built in.
 * Rendered into <body> (inside its own `data-fm-store` wrapper, so theme tokens and Studio's viewer
 * styles still apply): a transformed or animated parent on the product page would otherwise make
 * `position: fixed` relative to that parent, leaving the header on top and the photo cut off.
 */
export function PhotoLightbox({ photos, start, labels, onClose, onIndex, showCount = true }: {
  photos: LightboxPhoto[]; start: number; labels: Labels; onClose: () => void; onIndex?: (i: number) => void;
  /** Studio › Style › Product page · buy card & details › Enlarged photo viewer › Show the photo count. */
  showCount?: boolean;
}) {
  const [index, setIndex] = useState(Math.min(Math.max(0, start), Math.max(0, photos.length - 1)));
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onClose);

  const go = (next: number) => {
    if (!photos.length) return;
    const i = (next + photos.length) % photos.length;
    setIndex(i);
    onIndex?.(i);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  });

  const photo = photos[index];
  if (!photo) return null;
  // Colours/shape: Studio › Style › Product page · buy card & details › Enlarged photo viewer (productPageStyle.ts).
  const btn = "fm-lightbox-btn absolute w-11 h-11 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 hover:bg-black/80 hover:border-white/20 text-white transition-colors";

  const viewer = (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={labels.dialog}
      tabIndex={-1}
      data-fm-lightbox
      data-studio-target="style:productCard|copy:Product page"
      data-studio-label="Enlarged photo viewer"
      className="fm-lightbox fixed inset-0 z-[1000] bg-black/95 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <img
        src={photo.url}
        {...(photo.srcSet ? { srcSet: photo.srcSet, sizes: "100vw" } : {})}
        alt={photo.alt}
        className="max-w-[94vw] max-h-[88vh] w-auto h-auto object-contain select-none"
        draggable={false}
      />
      <button type="button" data-autofocus onClick={onClose} aria-label={labels.close} className={`${btn} top-4 right-4`}><X size={18} /></button>
      {photos.length > 1 && (
        <>
          <button type="button" onClick={() => go(index - 1)} aria-label={labels.prev} className={`${btn} left-4 top-1/2 -translate-y-1/2`}><ChevronLeft size={18} /></button>
          <button type="button" onClick={() => go(index + 1)} aria-label={labels.next} className={`${btn} right-4 top-1/2 -translate-y-1/2`}><ChevronRight size={18} /></button>
        </>
      )}
      {photos.length > 1 && showCount && (
        <p className="fm-lightbox-count absolute bottom-4 left-0 right-0 text-center text-[11px] tracking-widest uppercase text-white/70" aria-live="polite">
          {labels.count.replace("{n}", String(index + 1)).replace("{total}", String(photos.length))}
        </p>
      )}
    </div>
  );
  if (typeof document === "undefined") return viewer;
  return createPortal(<div data-fm-store style={{ display: "contents" }}>{viewer}</div>, document.body);
}
