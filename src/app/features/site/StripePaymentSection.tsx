import type { ReactNode } from "react";
import { getCopy } from "./storeCopy";
import { regionProps, regionVisible } from "./storefrontRegions";

/** Payment fields must live outside the radio label: label activation and
 * preventDefault handlers interfere with Stripe's own interactive iframe. */
export function StripePaymentSection({ design, selected, configured, canRetry, busy, onSelect, onRetry, children }: {
  design: any;
  selected: boolean;
  configured: boolean;
  canRetry: boolean;
  busy: boolean;
  onSelect: () => void;
  onRetry: () => void;
  children: ReactNode;
}) {
  const c = (key: string) => getCopy(design, key);
  const brands = c("coCardBrands").split(",").map(brand => brand.trim()).filter(Boolean).filter(brand => !/^(apple\s*pay|google\s*pay|link|paypal|amazon\s*pay|klarna)$/i.test(brand));
  return (
    <div {...regionProps("stripePaymentPanel")}>
      <div {...regionProps("stripePaymentHeader")} className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 py-4">
        <label className="-my-3 flex min-h-11 cursor-pointer items-center gap-3 md:my-0 md:min-h-0">
          <input type="radio" name="payment-method" checked={selected} onChange={onSelect} disabled={busy} className="h-4 w-4 accent-[color:var(--accent)]" />
          <span className="text-sm font-medium">{c("coCard")}</span>
        </label>
        {regionVisible(design, "stripeBrands") && brands.length > 0 && (
          <div {...regionProps("stripeBrands")} className="flex flex-wrap items-center gap-1.5" aria-label={c("coCardsAria")}>
            {brands.map((brand, index) => <span key={index} className="inline-flex items-center gap-0.5 rounded border border-slate-300 bg-white px-1.5 py-1 text-[9px] font-bold text-slate-600">
              {brand}
            </span>)}
          </div>
        )}
      </div>
      {selected && (
        <div className="border-t border-slate-200 px-4 py-4">
          {configured ? children : (
            <p {...regionProps("stripePaymentRecovery")} role="alert" className="py-3 text-sm leading-6">{c("coStripeConfigError")}</p>
          )}
          {canRetry && (
            <div {...regionProps("stripePaymentRecovery")} className="mt-3">
              <p className="mb-3 text-sm leading-6 text-slate-600">{c("coStripeRetryNote")}</p>
              <button type="button" disabled={busy} onClick={onRetry} className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60">
                {c("coStripeRetry")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
