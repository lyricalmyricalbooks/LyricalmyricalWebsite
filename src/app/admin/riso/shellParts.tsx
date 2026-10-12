import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { adminApi } from "../api";
import { getOrdersCached } from "../ordersCache";
import { matchCustomers, matchOrders } from "../globalSearch";
import {
  Dialog, EmptyState, ErrorState, LoadingState, SearchField, SecondaryButton, StatusBadge, Tabs,
  type BadgeTone,
} from "./components";

/* ── Global search ───────────────────────────────────────────────────── */

let catalogCache: Promise<any[]> | null = null;

export type SearchTarget = { key: string; label: string; kind: string; run: () => void };

/**
 * Combobox over admin destinations plus the book catalog (fetched once, on
 * first focus). Arrow keys move, Enter runs, Escape closes.
 */
export function GlobalSearch({ destinations, onOpenBook, onOpenOrder, onOpenCustomer, shortcut = true }: {
  destinations: Array<{ id: string; label: string; run: () => void }>;
  onOpenBook: (book: any) => void;
  onOpenOrder?: (id: string) => void;
  onOpenCustomer?: (email: string) => void;
  /** Ctrl/Cmd+K focuses the box (off while a full-screen editor with its own shortcut is open). */
  shortcut?: boolean;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [books, setBooks] = useState<any[] | null>(null);
  // "error" lets the next focus try the catalog read again instead of showing "No matches" forever.
  const [booksState, setBooksState] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [orders, setOrders] = useState<any[] | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // The whole catalog (cached for the session) and every order (shared orders cache), loaded on first focus.
  const ensureData = async () => {
    if (!books && booksState !== "loading") {
      setBooksState("loading");
      try {
        if (!catalogCache) catalogCache = adminApi.getAllBooks().catch((e: unknown) => { catalogCache = null; throw e; });
        setBooks(await catalogCache);
        setBooksState("ready");
      } catch { setBooksState("error"); }
    }
    if (onOpenOrder || onOpenCustomer) getOrdersCached().then(setOrders).catch(() => setOrders([]));
  };

  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        // Never reach behind an open dialog (book editor, confirm, etc.).
        if (document.querySelector('[aria-modal="true"]')) return;
        e.preventDefault();
        boxRef.current?.querySelector("input")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcut]);

  const results = useMemo<SearchTarget[]>(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const nav = destinations
      .filter((d) => d.label.toLowerCase().includes(term))
      .map((d) => ({ key: `nav-${d.id}`, label: d.label, kind: "Go to", run: d.run }));
    const bk = (books || [])
      .filter((b) => [b.title, b.author, b.isbn, b.sku].some((v) => String(v || "").toLowerCase().includes(term)))
      .slice(0, 6)
      .map((b) => ({ key: `book-${b.id}`, label: b.title || "Untitled book", kind: "Book", run: () => onOpenBook(b) }));
    const ord = onOpenOrder ? matchOrders(orders || [], term).map((o) => ({
      key: `order-${o.id}`, label: `${o.orderId || o.id}${o.customer?.name ? ` · ${o.customer.name}` : ""}`, kind: "Order", run: () => onOpenOrder(o.id),
    })) : [];
    const cust = onOpenCustomer ? matchCustomers(orders || [], term).map((c) => ({
      key: `customer-${c.email}`, label: c.name ? `${c.name} · ${c.email}` : c.email, kind: "Customer",
      run: () => onOpenCustomer(c.email),
    })) : [];
    return [...nav, ...bk, ...ord, ...cust];
  }, [q, books, orders, destinations, onOpenBook, onOpenOrder, onOpenCustomer]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const choose = (t?: SearchTarget) => { if (!t) return; t.run(); setQ(""); setOpen(false); };
  const showList = open && q.trim().length > 0;

  return (
    <div className="rp-topbar-search" ref={boxRef}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
        else if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
        else if (e.key === "Enter") { e.preventDefault(); if (showList) choose(results[active]); }
      }}>
      <SearchField label="Search books, orders, customers and admin screens" placeholder="Search books, orders, customers… (Ctrl+K)" value={q}
        role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list" aria-keyshortcuts="Control+K Meta+K"
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        onFocus={() => { setOpen(true); ensureData(); }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); if (booksState === "error") ensureData(); }} />
      {showList && (
        <ul id={listId} role="listbox" className="rp-search-results" aria-label="Search results">
          {results.length === 0
            ? <li role="option" aria-selected="false" aria-disabled="true"><Search size={14} aria-hidden />{" "}
              {booksState === "loading" || booksState === "idle" ? "Loading…"
                : booksState === "error" ? "Couldn't load books — try again" : "No matches"}</li>
            : results.map((r, i) => (
              <li key={r.key} id={`${listId}-${i}`} role="option" aria-selected={i === active}
                onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); choose(r); }}>
                {r.label}<span className="rp-hint">{r.kind}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

/* ── Activity logs ───────────────────────────────────────────────────── */

const LOG_TONES: Record<string, BadgeTone> = {
  catalog: "success", shipping: "danger", campaigns: "warning", settings: "primary", inventory: "info",
};
const CATEGORIES = ["all", "catalog", "shipping", "campaigns", "settings", "inventory"] as const;

export function ActivityLogDialog({ open, onClose, appearance }: { open: boolean; onClose: () => void; appearance: "light" | "dark" }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("all");
  const [term, setTerm] = useState("");

  const load = async () => {
    setLoading(true); setError(false);
    try { setLogs(await adminApi.getAuditLog(100)); } catch { setError(true); } finally { setLoading(false); }
  };
  useEffect(() => { if (open) load(); }, [open]);

  const shown = logs.filter((l) =>
    (category === "all" || l.type === category) &&
    (!term.trim() || `${l.message} ${l.type} ${l.actor || ""}`.toLowerCase().includes(term.trim().toLowerCase())));

  return (
    <Dialog open={open} onClose={onClose} size="lg" appearance={appearance}
      title="Activity logs" description="Recorded actions and changes. Visible to administrators only."
      footer={<SecondaryButton onClick={load} disabled={loading}>Refresh logs</SecondaryButton>}>
      <div className="rp-filter-bar">
        <div className="rp-grow"><SearchField label="Search activity" placeholder="Search activity…" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
      </div>
      <Tabs<(typeof CATEGORIES)[number]> label="Log category" value={category} onChange={setCategory}
        tabs={CATEGORIES.map((c) => ({ id: c, label: c[0].toUpperCase() + c.slice(1) }))} />
      <div style={{ marginTop: 16 }}>
        {loading ? <LoadingState label="Retrieving logs…" />
          : error ? <ErrorState description="The activity log could not be loaded." onRetry={load} />
          : shown.length === 0 ? <EmptyState title="No matching activity" description="Try a different category or search term." />
          : (
            <ul className="rp-list" aria-label="Activity entries">
              {shown.map((log) => {
                const d = new Date(log.createdAt);
                const valid = !isNaN(d.getTime());
                return (
                  <li key={log.id} style={{ padding: "14px 0" }}>
                    <div className="rp-row-meta" style={{ marginBottom: 6 }}>
                      <StatusBadge tone={LOG_TONES[log.type] || "neutral"}>{log.type}</StatusBadge>
                      <time className="rp-mono" dateTime={valid ? d.toISOString() : undefined}>
                        {valid ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" }) : String(log.createdAt)}
                      </time>
                    </div>
                    <p style={{ margin: 0, fontSize: "var(--rp-text-base)", lineHeight: 1.5, overflowWrap: "anywhere" }}>{log.message}</p>
                  </li>
                );
              })}
            </ul>
          )}
      </div>
    </Dialog>
  );
}
