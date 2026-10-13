import { isLiveBook } from "./liveBook";
import { searchScore } from "./bookSearch";
import { searchResultsPath } from "./searchResultsLink";
import { displayPrice } from "./displayPrice";
import { regionProps } from "./storefrontRegions";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { m, AnimatePresence } from "motion/react";
import { Search, X } from "lucide-react";
import { useCurrency } from "../../CurrencyContext";
import { designNumber } from "./designNumber";
import { getCopy } from "./storeCopy";
import { funnelApi } from "../../lib/commerce";
import { useFocusTrap } from "../../lib/useFocusTrap";

type Book = any;

const slugify = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

function bookSlug(b: Book) {
  return b.slug || slugify(b.title || "");
}

export function SearchOverlay({
  open,
  onClose,
  books,
  design,
}: {
  open: boolean;
  onClose: () => void;
  books: Book[];
  design?: any;
}) {
  const c = (key: string, vars?: Record<string, string | number>) => getCopy(design, key, vars);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { formatBookPrice } = useCurrency();
  // aria-modal: keep Tab inside the dialog and hand focus back to the search button on close.
  useFocusTrap(dialogRef, open, onClose);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);
  useEffect(() => setActive(0), [query]);

  const { results, totalMatches } = useMemo(() => {
    const q = query.trim();
    if (!q) return { results: [] as any[], totalMatches: 0 };
    // Only books shoppers can open and buy (no drafts, archived or not-yet-released titles).
    const ranked = books
      .filter(b => isLiveBook(b as any))
      .map(b => ({ book: b, s: searchScore(b, q) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s);
    return {
      results: ranked.slice(0, Math.max(1, designNumber(design, "searchResultLimit", 8))).map(x => x.book),
      totalMatches: ranked.length,
    };
  }, [query, books, design]);
  const showSeeAll = design?.showSearchSeeAll !== false && totalMatches > results.length;
  // A catalog refresh can shorten the list without a new query: keep the highlighted row inside it.
  useEffect(() => { setActive(i => (i >= results.length ? Math.max(0, results.length - 1) : i)); }, [results.length]);

  // Once shoppers stop typing, note what they looked for and whether it found anything (never stored with a name).
  useEffect(() => {
    if (!open || !query.trim()) return;
    const t = setTimeout(() => { funnelApi.trackSearch(query, results.length); }, 1200);
    return () => clearTimeout(t);
  }, [open, query, results.length]);

  const suggestions = useMemo(() => {
    const raw = typeof design?.searchSuggestions === "string" ? design.searchSuggestions : "";
    return [...new Set(raw.split(/[,\n]/).map((t: string) => t.trim()).filter(Boolean))].slice(0, 12) as string[];
  }, [design?.searchSuggestions]);

  return (
    <AnimatePresence>
      {open && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-start justify-center pt-24 px-4"
          onClick={onClose}
          ref={dialogRef}
          role="dialog"
          data-studio-target="copy:Search & filters" data-studio-label="Search overlay"
          aria-modal="true"
          aria-label={c("searchDialogAria")}
        >
          <m.div {...regionProps("searchPanel")}
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="w-full max-w-2xl fm-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
              <Search size={16} className="text-white/40" />
              <input {...regionProps("searchField")}
                ref={inputRef}
                data-autofocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                role="combobox"
                aria-expanded={results.length > 0}
                aria-controls="fm-search-results"
                aria-activedescendant={results[active] ? `fm-search-opt-${results[active].id}` : undefined}
                onKeyDown={e => {
                  if (!results.length) return;
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => (i + 1) % results.length); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => (i - 1 + results.length) % results.length); }
                  else if (e.key === "Enter") {
                    e.preventDefault();
                    const pick = results[Math.min(active, results.length - 1)];
                    if (pick) { navigate(`/books/${bookSlug(pick)}`); onClose(); }
                  }
                }}
                placeholder={c("searchPlaceholder")}
                className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-[var(--muted)]"
              />
              <button {...regionProps("searchClose")}
                onClick={onClose}
                aria-label={c("searchCloseAria")}
                className="p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>

            <div id="fm-search-results" role="listbox" className="max-h-[60vh] overflow-y-auto">
              {query.trim() === "" && (
                <p {...regionProps("searchPrompt")} className="px-5 py-10 text-center text-[10px] tracking-[0.3em] uppercase text-white/30">
                  {c("searchPrompt")}
                </p>
              )}
              {query.trim() === "" && suggestions.length > 0 && (
                <div {...regionProps("searchSuggestions")} className="px-5 pb-6 text-center">
                  <p className="mb-3 text-[10px] tracking-[0.3em] uppercase text-white/30">{c("searchSuggestionsLabel")}</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {suggestions.map(term => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => { setQuery(term); inputRef.current?.focus(); }}
                        className="rounded-full border border-white/20 px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/10 hover:text-white"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {query.trim() !== "" && results.length === 0 && (
                <p {...regionProps("searchEmpty")} className="px-5 py-10 text-center text-[10px] tracking-[0.3em] uppercase text-white/30">
                  {c("searchNoResults", { query })}
                </p>
              )}
              {results.map((b, idx) => {
                const photo = b.photos?.[0]?.url || b.coverPhoto?.url || "";
                const price = displayPrice(b);
                return (
                  <Link {...regionProps("searchResult")}
                    key={b.id}
                    id={`fm-search-opt-${b.id}`}
                    role="option"
                    aria-selected={idx === active}
                    to={`/books/${bookSlug(b)}`}
                    onClick={onClose}
                    className={`flex items-center gap-4 px-5 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-b-0 ${idx === active ? "bg-white/10" : ""}`}
                  >
                    <div {...regionProps("searchPhoto")} className="w-12 h-16 fm-surface-2 overflow-hidden rounded flex-shrink-0">
                      {photo && (
                        <img
                          src={photo}
                          alt={b.title}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="fm-card-title text-sm text-white truncate" data-studio-target="style:products" data-studio-label="Card title & price">{b.title}</p>
                      {b.authorName && (
                        <p {...regionProps("searchAuthor")} className="text-[11px] text-white/40 truncate">{b.authorName}</p>
                      )}
                    </div>
                    {price > 0 && (
                      <span className="fm-card-price-wrap fm-card-price text-[11px] tracking-widest text-white/60 font-mono" data-studio-target="style:products" data-studio-label="Card title & price">
                        {formatBookPrice(b)}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
            {showSeeAll && (
              <Link {...regionProps("searchSeeAll")}
                to={searchResultsPath(query)}
                onClick={onClose}
                className="block border-t border-white/10 px-5 py-3 text-center text-[10px] tracking-[0.3em] uppercase text-white/60 hover:bg-white/5 hover:text-white"
              >
                {c("searchSeeAll", { count: totalMatches, query: query.trim() })}
              </Link>
            )}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
