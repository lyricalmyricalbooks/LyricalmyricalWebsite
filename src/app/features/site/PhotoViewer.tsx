import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { getCopy } from "./storeCopy";

export type ViewerPhoto = { url: string; alt: string };

/** Index the arrow keys / buttons move to, clamped to the photo list. */
export function stepPhoto(index: number, delta: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(total - 1, Math.max(0, index + delta));
}

/**
 * Full-screen photo viewer for the product page (Shopify's "open media in modal").
 * Studio › Style › Product page · Photos › Enlarge button; words in Text & labels › Product page.
 */
export function PhotoViewer({ photos, index, onIndex, onClose, design }: {
  photos: ViewerPhoto[];
  index: number;
  onIndex: (next: number) => void;
  onClose: () => void;
  design?: any;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onClose);
  const total = photos.length;
  const photo = photos[index];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") onIndex(stepPhoto(index, -1, total));
      else if (e.key === "ArrowRight") onIndex(stepPhoto(index, 1, total));
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [index, total, onIndex]);

  if (!photo || typeof document === "undefined") return null;
  const btn = "w-11 h-11 bg-black/50 rounded-full flex items-center justify-center border border-white/10 hover:bg-black/80 transition-colors disabled:opacity-20";
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={getCopy(design, "pdpViewerAria")}
      tabIndex={-1}
      data-studio-label="Photo viewer"
      className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center p-4 sm:p-10"
      onClick={onClose}
    >
      <img
        src={photo.url}
        alt={photo.alt}
        className="max-w-full max-h-full object-contain"
        onClick={e => e.stopPropagation()}
      />
      <button type="button" data-autofocus onClick={e => { e.stopPropagation(); onClose(); }} aria-label={getCopy(design, "pdpViewerClose")} className={`${btn} absolute top-4 right-4`}>
        <X size={18} />
      </button>
      {total > 1 && (
        <>
          <button type="button" disabled={index === 0} onClick={e => { e.stopPropagation(); onIndex(stepPhoto(index, -1, total)); }} aria-label={getCopy(design, "ariaPrevPhoto")} className={`${btn} absolute left-4 top-1/2 -translate-y-1/2`}>
            <ChevronLeft size={18} />
          </button>
          <button type="button" disabled={index === total - 1} onClick={e => { e.stopPropagation(); onIndex(stepPhoto(index, 1, total)); }} aria-label={getCopy(design, "ariaNextPhoto")} className={`${btn} absolute right-4 top-1/2 -translate-y-1/2`}>
            <ChevronRight size={18} />
          </button>
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] tracking-widest uppercase text-white/70" aria-live="polite">
            {getCopy(design, "pdpCaptionCount", { n: index + 1, total })}
          </p>
        </>
      )}
    </div>,
    document.body,
  );
}
