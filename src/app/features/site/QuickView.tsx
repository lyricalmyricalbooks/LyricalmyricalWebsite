import { useRef, useState } from "react";
import { Link } from "react-router";
import { X } from "lucide-react";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { catalogUnitPrice } from "../../CartContext";
import { comingSoonActive } from "./comingSoon";
import { getCopy } from "./storeCopy";
import { photoSrcSet, CARD_PHOTO_SIZES } from "./photoSources";

/** Plain-text teaser of a book's (possibly HTML) description. */
export function descriptionTeaser(html: unknown, max = 260): string {
  const text = String(html ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40))}…`;
}

/**
 * Shop-grid "Quick view": a book's photo, price, short description and an edition picker in a pop-up,
 * so a shopper can add it to the bag without leaving the grid. Books with paid add-ons, gift-card
 * amounts or box-set parts, and coming-soon books, only offer the full page (the server prices those).
 * Switch: Studio › Style › Product cards & grid › Quick view button. Words: Text & labels › Product page.
 */
export function QuickView({ book, design, slug, onClose, onAdd, formatPrice, soldOut }: {
  book: any; design: any; slug: string; onClose: () => void;
  onAdd: (book: any, variant?: any) => void;
  formatPrice: (book: any, old?: boolean) => string;
  soldOut: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onClose);
  const variants: any[] = Array.isArray(book?.variants) ? book.variants : [];
  const buyable = variants.filter((v) => (v?.stockLevel ?? v?.stock ?? 0) !== 0 && Number.isFinite(catalogUnitPrice(book, v)));
  const [variantId, setVariantId] = useState<string>(buyable[0]?.id ?? "");
  const [added, setAdded] = useState(false);
  const needsPage = (Array.isArray(book.addOns) && book.addOns.length > 0) || book.productType === "giftCard" || (Array.isArray(book.bundleItems) && book.bundleItems.length > 0) || comingSoonActive(book);
  const canAdd = !soldOut && !needsPage && (variants.length ? buyable.length > 0 : true);
  const chosen = variants.length ? buyable.find((v) => v.id === variantId) ?? buyable[0] : undefined;
  const photo = book.photos?.[0];
  const teaser = descriptionTeaser(book.description);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={getCopy(design, "ariaQuickView", { title: book.title })}
      tabIndex={-1}
      data-fm-quickview
      className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="fm-surface border border-white/10 w-full max-w-3xl max-h-[92vh] overflow-auto grid md:grid-cols-2 gap-0 relative">
        <button type="button" data-autofocus onClick={onClose} aria-label={getCopy(design, "ariaCloseQuickView")} className="absolute top-3 right-3 z-10 w-10 h-10 flex items-center justify-center border border-white/10 bg-black/50 text-white hover:bg-black/80 transition-colors"><X size={16} /></button>
        {photo?.url && (
          <img src={photo.url} {...photoSrcSet(photo, CARD_PHOTO_SIZES)} alt={photo.altText?.trim() || book.title} className="w-full h-full max-h-[60vh] md:max-h-none object-cover" />
        )}
        <div className="p-6 md:p-8 flex flex-col gap-4">
          <h2 className="fm-card-title text-xl font-black tracking-tight pr-10">{book.title}</h2>
          <p className="fm-card-price text-lg font-bold font-mono tabular-nums" translate="no">{formatPrice(book)}</p>
          {teaser && <p className="text-sm fm-muted leading-relaxed">{teaser}</p>}
          {canAdd && variants.length > 1 && (
            <label className="flex flex-col gap-1 text-[10px] font-bold tracking-[0.2em] uppercase">
              {getCopy(design, "quickViewEdition")}
              <select
                value={chosen?.id ?? ""}
                onChange={(e) => { setVariantId(e.target.value); setAdded(false); }}
                className="min-h-[44px] px-3 bg-transparent border border-current text-sm normal-case tracking-normal"
              >
                {buyable.map((v) => <option key={v.id} value={v.id}>{v.name || v.format || v.id}</option>)}
              </select>
            </label>
          )}
          <div className="mt-auto flex flex-col gap-3">
            {canAdd && (
              <button
                type="button"
                onClick={() => { onAdd(book, chosen); setAdded(true); }}
                className="fm-card-quickadd w-full min-h-[44px] flex items-center justify-center text-[10px] font-bold tracking-[0.2em] uppercase border border-current hover:opacity-80 transition-opacity"
                aria-live="polite"
              >
                {added ? getCopy(design, "quickViewAdded") : getCopy(design, "quickAddButton")}
              </button>
            )}
            <Link to={`/books/${slug}`} className="text-[10px] font-bold tracking-[0.2em] uppercase fm-accent-text hover:underline text-center">
              {getCopy(design, "quickViewDetails")} →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
