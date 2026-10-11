import { useEffect, useMemo, useRef, useState } from "react";
import { OrderDetail } from "./OrderDetail";
import { Orders, loadOrderBooks, loadOrderSearchCatalog, patchOrdersCache, refreshOrdersCache } from "./Orders";
import { EmptyState, LoadingState, SearchField, SecondaryButton, StatusBadge, Toggle } from "./riso/components";
import { deskCounts, deskOrders, nextToOpen, refundState, rowBooks, rowCover, rowStatus, stepOrder, type DeskView } from "./ordersDesk";
import { listDate, orderMoney } from "./orderListHelpers";
import type { CatalogSearchIndex } from "./orderSearch";

const VIEW_KEY = "orders-desk-view";
const LAYOUT_KEY = "orders-desk-layout";
const read = (k: string, d: string) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const REFRESH_MS = 60 * 1000;
// Keys typed into a field or inside a dialog are never desk shortcuts.
const typingIn = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el || !el.closest) return false;
  return !!el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='dialog']");
};

// Orders, inbox style: the list on the left, the selected order on the right.
// The right side IS the full order page (OrderDetail), so payment sync with
// Stripe, refunds, disputes, labels and dispatch all work exactly as before —
// and finishing an order moves straight to the next one in "Needs me".
export function OrdersDesk({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const [orders, setOrders] = useState<any[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<DeskView>(() => read(VIEW_KEY, "needs") as DeskView);
  const [layout, setLayout] = useState(() => read(LAYOUT_KEY, "desk"));
  const [query, setQuery] = useState("");
  const [showTest, setShowTest] = useState(false);
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(max-width: 900px)").matches);
  const refreshing = useRef<Promise<void> | null>(null);
  const lastRefresh = useRef(0);
  // The owner pressed "Back to orders": don't pop the next order straight back open.
  const [closedByOwner, setClosedByOwner] = useState(false);
  const [catalog, setCatalog] = useState<CatalogSearchIndex | null>(null);
  // Book covers for the list rows; until (or unless) the catalog loads, rows use the photo saved on the order.
  const [booksById, setBooksById] = useState<Map<string, any> | null>(null);
  useEffect(() => {
    let alive = true;
    loadOrderBooks().then((books) => { if (alive && books) setBooksById(new Map(books.map((b: any) => [String(b.id), b]))); });
    return () => { alive = false; };
  }, []);

  const refresh = () => {
    if (refreshing.current) return refreshing.current;
    lastRefresh.current = Date.now();
    refreshing.current = refreshOrdersCache({ incremental: true })
      .then((data) => { setOrders(data); setFailed(false); })
      .catch(() => setFailed(true))
      .finally(() => { refreshing.current = null; });
    return refreshing.current;
  };

  useEffect(() => {
    refresh();
    // Every minute while the tab is visible; a hidden tab reads nothing and catches up on return.
    const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
    const onVisible = () => { if (!document.hidden && Date.now() - lastRefresh.current > REFRESH_MS / 2) refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    const mq = window.matchMedia?.("(max-width: 900px)");
    const onMq = () => setNarrow(!!mq?.matches);
    mq?.addEventListener?.("change", onMq);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); mq?.removeEventListener?.("change", onMq); };
  }, []);

  // ISBNs / SKUs live on the catalog: read it once, the first time someone searches.
  useEffect(() => {
    if (!query.trim() || catalog) return;
    let alive = true;
    loadOrderSearchCatalog().then((c) => { if (alive && c) setCatalog(c); });
    return () => { alive = false; };
  }, [query, catalog]);

  const list = useMemo(() => deskOrders(orders || [], view, query, showTest, catalog), [orders, view, query, showTest, catalog]);
  const counts = useMemo(() => deskCounts(orders || [], showTest), [orders, showTest]);
  const ids = useMemo(() => list.map((o) => o.id), [list]);

  // Desktop: have an order open — the oldest one that needs you — unless the owner closed it.
  useEffect(() => {
    if (narrow || !orders || layout !== "desk" || closedByOwner) return;
    if (!selectedId) {
      const next = nextToOpen(list, null);
      if (next) onSelect(next);
    }
  }, [orders, list, selectedId, narrow, layout, closedByOwner]);

  const open = (id: string | null) => { if (id) setClosedByOwner(false); onSelect(id); };

  // Keyboard: j / k next / previous order, "/" search, Escape clears the search.
  const keys = useRef({ ids, selectedId, query });
  keys.current = { ids, selectedId, query };
  useEffect(() => {
    if (layout !== "desk") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const search = document.querySelector<HTMLInputElement>(".od-list-head input[type=search]");
      if (e.key === "Escape" && e.target === search && keys.current.query) { setQuery(""); search?.blur(); return; }
      if (typingIn(e.target) || document.querySelector("[role='dialog']")) return;
      if (e.key === "/") { e.preventDefault(); search?.focus(); return; }
      if (e.key === "Escape" && keys.current.query) { setQuery(""); return; }
      if (e.key === "j" || e.key === "k") {
        const next = stepOrder(keys.current.ids, keys.current.selectedId, e.key === "j" ? 1 : -1);
        if (next && next !== keys.current.selectedId) { e.preventDefault(); open(next); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layout]);

  const pickView = (v: DeskView) => { setView(v); write(VIEW_KEY, v); };
  const pickLayout = (l: string) => { setLayout(l); write(LAYOUT_KEY, l); };

  if (layout === "table") {
    return (
      <div className="rp-stack" style={{ gap: 12 }}>
        <div><SecondaryButton size="sm" onClick={() => pickLayout("desk")}>← Back to order desk</SecondaryButton></div>
        <Orders onSelectOrder={(order) => { pickLayout("desk"); open(order.id); }} />
      </div>
    );
  }

  const tabs: Array<{ id: DeskView; label: string; n: number }> = [
    { id: "needs", label: "Needs me", n: counts.needs },
    ...(counts.preorders > 0 || view === "preorders" ? [{ id: "preorders" as DeskView, label: "Pre-orders", n: counts.preorders }] : []),
    { id: "shipped", label: "Shipped", n: counts.shipped },
    { id: "all", label: "All", n: counts.all },
  ];

  const listPane = (
    <aside aria-label="Orders" className="od-list">
      <div className="od-list-head">
        <SearchField label="Find an order" placeholder="Order, name, email, phone, postcode, book or ISBN" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div role="group" aria-label="Show" className="od-switch" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((t) => (
            <button key={t.id} type="button" aria-pressed={view === t.id} className={view === t.id ? "is-on" : ""} onClick={() => pickView(t.id)}>
              {t.label} <span className="rp-mono">{t.n}</span>
            </button>
          ))}
        </div>
        {counts.waitingPayment > 0 && view === "needs" && (
          <p className="rp-hint" style={{ margin: 0 }}>{counts.waitingPayment} waiting on an e-Transfer or cash payment — see <button type="button" className="od-link" onClick={() => pickView("all")}>All</button>.</p>
        )}
      </div>
      {failed && !orders ? (
        <div style={{ padding: 20 }}><EmptyState title="Orders didn't load" description="Check the connection and try again." action={<SecondaryButton size="sm" onClick={refresh}>Try again</SecondaryButton>} /></div>
      ) : !orders ? (
        <LoadingState label="Loading orders…" />
      ) : list.length === 0 ? (
        <div style={{ padding: 20 }}>
          <EmptyState
            title={query ? "No orders match" : view === "needs" ? "All caught up" : "No orders yet"}
            description={query ? "Try a different name, email or order number." : view === "needs" ? "Nothing to pack or ship right now. New paid orders appear here first." : "Orders show up here as soon as customers check out."}
          />
        </div>
      ) : (
        <ul className="od-rows">
          {list.map((o) => {
            const s = rowStatus(o);
            const books = (o.items || []).reduce((n: number, i: any) => n + (Number(i.quantity) || 0), 0);
            const m = orderMoney(o);
            const titles = rowBooks(o);
            const cover = rowCover(o, booksById);
            const refund = refundState(o);
            return (
              <li key={o.id}>
                <button type="button" className={`od-row${o.id === selectedId ? " is-on" : ""}${refund ? ` is-refunded is-refunded-${refund}` : ""}`} aria-current={o.id === selectedId ? "true" : undefined} onClick={() => open(o.id)}>
                  <span className="od-cover" aria-hidden="true">{cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : null}</span>
                  <span className="od-row-body">
                    <span className="od-row-top"><strong className="rp-mono">{o.orderId || o.id}</strong><span className="rp-mono od-row-amount" title={m.paid ? `Paid ${m.paid}` : undefined}>{m.text}</span></span>
                    {titles ? <span className="od-row-title" title={titles}>{titles}</span> : null}
                    <span className="od-row-mid">{o.customer?.name || "—"} · {books} book{books === 1 ? "" : "s"}{o.isTest ? " · test" : ""}{m.paid ? ` · paid ${m.paid}` : ""}</span>
                    <span className="od-row-bot"><StatusBadge tone={s.tone}>{s.text}</StatusBadge><span className="rp-hint">{listDate(o.paidAt || o.createdAt)}</span></span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="od-list-foot">
        <Toggle label="Show test orders" checked={showTest} onChange={setShowTest} />
        <SecondaryButton size="sm" onClick={() => pickLayout("table")}>Table view · bulk actions &amp; CSV</SecondaryButton>
        <p className="rp-hint" style={{ margin: 0 }} aria-label="Keyboard shortcuts">
          Shortcuts: <kbd>J</kbd> / <kbd>K</kbd> next · previous order, <kbd>/</kbd> search, <kbd>Esc</kbd> clear search
        </p>
      </div>
    </aside>
  );

  // onChanged: the order page just read this order, so drop it into the list instead of reloading every order.
  const detailPane = selectedId ? (
    <section aria-label="Selected order" className="od-detail">
      <OrderDetail
        key={selectedId}
        orderId={selectedId}
        onClose={() => { setClosedByOwner(true); onSelect(null); }}
        queueIds={ids.includes(selectedId) ? ids : [selectedId, ...ids]}
        onNavigate={(id) => open(id)}
        onChanged={(order) => { if (order?.id) setOrders(patchOrdersCache(order)); }}
      />
    </section>
  ) : (
    <section className="od-detail od-empty"><EmptyState title={view === "needs" ? "All caught up" : "Pick an order"} description="Choose an order on the left to see it here." /></section>
  );

  return (
    <div className="od-desk">
      <style>{DESK_CSS}</style>
      {narrow ? (selectedId ? detailPane : listPane) : (<>{listPane}{detailPane}</>)}
    </div>
  );
}

const DESK_CSS = `
.od-desk{display:grid;grid-template-columns:minmax(300px,380px) minmax(0,1fr);gap:24px;align-items:start}
@media (max-width:900px){.od-desk{grid-template-columns:minmax(0,1fr)}}
.od-list{position:sticky;top:16px;display:flex;flex-direction:column;border:2px solid var(--rp-border-strong);background:var(--rp-surface);max-height:calc(100vh - 140px);min-height:420px}
@media (max-width:900px){.od-list{position:static;max-height:none}}
.od-list-head{display:flex;flex-direction:column;gap:12px;padding:14px;border-bottom:1px solid var(--rp-border)}
.od-switch{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:2px solid var(--rp-border-strong)}
.od-switch button{min-height:40px;border:0;border-left:1px solid var(--rp-border);background:var(--rp-surface);color:var(--rp-text);font:800 11px var(--rp-font-body);letter-spacing:.09em;text-transform:uppercase;cursor:pointer}
.od-switch button:first-child{border-left:0}
.od-switch button.is-on{background:var(--rp-inverse);color:var(--rp-on-inverse)}
.od-switch button:focus-visible,.od-row:focus-visible{outline:2px solid var(--rp-focus);outline-offset:2px}
.od-rows{list-style:none;margin:0;padding:0;overflow:auto;flex:1}
.od-row{display:flex;flex-direction:row;align-items:flex-start;gap:12px;width:100%;text-align:left;padding:14px 16px;border:0;border-bottom:1px solid var(--rp-border);border-left:6px solid transparent;background:transparent;color:var(--rp-text);cursor:pointer;font:inherit}
.od-row:hover{background:var(--rp-surface-sunken)}
.od-row.is-on{background:var(--rp-surface-sunken);border-left-color:var(--rp-primary)}
.od-row-body{display:flex;flex-direction:column;gap:6px;flex:1;min-width:0}
.od-cover{flex:none;width:44px;aspect-ratio:2/3;border:1px solid var(--rp-border-strong);background:var(--rp-surface-sunken);overflow:hidden}
.od-cover img{display:block;width:100%;height:100%;object-fit:cover}
.od-row-title{font-size:14px;font-weight:700;color:var(--rp-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.od-row.is-refunded{background:var(--rp-danger-tint);border-left-color:var(--rp-danger)}
.od-row.is-refunded:hover,.od-row.is-refunded.is-on{background:var(--rp-danger-tint);box-shadow:inset 0 0 0 2px var(--rp-danger)}
.od-row.is-refunded-full .od-row-amount{text-decoration:line-through;color:var(--rp-danger)}
.od-row.is-refunded .od-cover{opacity:.55}
.od-row-top{display:flex;justify-content:space-between;gap:8px;font-size:13px}
.od-row-mid{font-size:13px;color:var(--rp-text-muted)}
.od-row-bot{display:flex;justify-content:space-between;align-items:center;gap:8px}
.od-list-foot{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-top:1px solid var(--rp-border)}
.od-link{border:0;background:none;padding:0;color:var(--rp-primary-text);text-decoration:underline;cursor:pointer;font:inherit}
.od-detail{min-width:0}
.od-empty{padding:40px 0}
`;
