import { useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState, LoadingState, MetricCard, SecondaryButton, SectionCard, StatusBadge } from "./riso/components";
import { DORMANT_DAYS, REORDER_COVER_DAYS, type Book, type TitleStock } from "./overviewInsights";
import { recordedSince, stockDemand, type Daily } from "./overviewTraffic";
import { wantedButUnavailable } from "./overviewSignals";
import { adminApi } from "./api";
import { isSoldOut, stockRowLabel, trackedStockRows } from "./stockRules";
import { DrillList, ROW, SPLIT, StatRow, money, shopWhen, type DrillItem } from "./OverviewParts";
import { countsByDay } from "./overviewDrill";
import { sharedLoad } from "./overviewShared";

export const LOW_STOCK = 5;

/** Overview › Dig deeper › Stock: what to reprint, what is gathering dust, what is running low, who is waiting. */
export function OverviewStock({ books, shelf, reprint, dormant, setActiveTab, dailyCurrent = [], dailyAll = [], only }: {
  books: Book[];
  /** Show just one panel (an Overview board widget): kpis, reprint, wanted, backInStock, slow or low. */
  only?: string;
  /** The period's daily traffic docs (views of books that couldn't be bought, wishlist saves). */
  dailyCurrent?: Daily[]; dailyAll?: Daily[];
  shelf: { units: number; value: number; soldOut: number; titles: number };
  reprint: TitleStock[]; dormant: TitleStock[];
  setActiveTab?: (tab: string) => void;
}) {
  // Back-in-stock sign-ups are read only when this tab is opened.
  const [alerts, setAlerts] = useState<{ rows: any[] | null; error: boolean }>({ rows: null, error: false });
  const needsAlerts = !only || only === "kpis" || only === "wanted" || only === "backInStock";
  const load = (fresh = false) => {
    if (!needsAlerts) return;
    setAlerts({ rows: null, error: false });
    sharedLoad("stockAlerts", () => adminApi.getStockAlerts(), fresh).then(rows => setAlerts({ rows, error: false })).catch(() => setAlerts({ rows: null, error: true }));
  };
  useEffect(() => load(), []);
  const show = (id: string) => !only || only === id;

  const lowStock = useMemo(
    // Tracked print books/editions only (stockRules): never digital, untracked, gift cards, box sets or archived.
    () => trackedStockRows(books).filter(r => r.stock <= LOW_STOCK)
      .sort((a, b) => a.stock - b.stock).slice(0, 6),
    [books],
  );
  const demand = useMemo(() => (alerts.rows ? stockDemand(alerts.rows, books) : null), [alerts.rows, books]);
  const waitingTotal = demand ? demand.reduce((s, d) => s + d.waiting, 0) : null;
  const wanted = useMemo(() => (alerts.rows || alerts.error ? wantedButUnavailable(dailyCurrent, books, alerts.rows) : null), [dailyCurrent, books, alerts.rows, alerts.error]);
  const wantedRecorded = !!recordedSince(dailyAll, "unbuyableViews") || !!recordedSince(dailyAll, "wishlistAdds");
  const STATE_TONE = { "sold out": "danger", "coming soon": "info", "available now": "success", removed: "neutral" } as const;

  return (
    <>
      {show("kpis") && <div className="rp-kpi-grid">
        <MetricCard label="Shelf value" value={money(shelf.value)} footer={`${shelf.units.toLocaleString()} print copies at retail`} />
        <MetricCard label="Print titles" value={shelf.titles} footer={`${shelf.soldOut} sold out (books or editions)`} tone={shelf.soldOut > 0 ? "danger" : undefined} />
        <MetricCard label="Reprint soon" value={reprint.length} footer={`under ${REORDER_COVER_DAYS} days of stock`} tone={reprint.length > 0 ? "warn" : undefined} />
        <MetricCard label="Readers waiting" value={waitingTotal === null ? (alerts.error ? "—" : "…") : waitingTotal}
          footer={alerts.error ? "Sign-ups unavailable" : "asked to be told when a book is back"} tone={waitingTotal ? "warn" : undefined} />
      </div>}
      {only !== "kpis" && <div className="rp-split" style={SPLIT}>
        {show("reprint") && <SectionCard flush title="Reprint watch" description={`Selling fast, under ${REORDER_COVER_DAYS} days of stock`}
          actions={<SecondaryButton size="sm" onClick={() => setActiveTab?.("inventory")}>Open inventory</SecondaryButton>}>
          {reprint.length === 0 ? <EmptyState icon="✓" title="No reprints urgent" description="No title is on course to sell out within a month." /> : (
            <ul className="rp-list" aria-label="Titles to reprint">
              {reprint.slice(0, 6).map(r => (
                <li key={r.id} style={ROW}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ overflowWrap: "anywhere", fontWeight: 600 }}>{r.title}</span>
                    <div className="rp-hint rp-mono">{r.sold30} sold in 30 days · {r.stock} left</div>
                  </div>
                  <StatusBadge tone={r.stock <= 0 || (r.coverDays ?? 0) <= 7 ? "danger" : "warning"}>{r.stock <= 0 ? "Sold out" : `~${r.coverDays} days`}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>}

        {show("wanted") && <SectionCard flush title="Wanted but can't be bought" description="Books people looked at while sold out or coming soon, saved to their wishlist, or asked to hear about, in this period"
          actions={<SecondaryButton size="sm" onClick={() => setActiveTab?.("catalog")}>Open books</SecondaryButton>}>
          {!wanted ? <LoadingState label="Loading…" />
            : wanted.length === 0 ? (wantedRecorded || (alerts.rows && alerts.rows.length)
              ? <EmptyState icon="✓" title="Nothing waiting" description="No one looked for a book they couldn't buy in this period." />
              : <EmptyState icon="⏳" title="Not recorded yet" description="Views of sold-out and coming-soon books and wishlist saves start counting once shoppers use the updated storefront." />)
            : (
              <ul className="rp-list" aria-label="Books wanted but unavailable">
                {wanted.slice(0, 8).map(r => (
                  <StatRow key={r.id} label={r.title}
                    hint={[r.views && `${r.views} ${r.views === 1 ? "view" : "views"} while unavailable`, r.saves && `${r.saves} wishlist ${r.saves === 1 ? "save" : "saves"}`, r.waiting && `${r.waiting} waiting for an email`].filter(Boolean).join(" · ")}
                    value={<StatusBadge tone={STATE_TONE[r.state]}>{r.state}</StatusBadge>}
                    details={<>
                      {r.views > 0 && <><strong style={{ display: "block", marginBottom: 6 }}>Views while it couldn't be bought</strong>
                        <DrillList label={`Views of ${r.title} while unavailable`} items={countsByDay(dailyCurrent, "unbuyableViews", r.id, "view")} /></>}
                      {r.saves > 0 && <><strong style={{ display: "block", margin: "12px 0 6px" }}>Wishlist saves</strong>
                        <DrillList label={`Wishlist saves of ${r.title}`} items={countsByDay(dailyCurrent, "wishlistAdds", r.id, "save")} /></>}
                      {r.waiting > 0 && <><strong style={{ display: "block", margin: "12px 0 6px" }}>Waiting for an email</strong>
                        <DrillList label={`Waiting for ${r.title}`} items={waitingFor(alerts.rows || [], r.id)} /></>}
                    </>} />
                ))}
              </ul>
            )}
        </SectionCard>}

        {show("backInStock") && <SectionCard flush title="Back-in-stock demand" description="Readers who asked to be emailed when a title returns">
          {alerts.error ? <ErrorState title="Sign-ups unavailable" description="Back-in-stock requests could not be loaded." onRetry={() => load(true)} />
            : !demand ? <LoadingState label="Loading requests…" />
            : demand.length === 0 ? <EmptyState icon="✓" title="Nobody is waiting" description="Requests from sold-out product pages are listed here — a strong reprint signal." />
            : (
              <ul className="rp-list" aria-label="Back-in-stock requests">
                {demand.slice(0, 8).map(d => (
                  <StatRow key={`${d.bookId}-${d.edition}`} label={d.title}
                    hint={`${d.edition ? `${d.edition} · ` : ""}${d.stock === null ? "no longer in catalog" : d.stock > 0 ? `${d.stock} in stock now` : "sold out"}`}
                    value={<StatusBadge tone={d.stock === 0 ? "danger" : "warning"}>{d.waiting} waiting</StatusBadge>}
                    details={<DrillList label={`Waiting for ${d.title}`} items={waitingFor(alerts.rows || [], d.bookId, d.edition)} />} />
                ))}
              </ul>
            )}
        </SectionCard>}

        {show("slow") && <SectionCard flush title="Slow-moving stock" description={`In stock, no sale in ${DORMANT_DAYS}+ days`}>
          {dormant.length === 0 ? <EmptyState icon="✓" title="Nothing dormant" description="Every title with stock has sold recently." /> : (
            <ul className="rp-list" aria-label="Slow-moving titles">
              {dormant.map(r => (
                <li key={r.id} style={ROW}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ overflowWrap: "anywhere", fontWeight: 600 }}>{r.title}</span>
                    <div className="rp-hint rp-mono">{r.lastSaleDays === null ? "Never sold" : `Last sale ${r.lastSaleDays} days ago`}</div>
                  </div>
                  <StatusBadge tone="neutral">{r.stock} in stock</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>}

        {show("low") && <SectionCard flush title="Running low" description={`${LOW_STOCK} units or fewer`}
          actions={<SecondaryButton size="sm" onClick={() => setActiveTab?.("catalog")}>Manage books</SecondaryButton>}>
          {lowStock.length === 0 ? <EmptyState icon="✓" title="Stock looks healthy" description="No published titles are at or below the low-stock threshold." /> : (
            <ul className="rp-list" aria-label="Low stock titles">
              {lowStock.map(r => (
                <li key={`${r.bookId}-${r.variantId || ""}`} style={ROW}>
                  <span style={{ minWidth: 0, overflowWrap: "anywhere", fontWeight: 600 }}>{stockRowLabel(r)}</span>
                  <StatusBadge tone={isSoldOut(r) ? "danger" : "warning"}>{isSoldOut(r) ? "Sold out" : r.stock <= 0 ? "0 left · backorders on" : `${r.stock} left`}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>}
      </div>}
    </>
  );
}

/** The readers behind a "waiting" count: who asked, for which edition and when (newest first). */
function waitingFor(alerts: any[], bookId: string, edition?: string): DrillItem[] {
  return alerts.filter(a => a.status === "waiting" && a.bookId === bookId && (edition === undefined || String(a.variantName || "") === edition))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .map(a => ({ key: String(a.id || `${a.email}-${a.variantId}`), title: String(a.email || "No email"), sub: [a.variantName, a.createdAt && `asked ${shopWhen(a.createdAt)}`].filter(Boolean).join(" · ") }));
}
