import { useEffect, useMemo, useState } from "react";
import { DataTable, EmptyState, ErrorState, LoadingState, SecondaryButton, SectionCard, StatusBadge, type Column } from "./riso/components";
import type { Order } from "./overviewInsights";
import type { Daily } from "./overviewTraffic";
import {
  acquisitionCoverage, campaignPerformance, checkoutJourney, gaCampaignVisits, landingPerformance, pageSpeedSummary,
  PASS_SHARE, VITAL_WORDS, type CampaignRow, type LandingRow, type VitalSummary,
} from "./overviewSignals";
import { googleAnalyticsApi, type Ga4Range, type SearchConsoleAnswer, type SearchRow } from "./googleAnalytics";
import { BarRow, StatRow, Trend, money, percent } from "./OverviewParts";

// Overview › Marketing & traffic, the 18 October 2026 panels: where checkout loses people, campaigns and links that
// sell, pages that start sales, real page speed and Google searches (Search Console). Pure maths in overviewSignals.ts.

const NOT_YET = (what: string) => <EmptyState icon="⏳" title="Not recorded yet" description={`${what} start counting once shoppers use the updated storefront. Until then there is nothing to show — not even zero.`} />;
const day = (key: string | null) => (key ? new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

/** Started checkout → typed an email → finished the address → saw the delivery price → pressed Pay → bought. */
export function CheckoutJourneyCard({ dailyCurrent }: { dailyCurrent: Daily[] }) {
  const j = useMemo(() => checkoutJourney(dailyCurrent), [dailyCurrent]);
  const top = Math.max(1, ...j.steps.map(s => s.count));
  return (
    <SectionCard title="Where checkout loses people" description="Each step of checkout, counted once per visit by the shop's own counter">
      {!j.recorded ? NOT_YET("Checkout steps") : (
        <>
          <ol className="rp-list" style={{ margin: -20 }} aria-label="Checkout steps">
            {j.steps.map(s => (
              <BarRow key={s.key} label={s.label} color="var(--rp-info)" share={(s.count / top) * 100}
                value={<>{s.count.toLocaleString()}{s.ofPrevious !== null && <span style={{ color: "var(--rp-text-muted)" }}> · {percent(s.ofPrevious, 0)}</span>}</>} />
            ))}
          </ol>
          {j.biggestDrop && <p className="rp-hint" style={{ margin: "28px 0 0" }}>{j.biggestDrop}</p>}
          <p className="rp-hint" style={{ margin: "8px 0 0" }}>
            Pay pressed with a missing field: <strong>{j.problems.fields.toLocaleString()}</strong> · card declined: <strong>{j.problems.declined.toLocaleString()}</strong> · payment error: <strong>{j.problems.failed.toLocaleString()}</strong>
          </p>
        </>
      )}
    </SectionCard>
  );
}

/** Paid orders per tagged campaign or source, with new customers and (where known) visits. */
export function CampaignsCard({ current, paidAll, dailyCurrent, gaCampaigns }: {
  current: Order[]; paidAll: Order[]; dailyCurrent: Daily[]; gaCampaigns?: Array<Record<string, any>>;
}) {
  const visitsBySource = useMemo(() => {
    const out: Record<string, number> = {};
    dailyCurrent.forEach(d => Object.entries(d?.sources || {}).forEach(([k, v]) => { out[k] = (out[k] || 0) + (Number(v) || 0); }));
    return out;
  }, [dailyCurrent]);
  const rows = useMemo(() => campaignPerformance(current, paidAll, { visitsBySource, gaVisits: gaCampaignVisits(gaCampaigns) }), [current, paidAll, visitsBySource, gaCampaigns]);
  const coverage = useMemo(() => acquisitionCoverage(current, paidAll), [current, paidAll]);
  const columns: Column<CampaignRow>[] = [
    { key: "name", header: "Campaign or source", lead: true, render: r => <div><strong style={{ overflowWrap: "anywhere" }}>{r.label}</strong>{r.detail && <div className="rp-hint">{r.detail}</div>}</div> },
    { key: "orders", header: "Orders", numeric: true, render: r => r.orders },
    { key: "rev", header: "Revenue", numeric: true, render: r => money(r.revenue) },
    { key: "aov", header: "Per order", numeric: true, render: r => money(r.aov) },
    { key: "new", header: "New customers", numeric: true, render: r => r.newCustomers },
    { key: "visits", header: "Visits", numeric: true, render: r => (r.visits === null ? "—" : r.visits.toLocaleString()) },
    { key: "conv", header: "Visit → sale", numeric: true, render: r => (r.visits ? percent((r.orders / r.visits) * 100) : "—") },
  ];
  return (
    <SectionCard flush title="Campaigns and links that sell"
      description="Paid orders by what brought the shopper: a tagged campaign, a ?ref= link, Instagram, Google, a newsletter, or typed in directly">
      {rows.length === 0 ? <EmptyState title="No sales in this period" description="Campaigns appear here as soon as they bring an order." />
        : <DataTable caption="Campaigns and links that sell" columns={columns} rows={rows} rowKey={r => r.key} />}
      <p className="rp-hint" style={{ padding: "12px 20px 16px", margin: 0 }}>
        {coverage.orders > 0 && `${coverage.recorded} of ${coverage.orders} orders in this period carry the full record${coverage.since ? ` (saved since ${day(coverage.since)})` : ""}; older orders only know the site they came from. `}
        Tag a link with <span className="rp-mono">?utm_campaign=autumn-launch&amp;utm_source=instagram</span> (or simply <span className="rp-mono">?ref=name</span>) and its sales show up here under that name.
      </p>
    </SectionCard>
  );
}

/** The first page shoppers saw before ordering. */
export function LandingSalesCard({ current }: { current: Order[] }) {
  const rows = useMemo(() => landingPerformance(current), [current]);
  const top = Math.max(1, ...rows.map(r => r.revenue));
  return (
    <SectionCard flush title="Pages that start sales" description="The first page a buyer saw on the visit that ended in an order">
      {rows.length === 0 ? <EmptyState title="No landing pages recorded yet" description="Orders placed from 18 October 2026 remember the page the shopper arrived on." /> : (
        <ul className="rp-list" aria-label="Pages that start sales">
          {rows.slice(0, 10).map((r: LandingRow) => (
            <BarRow key={r.page} label={<span className="rp-mono" style={{ fontWeight: 500 }}>{r.page}</span>} share={(r.revenue / top) * 100} color="var(--rp-success)"
              value={`${money(r.revenue)} · ${r.orders} ${r.orders === 1 ? "order" : "orders"}`} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

const vitalBadge = (v: VitalSummary) => (v.goodShare === null ? <StatusBadge tone="neutral">not measured</StatusBadge>
  : <StatusBadge tone={v.passes ? "success" : v.goodShare >= 50 ? "warning" : "danger"}>{v.passes ? "✓" : "!"} {percent(v.goodShare, 0)} good</StatusBadge>);

/** Google's three speed measures from shoppers' own visits, phones and computers apart. */
export function PageSpeedCard({ dailyCurrent }: { dailyCurrent: Daily[] }) {
  const s = useMemo(() => pageSpeedSummary(dailyCurrent), [dailyCurrent]);
  return (
    <SectionCard title="Page speed for real shoppers"
      description={`Measured in shoppers' own browsers on the first page of each visit. Google calls a site fast when at least ${PASS_SHARE}% of visits are good on all three.`}>
      {!s.recorded ? NOT_YET("Page speed measurements") : (
        <div className="rp-stack" style={{ gap: 16 }}>
          {s.devices.map(d => (
            <div key={d.device}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <strong>{d.device === "phone" ? "Phones" : "Computers and tablets"}</strong>
                <span className="rp-hint rp-mono">{d.visits.toLocaleString()} visits measured</span>
              </div>
              <ul className="rp-list" aria-label={`Page speed on ${d.device === "phone" ? "phones" : "computers"}`} style={{ margin: "4px -20px 0" }}>
                {(["lcp", "inp", "cls"] as const).map(k => (
                  <StatRow key={k} label={VITAL_WORDS[k].name} hint={`${VITAL_WORDS[k].plain} · ${d[k].good} good, ${d[k].ok} so-so, ${d[k].poor} slow`} value={vitalBadge(d[k])} />
                ))}
              </ul>
            </div>
          ))}
          <p className="rp-hint" style={{ margin: 0 }}>Visits with no tap or click have no "Responding" measure and are left out of that line only.</p>
        </div>
      )}
    </SectionCard>
  );
}

type ScState = { status: "loading" } | { status: "done"; answer: SearchConsoleAnswer } | { status: "error"; message: string };

/** What people typed into Google before seeing or clicking the shop (Search Console, read by the shop's server). */
export function FoundOnGoogleCard({ range, setActiveTab }: { range: Ga4Range; setActiveTab?: (tab: string) => void }) {
  const [state, setState] = useState<ScState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    googleAnalyticsApi.searchConsoleReport(range)
      .then(answer => { if (live) setState({ status: "done", answer }); })
      .catch((err: any) => { if (live) setState({ status: "error", message: err?.message || "Search Console couldn't be read." }); });
    return () => { live = false; };
  }, [range.startDate, range.endDate, range.prevStartDate, range.prevEndDate, attempt]);

  const columns = (lead: string): Column<SearchRow>[] => [
    { key: "k", header: lead, lead: true, render: r => <span style={{ overflowWrap: "anywhere" }}>{lead === "Page" ? r.key.replace(/^https?:\/\/[^/]+/, "") || "/" : r.key}</span> },
    { key: "c", header: "Clicks", numeric: true, render: r => r.clicks.toLocaleString() },
    { key: "i", header: "Seen", numeric: true, render: r => r.impressions.toLocaleString() },
    { key: "r", header: "Click rate", numeric: true, render: r => percent(r.ctr, 1) },
    { key: "p", header: "Position", numeric: true, render: r => r.position.toFixed(1) },
  ];

  if (state.status === "loading") return <SectionCard title="Found on Google"><LoadingState label="Reading Search Console…" /></SectionCard>;
  if (state.status === "error") return <SectionCard title="Found on Google"><ErrorState title="Search Console couldn't be read" description={state.message} onRetry={() => setAttempt(a => a + 1)} /></SectionCard>;
  const a = state.answer;
  if (!a.connected || !a.report) {
    return (
      <SectionCard title="Found on Google" description="What people typed into Google before they saw or clicked the shop"
        actions={<SecondaryButton size="sm" onClick={() => setActiveTab?.("general")}>Set up Search Console</SecondaryButton>}>
        <p className="rp-hint" style={{ margin: 0 }}>{a.code === "no_token" ? a.error : `Not connected yet. ${a.error || ""}`} Setup is in Settings › General › Google Search Console.</p>
      </SectionCard>
    );
  }
  const { totals, queries, pages } = a.report;
  return (
    <>
      <SectionCard title="Found on Google" description={`Google searches for ${a.site} · Google's figures run two to three days behind`}>
        <ul className="rp-list" style={{ margin: -20 }} aria-label="Google search totals">
          <StatRow label="Clicks from Google" hint={`${totals.previous.clicks.toLocaleString()} before`} value={<>{totals.current.clicks.toLocaleString()} <Trend now={totals.current.clicks} before={totals.previous.clicks} /></>} />
          <StatRow label="Times the shop was seen in results" hint={`${totals.previous.impressions.toLocaleString()} before`} value={<>{totals.current.impressions.toLocaleString()} <Trend now={totals.current.impressions} before={totals.previous.impressions} /></>} />
          <StatRow label="Click rate" hint={`${percent(totals.previous.ctr, 1)} before`} value={percent(totals.current.ctr, 1)} />
          <StatRow label="Average position" hint={`${totals.previous.position ? totals.previous.position.toFixed(1) : "—"} before · 1 is the top of the first page`} value={totals.current.position ? totals.current.position.toFixed(1) : "—"} />
        </ul>
      </SectionCard>
      <SectionCard flush title="What people searched on Google" description="Searches that showed the shop, most clicked first">
        {queries.length === 0 ? <EmptyState title="No searches in this period" description="Google lists searches once enough people see the shop in results." />
          : <DataTable caption="Google searches" columns={columns("Search")} rows={queries} rowKey={r => r.key} />}
      </SectionCard>
      <SectionCard flush title="Pages Google showed" description="Shop pages in Google results, most clicked first">
        {pages.length === 0 ? <EmptyState title="No pages in this period" />
          : <DataTable caption="Pages Google showed" columns={columns("Page")} rows={pages} rowKey={r => r.key} />}
      </SectionCard>
    </>
  );
}
