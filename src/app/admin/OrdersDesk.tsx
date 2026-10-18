import { useEffect, useMemo, useRef, useState } from "react";
import { OrderDetail } from "./OrderDetail";
import { Orders, loadOrderBooks, loadOrderSearchCatalog, patchOrdersCache, refreshOrdersCache } from "./Orders";
import { EmptyState, LoadingState, PrimaryButton, SearchField, SecondaryButton, SelectField, StatusBadge, Tabs, Toggle } from "./riso/components";
import { nextToOpen, rowBooks, rowCover, rowStatus, refundState, stepOrder, deskQueue } from "./ordersDesk";
import { badgeText, gridCounts, gridOrders, itemCount, outsideQueue, paymentChip, shipsTo, stationQueue, stationStats, stationStep, type GridSort, type GridTab } from "./shipStation";
import { listDate, orderMoney } from "./orderListHelpers";
import { printOrders } from "./orderPrint";
import { queueOf } from "./fulfillment";
import type { CatalogSearchIndex } from "./orderSearch";

const REFRESH_MS = 60 * 1000;
const PAGE = 40;
type Layout = "desk" | "grid" | "table";
/** Covers page, narrowed from the station's "Not in this queue" links. */
type Only = "" | "Awaiting release" | "Unpaid" | "In transit";
const ONLY_LABEL: Record<Exclude<Only, "">, string> = { "Awaiting release": "Pre-orders waiting for release", Unpaid: "Waiting on payment", "In transit": "On the way" };
// Keys typed into a field or inside a dialog are never desk shortcuts.
const typingIn = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el || !el.closest) return false;
  return !!el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='dialog']");
};

// Orders, design A: the Ship station (the numbered queue on the left, the selected order on the right,
// one order at a time) and the All orders covers page (Open / Completed / All orders). The right side of
// the station IS the full order page (OrderDetail), so payment sync with Stripe, refunds, disputes,
// labels and dispatch all work exactly as before, and finishing an order moves straight to the next one.
export function OrdersDesk({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const [orders, setOrders] = useState<any[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Orders always opens on All orders › Open, newest first, as covers (owner's choice, 18 October 2026);
  // a link to one order (/admin#orders/<id>) opens it in the Ship station.
  const [layout, setLayout] = useState<Layout>(() => (selectedId ? "desk" : "grid"));
  const [query, setQuery] = useState("");
  const [gridQuery, setGridQuery] = useState("");
  const [tab, setTab] = useState<GridTab>("open");
  const [only, setOnly] = useState<Only>("");
  const [sort, setSort] = useState<GridSort>("newest");
  const [shown, setShown] = useState(PAGE);
  const [showTest, setShowTest] = useState(false);
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(max-width: 900px)").matches);
  const refreshing = useRef<Promise<void> | null>(null);
  const lastRefresh = useRef(0);
  // The owner pressed "Back to orders": don't pop the next order straight back open.
  const [closedByOwner, setClosedByOwner] = useState(false);
  const [catalog, setCatalog] = useState<CatalogSearchIndex | null>(null);
  // Book covers for the queue and the covers page; until (or unless) the catalog loads, they use the photo saved on the order.
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
    if (!(query.trim() || gridQuery.trim()) || catalog) return;
    let alive = true;
    loadOrderSearchCatalog().then((c) => { if (alive && c) setCatalog(c); });
    return () => { alive = false; };
  }, [query, gridQuery, catalog]);

  const list = useMemo(() => stationQueue(orders || [], query, showTest, catalog), [orders, query, showTest, catalog]);
  const stats = useMemo(() => stationStats(orders || [], Date.now(), showTest), [orders, showTest]);
  const outside = useMemo(() => outsideQueue(orders || [], showTest), [orders, showTest]);
  const ids = useMemo(() => list.map((o) => o.id), [list]);
  const grid = useMemo(() => {
    const rows = gridOrders(orders || [], only ? "open" : tab, gridQuery, sort, showTest, catalog);
    return only ? rows.filter((o) => (only === "Unpaid" ? deskQueue(o) === "Unpaid" : queueOf(o) === only)) : rows;
  }, [orders, tab, only, gridQuery, sort, showTest, catalog]);
  const counts = useMemo(() => gridCounts(orders || [], showTest), [orders, showTest]);
  useEffect(() => setShown(PAGE), [tab, only, gridQuery, sort, showTest]);

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
      const key = String(e.key || "").toLowerCase();
      if (key === "j" || key === "k") {
        const next = stepOrder(keys.current.ids, keys.current.selectedId, key === "j" ? 1 : -1);
        if (next && next !== keys.current.selectedId) { e.preventDefault(); open(next); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layout]);

  const pickLayout = (l: Layout) => setLayout(l);
  const pickTab = (t: GridTab) => { setTab(t); setOnly(""); };
  const showOnly = (o: Exclude<Only, "">) => { setOnly(o); setGridQuery(""); pickLayout("grid"); };
  // From the covers page: open the order in the station (it stays open even when it isn't in the queue).
  const openInStation = (id: string) => { pickLayout("desk"); open(id); };
  // The pick list covers every order still to pack, whatever the search box holds.
  const toPack = useMemo(() => stationQueue(orders || [], "", showTest).filter((o) => deskQueue(o) === "Ready to pack"), [orders, showTest]);
  const printPickList = () => { if (toPack.length) printOrders(toPack, true); };

  const testToggle = <Toggle label="Show test orders" checked={showTest} onChange={setShowTest} />;
  const loadProblem = failed && orders ? (
    <p className="rp-hint" role="status" style={{ margin: 0, padding: "10px 14px", borderBottom: "1px solid var(--rp-border)" }}>
      Couldn't refresh orders. Showing the last loaded list.{" "}
      <button type="button" className="od-link" onClick={() => refresh()}>Try again</button>
    </p>
  ) : null;
  const notLoaded = failed && !orders ? (
    <div style={{ padding: 20 }}><EmptyState title="Orders didn't load" description="Check the connection and try again." action={<SecondaryButton size="sm" onClick={refresh}>Try again</SecondaryButton>} /></div>
  ) : !orders ? <LoadingState label="Loading orders…" /> : null;

  if (layout === "table") {
    return (
      <div className="rp-stack" style={{ gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <SecondaryButton size="sm" onClick={() => pickLayout("grid")}>← All orders</SecondaryButton>
          <SecondaryButton size="sm" onClick={() => pickLayout("desk")}>Ship station</SecondaryButton>
        </div>
        <Orders onSelectOrder={(order) => openInStation(order.id)} />
      </div>
    );
  }

  if (layout === "grid") {
    const page = grid.slice(0, shown);
    return (
      <div className="rp-stack od-grid-page" style={{ gap: 18 }}>
        <style>{DESK_CSS}</style>
        <header className="od-head">
          <div>
            <p className="rp-label" style={{ margin: 0 }}>Orders</p>
            <h2 className="od-title">All orders</h2>
          </div>
          <div className="od-head-actions">
            <PrimaryButton onClick={() => pickLayout("desk")}>Ship station · {stats.toShip} to ship →</PrimaryButton>
            <SecondaryButton onClick={() => pickLayout("table")}>Export orders</SecondaryButton>
          </div>
        </header>
        <div className="od-grid-bar">
          <Tabs
            label="Order lists"
            value={only ? "open" : tab}
            onChange={pickTab}
            tabs={[{ id: "open", label: "Open", count: counts.open }, { id: "completed", label: "Completed", count: counts.completed }, { id: "all", label: "All orders", count: counts.all }]}
          />
          <div className="od-grid-tools">
            <SearchField label="Find an order" placeholder="Order, name, email, book or ISBN" value={gridQuery} onChange={(e) => setGridQuery(e.target.value)} />
            <SelectField label="Sort" hideLabel value={sort} onChange={(e) => setSort(e.target.value === "oldest" ? "oldest" : "newest")}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </SelectField>
            <div role="group" aria-label="Show as" className="od-switch od-switch-inline">
              <button type="button" aria-pressed="true" className="is-on">Covers</button>
              <button type="button" aria-pressed="false" onClick={() => pickLayout("table")}>Table</button>
            </div>
          </div>
        </div>
        {only ? (
          <p className="od-only" role="status">
            Showing: <strong>{ONLY_LABEL[only]}</strong> <button type="button" className="od-link" onClick={() => setOnly("")}>Show every open order</button>
          </p>
        ) : null}
        {loadProblem}
        {notLoaded || (grid.length === 0 ? (
          <EmptyState
            title={gridQuery ? "No orders match" : tab === "open" ? "Nothing open" : "No orders here yet"}
            description={gridQuery ? "Try a different name, email or order number." : tab === "open" ? "Every order has been sent. New paid orders appear here and in the Ship station." : "Orders show up here as soon as customers check out."}
          />
        ) : (
          <ul className="od-cards" aria-label="Orders">
            {page.map((o) => {
              const s = rowStatus(o);
              const pay = paymentChip(o);
              const m = orderMoney(o);
              const cover = rowCover(o, booksById);
              const refund = refundState(o);
              const titles = rowBooks(o);
              return (
                <li key={o.id}>
                  <button type="button" className={`od-card${refund ? ` is-refunded is-refunded-${refund}` : ""}`} onClick={() => openInStation(o.id)} aria-label={`Order ${o.orderId || o.id}, ${o.customer?.name || "no name"}, ${badgeText(s.text)}, ${pay.text}`}>
                    <span className="od-card-cover" aria-hidden="true">{cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : <span className="od-card-blank">{titles || "No books"}</span>}</span>
                    <span className="od-card-body">
                      <span className="od-row-top"><strong className="rp-mono">{o.orderId || o.id}</strong><span className="rp-hint rp-mono">{listDate(o.paidAt || o.createdAt)}</span></span>
                      <span className="od-card-who"><strong>{o.customer?.name || "—"}</strong> · {itemCount(o)} · <span className="rp-mono od-row-amount" title={m.paid ? `Paid ${m.paid}` : undefined}>{m.text}</span></span>
                      {titles ? <span className="od-row-title" title={titles}>{titles}</span> : null}
                      <span className="od-card-chips"><StatusBadge tone={s.tone}>{badgeText(s.text)}</StatusBadge><StatusBadge tone={pay.tone}>{pay.text}</StatusBadge>{o.isTest ? <StatusBadge tone="danger">Test</StatusBadge> : null}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ))}
        {orders && grid.length > 0 && (
          <div className="od-grid-foot">
            <span className="rp-hint">Showing {page.length} of {grid.length} orders · {sort === "oldest" ? "oldest" : "newest"} first</span>
            {shown < grid.length && <SecondaryButton onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, grid.length - shown)} more</SecondaryButton>}
            {testToggle}
          </div>
        )}
      </div>
    );
  }

  const listPane = (
    <aside aria-label="Ship queue" className="od-list">
      <div className="od-list-head">
        <SearchField label="Find an order" placeholder="Order, name, email, phone, postcode, book or ISBN" value={query} onChange={(e) => setQuery(e.target.value)} />
        <p className="rp-label" style={{ margin: 0 }}>Up next · problems, packing, then labels</p>
      </div>
      {loadProblem}
      {notLoaded || (list.length === 0 ? (
        <div style={{ padding: 20 }}>
          <EmptyState
            title={query ? "No orders match" : "All caught up"}
            description={query ? "Try a different name, email or order number, or search All orders." : "Nothing to pack or ship right now. New paid orders appear here first."}
          />
        </div>
      ) : (
        <ol className="od-rows">
          {list.map((o, i) => {
            const step = stationStep(o);
            const books = (o.items || []).reduce((n: number, it: any) => n + (Number(it.quantity) || 0), 0);
            const where = shipsTo(o);
            const titles = rowBooks(o);
            const cover = rowCover(o, booksById);
            return (
              <li key={o.id}>
                <button type="button" className={`od-row${o.id === selectedId ? " is-on" : ""}`} aria-current={o.id === selectedId ? "true" : undefined} onClick={() => open(o.id)}>
                  <span className="od-num rp-mono" aria-hidden="true">{i + 1}</span>
                  <span className="od-cover" aria-hidden="true">{cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : null}</span>
                  <span className="od-row-body">
                    <span className="od-row-top"><strong>{o.customer?.name || "—"}</strong><StatusBadge tone={step.tone}>{step.text}</StatusBadge></span>
                    <span className="od-row-mid">{titles || `${books} book${books === 1 ? "" : "s"}`}{where ? ` · ${where}` : ""}</span>
                    <span className="od-row-bot"><span className="rp-mono rp-hint">{o.orderId || o.id}</span><span className="rp-hint">{listDate(o.paidAt || o.createdAt)}{o.isTest ? " · test" : ""}</span></span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ))}
      <div className="od-list-foot">
        <p className="rp-label" style={{ margin: 0 }}>Not in this queue</p>
        <button type="button" className="od-link" onClick={() => showOnly("Awaiting release")}>{outside.preorders} pre-order{outside.preorders === 1 ? "" : "s"} waiting for release</button>
        <button type="button" className="od-link" onClick={() => showOnly("Unpaid")}>{outside.waitingPayment} waiting on an e-Transfer or cash payment</button>
        <button type="button" className="od-link" onClick={() => showOnly("In transit")}>{outside.inTransit} on the way</button>
        {testToggle}
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
    <section className="od-detail od-empty"><EmptyState title="All caught up" description="Pick an order in the queue, or open All orders." /></section>
  );

  const header = (
    <header className="od-head">
      <div>
        <p className="rp-label" style={{ margin: 0 }}>Orders · Ship station</p>
        <h2 className="od-title">Ship today</h2>
        <p className="rp-hint" style={{ margin: "4px 0 0" }}>One order at a time: check the address, pack, buy the label, then the next order opens.</p>
      </div>
      <div className="od-head-actions">
        <dl className="od-stats" aria-label="Today">
          <div><dt className="rp-label">To ship</dt><dd className="rp-mono">{orders ? stats.toShip : "–"}</dd></div>
          <div><dt className="rp-label">Labels today</dt><dd className="rp-mono">{orders ? stats.labelsToday : "–"}</dd></div>
          <div><dt className="rp-label">Oldest</dt><dd className="rp-mono">{orders && stats.toShip ? `${stats.oldestDays}d` : "–"}</dd></div>
        </dl>
        <SecondaryButton disabled={!toPack.length} onClick={printPickList} title={toPack.length ? `Every book for the ${toPack.length} order${toPack.length === 1 ? "" : "s"} still to pack` : "Nothing to pack right now"}>
          Print pick list
        </SecondaryButton>
        <SecondaryButton onClick={() => pickLayout("grid")}>All orders · completed</SecondaryButton>
      </div>
    </header>
  );

  return (
    <div className="rp-stack" style={{ gap: 18 }}>
      <style>{DESK_CSS}</style>
      {narrow && selectedId ? null : header}
      <div className="od-desk">
        {narrow ? (selectedId ? detailPane : listPane) : (<>{listPane}{detailPane}</>)}
      </div>
    </div>
  );
}

const DESK_CSS = `
.od-head{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end;justify-content:space-between}
.od-title{margin:4px 0 0;font:400 44px/1 var(--rp-font-display);text-transform:uppercase}
@media (max-width:640px){.od-title{font-size:32px}}
.od-head-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.od-stats{display:flex;gap:18px;margin:0;padding:8px 14px;border:2px solid var(--rp-border-strong);background:var(--rp-surface)}
.od-stats div{display:flex;flex-direction:column}
.od-stats dd{margin:0;font-size:20px;font-weight:500}
.od-desk{display:grid;grid-template-columns:minmax(300px,360px) minmax(0,1fr);gap:24px;align-items:start}
@media (max-width:900px){.od-desk{grid-template-columns:minmax(0,1fr)}}
.od-list{position:sticky;top:16px;display:flex;flex-direction:column;border:2px solid var(--rp-border-strong);background:var(--rp-surface);max-height:calc(100vh - 140px);min-height:420px}
@media (max-width:900px){.od-list{position:static;max-height:none}}
.od-list-head{display:flex;flex-direction:column;gap:12px;padding:14px;border-bottom:1px solid var(--rp-border)}
.od-switch{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border:2px solid var(--rp-border-strong)}
.od-switch button{min-height:40px;padding:0 14px;border:0;border-left:1px solid var(--rp-border);background:var(--rp-surface);color:var(--rp-text);font:800 11px var(--rp-font-body);letter-spacing:.09em;text-transform:uppercase;cursor:pointer}
.od-switch button:first-child{border-left:0}
.od-switch button.is-on{background:var(--rp-inverse);color:var(--rp-on-inverse)}
.od-switch button:focus-visible,.od-row:focus-visible,.od-card:focus-visible{outline:2px solid var(--rp-focus);outline-offset:2px}
.od-rows{list-style:none;margin:0;padding:0;overflow:auto;flex:1}
.od-row{display:flex;flex-direction:row;align-items:flex-start;gap:10px;width:100%;text-align:left;padding:12px 14px;border:0;border-bottom:1px solid var(--rp-border);border-left:6px solid transparent;background:transparent;color:var(--rp-text);cursor:pointer;font:inherit}
.od-row:hover{background:var(--rp-surface-sunken)}
.od-row.is-on{background:var(--rp-surface-sunken);border-left-color:var(--rp-primary)}
.od-num{flex:none;width:22px;padding-top:2px;color:var(--rp-text-subtle);font-size:13px;text-align:right}
.od-row.is-on .od-num{color:var(--rp-text);font-weight:700}
.od-row-body{display:flex;flex-direction:column;gap:5px;flex:1;min-width:0}
.od-cover{flex:none;width:36px;aspect-ratio:2/3;border:1px solid var(--rp-border-strong);background:var(--rp-surface-sunken);overflow:hidden}
.od-cover img{display:block;width:100%;height:100%;object-fit:cover}
.od-row-title{font-size:13px;font-weight:700;color:var(--rp-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.od-row-top{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:14px}
.od-row-mid{font-size:13px;color:var(--rp-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.od-row-bot{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px}
.od-list-foot{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:12px 14px;border-top:1px solid var(--rp-border)}
.od-link{border:0;background:none;padding:0;color:var(--rp-primary-text);text-decoration:underline;cursor:pointer;font:inherit;text-align:left}
.od-detail{min-width:0}
.od-empty{padding:40px 0}
.od-grid-bar{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;justify-content:space-between}
.od-grid-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
.od-grid-tools .rp-field{min-width:150px}
.od-switch-inline{display:inline-grid}
.od-only{margin:0;font-size:14px}
.od-cards{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px}
.od-card{display:flex;flex-direction:column;width:100%;height:100%;padding:0;text-align:left;border:2px solid var(--rp-border-strong);background:var(--rp-surface);color:var(--rp-text);box-shadow:var(--rp-shadow-sm);cursor:pointer;font:inherit}
.od-card:hover{box-shadow:var(--rp-shadow-hover)}
.od-card-cover{display:block;height:150px;border-bottom:2px solid var(--rp-border-strong);background:var(--rp-surface-sunken);overflow:hidden}
.od-card-cover img{display:block;width:100%;height:100%;object-fit:cover}
.od-card-blank{display:flex;height:100%;align-items:center;justify-content:center;padding:12px;text-align:center;font:400 18px/1.1 var(--rp-font-display);text-transform:uppercase;color:var(--rp-text-subtle)}
.od-card-body{display:flex;flex-direction:column;gap:7px;padding:12px 14px 14px;min-width:0}
.od-card-who{font-size:13px;color:var(--rp-text-muted)}
.od-card-who strong{color:var(--rp-text)}
.od-card-chips{display:flex;flex-wrap:wrap;gap:6px}
.od-card.is-refunded{background:var(--rp-danger-tint)}
.od-card.is-refunded-full .od-row-amount{text-decoration:line-through;color:var(--rp-danger)}
.od-card.is-refunded .od-card-cover{opacity:.55}
.od-grid-foot{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;border-top:1px solid var(--rp-border);padding-top:14px}
`;
