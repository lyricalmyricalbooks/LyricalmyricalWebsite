import { useRef } from "react";
import { Link } from "react-router";
import { X } from "lucide-react";
import { useCart } from "../../CartContext";
import { useCurrency } from "../../CurrencyContext";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { getCopy } from "./storeCopy";
import { quickAddChoice } from "./buyable";
import { photoSrcSet, PDP_PHOTO_SIZES } from "./photoSources";
import { placeholderImage } from "./constants";

/** A book that needs a choice first (editions, extras, gift-card amount, box set) is bought on its own page. */
export function quickViewNeedsPage(book: any): boolean {
  return (Array.isArray(book?.variants) && book.variants.length > 1)
    || (Array.isArray(book?.addOns) && book.addOns.length > 0)
    || book?.productType === "giftCard"
    || (Array.isArray(book?.bundleItems) && book.bundleItems.length > 0);
}

/** Description as plain text, cut on a word. */
export function quickViewBlurb(book: any, max = 280): string {
  const text = String(book?.description ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 1)).trimEnd()}…`;
}

/** Shop-grid "Quick view" pop-up: photo, price, short description, Add to bag and a link to the full page. */
export function QuickView({ book, slug, design, onClose }: { book: any; slug: string; design: any; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { addToCart } = useCart();
  const { formatBookPrice } = useCurrency();
  useFocusTrap(ref, true, onClose);
  const choice = quickAddChoice(book);
  const needsPage = quickViewNeedsPage(book);
  const canAdd = !needsPage && choice.inStock;
  const blurb = quickViewBlurb(book);
  const photo = book.photos?.[0];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" data-studio-target="style:products|copy:Product page" data-studio-label="Quick view pop-up">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={book.title} tabIndex={-1} className="fm-surface relative w-full max-w-3xl max-h-[90vh] overflow-auto border border-white/10 grid md:grid-cols-2 gap-6 p-5 md:p-8">
        <button type="button" onClick={onClose} aria-label={getCopy(design, "quickViewClose")} className="absolute top-3 right-3 min-h-[44px] min-w-[44px] flex items-center justify-center hover:opacity-70">
          <X size={18} />
        </button>
        <img
          src={photo?.url || placeholderImage(design)}
          {...photoSrcSet(photo, PDP_PHOTO_SIZES)}
          alt={book.title}
          decoding="async"
          className="w-full object-cover"
        />
        <div className="flex flex-col gap-4 min-w-0">
          <h2 className="text-xl md:text-2xl font-black tracking-tight break-words pr-10">{book.title}</h2>
          <p className="font-mono text-base font-bold" translate="no">{formatBookPrice(book)}</p>
          {blurb && <p className="text-sm leading-relaxed text-white/60">{blurb}</p>}
          <div className="mt-auto flex flex-col gap-2">
            {canAdd && (
              <button
                type="button"
                data-autofocus
                onClick={() => { addToCart(book, choice.variant); onClose(); }}
                className="min-h-[44px] w-full text-[10px] font-bold tracking-[0.2em] uppercase border border-current hover:opacity-80 transition-opacity"
              >
                {getCopy(design, "quickAddButton")}
              </button>
            )}
            <Link to={`/books/${slug}`} onClick={onClose} className="min-h-[44px] flex items-center justify-center text-[10px] tracking-[0.2em] uppercase underline underline-offset-4 hover:opacity-70">
              {getCopy(design, needsPage ? "quickAddChoose" : "quickViewDetails")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
