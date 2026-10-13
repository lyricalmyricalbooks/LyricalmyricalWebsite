import { useRef } from "react";
import { Link } from "react-router";
import { X } from "lucide-react";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { DescriptionText } from "./DescriptionText";
import { photoSrcSet, PDP_PHOTO_SIZES } from "./photoSources";

type Labels = { close: string; details: string; add: string; choose: string; dialog: string };

/**
 * Quick view: a small pop-up on a shop card with the cover, price, blurb and Add to bag,
 * so a shopper can buy without leaving the grid. Books that need a choice (editions, extras,
 * gift-card amounts, box sets) send the shopper to the book's own page instead of adding here.
 * Words come from Text & labels › Product page; the switch is Studio › Style › Product cards & grid.
 */
export function QuickView({ book, href, priceText, oldPriceText, needsChoice, canAdd, placeholder, labels, onAdd, onClose }: {
  book: any; href: string; priceText: string; oldPriceText?: string; needsChoice: boolean; canAdd: boolean;
  placeholder: string; labels: Labels; onAdd: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onClose);
  const photo = book?.photos?.[0];
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={`${labels.dialog}: ${book?.title ?? ""}`}
      tabIndex={-1}
      data-fm-quickview
      className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="fm-surface relative w-full max-w-3xl max-h-[90vh] overflow-auto grid md:grid-cols-2 gap-6 p-5 md:p-7 border border-current/20" style={{ color: "var(--fg, inherit)" }}>
        <button type="button" data-autofocus onClick={onClose} aria-label={labels.close} className="absolute top-3 right-3 w-10 h-10 flex items-center justify-center"><X size={18} /></button>
        <img
          src={photo?.url || placeholder}
          {...photoSrcSet(photo, PDP_PHOTO_SIZES)}
          alt={book?.title ?? ""}
          className="w-full max-h-[60vh] object-contain"
        />
        <div className="flex flex-col gap-4 min-w-0">
          <h2 className="text-2xl font-black tracking-tight break-words pr-10">{book?.title}</h2>
          {priceText && (
            <p translate="no" className="font-mono text-lg font-bold">
              {priceText}
              {oldPriceText && <span className="ml-2 text-sm line-through opacity-50">{oldPriceText}</span>}
            </p>
          )}
          {book?.description && (
            <div className="text-sm leading-relaxed max-h-48 overflow-auto whitespace-pre-line"><DescriptionText text={book.description} /></div>
          )}
          <div className="mt-auto flex flex-col gap-2">
            {canAdd && (needsChoice ? (
              <Link to={href} onClick={onClose} className="min-h-[44px] flex items-center justify-center text-[11px] font-bold tracking-[0.2em] uppercase border border-current">{labels.choose}</Link>
            ) : (
              <button type="button" onClick={() => { onAdd(); onClose(); }} className="min-h-[44px] flex items-center justify-center text-[11px] font-bold tracking-[0.2em] uppercase border border-current">{labels.add}</button>
            ))}
            <Link to={href} onClick={onClose} className="min-h-[44px] flex items-center justify-center text-[11px] tracking-[0.2em] uppercase underline underline-offset-4">{labels.details}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
