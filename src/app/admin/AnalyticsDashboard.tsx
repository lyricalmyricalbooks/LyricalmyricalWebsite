import { openFirstActionQueue, openOrdersQueue } from "./Orders";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { adminApi } from "./api";
import { inventoryApi } from "./inventoryApi";
import { getOrdersCached } from "./ordersCache";
import { salesReportCsv } from "./salesReport";
import { launchReadiness } from "./launchReadiness";
import toast from "react-hot-toast";
import {
  Checkbox, DataTable, EmptyState, ErrorState, LoadingState, SecondaryButton, SectionCard,
  SectionHead, SelectField, StatusBadge, Tabs, TextField, type BadgeTone, type Column,
} from "./riso/components";
import {
  bestSellers, customerMix, dormantStock, newestSales, newsletterSummary, orderStatusWords, orderTodos, reprintWatch, reviewSummary,
  splitRange, stockValue, titleStock, toFulfil, totals, REORDER_COVER_DAYS,
} from "./overviewInsights";
import { recordedSince, sumMap } from "./overviewTraffic";
import { autoGrain, PRESETS, rangeWords, resolveRange, trafficDocsFor, trafficShift, type CompareMode, type Grain, type Preset } from "./overviewRange";
import { bucketSeries, buildRangeSeries, CHART_METRICS, metricValue, monthPace, seriesSummary, type ChartMetric } from "./overviewSeries";
import { googleTraffic, shopRowsIn, shopTraffic } from "./overviewSources";
import { whatChanged, type Change } from "./overviewChanges";
import { profitSummary, titlePerformance } from "./overviewProfit";
import { googleAnalyticsApi } from "./googleAnalytics";
import { shopDayKey } from "../lib/shopDay";
import { Figure, ReadinessPanel, RunRow, SPLIT, ROW, Trend, money, percent } from "./OverviewParts";
import { leadStory } from "./overviewStory";
import { OverviewSales } from "./OverviewSales";
import { OverviewMarketing, type GaState } from "./OverviewMarketing";
import { OverviewCustomers } from "./OverviewCustomers";
import { OverviewStock } from "./OverviewStock";
import { OverviewTitles } from "./OverviewTitles";

type Section = "sales" | "titles" | "marketing" | "customers" | "stock";
const SECTION_COPY: Record<Section, string> = {
  sales: "What is selling, in which format, where, when and at what discount — and how fast it ships.",
  titles: "Every title side by side: copies, revenue, change, interest, profit and stock.",
  marketing: "How people find you, which pages they land on, what they search for, and where they drop off.",
  customers: "Who buys, who comes back and when, and what happens to the carts people leave.",
  stock: "What to reprint, what is gathering dust, what is running low, and who is waiting.",
};
const PREFS_KEY = "lm:overview-view";
type Prefs = { preset?: Preset; compare?: CompareMode; from?: string; to?: string; metric?: ChartMetric };
const readPrefs = (): Prefs => { try { return JSON.parse(window.localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch { return {}; } };
const writePrefs = (p: Prefs) => { try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* per-browser convenience only */ } };
const CHANGE_BADGE: Record<Change["tone"], { tone: BadgeTone; text: string }> = {
  up: { tone: "success", text: "▲ Up" }, down: { tone: "danger", text: "▼ Down" }, info: { tone: "info", text: "● New" }, warn: { tone: "warning", text: "! Check" },
};

export function AnalyticsDashboard({ setActiveTab, onEditBook }: { setActiveTab?: (tab: string) => void; onEditBook?: (book: any) => void }) {
  const saved = useMemo(readPrefs, []);
  const [preset, setPreset] = useState<Preset>(saved.preset && PRESETS.some(p => p.id === saved.preset) ? saved.preset : "30d");
  const [compareMode, setCompareMode] = useState<CompareMode>(saved.compare === "lastYear" ? "lastYear" : "previous");
  const [custom, setCustom] = useState({ from: saved.from || "", to: saved.to || "" });
  const [metric, setMetric] = useState<ChartMetric>(CHART_METRICS.some(m => m.id === saved.metric) ? saved.metric as ChartMetric : "revenue");
  const [grainChoice, setGrainChoice] = useState<Grain | "auto">("auto");
  const [section, setSection] = useState<Section>("sales");
  const [showCompare, setShowCompare] = useState(true);
  const [fetchingBookId, setFetchingBookId] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Every source loads on its own so one failure never blanks the page.
  const [daily, setDaily] = useState<{ rows: any[] | null; error: boolean }>({ rows: null, error: false });
  const [allOrders, setAllOrders] = useState<{ orders: any[] | null; error: boolean }>({ orders: null, error: false });
  const [stock, setStock] = useState<{ books: any[] | null; error: boolean }>({ books: null, error: false });
  const [audience, setAudience] = useState<{ data: { reviews: any[]; subscribers: any[]; pendingReviews?: number | null; approvedReviews?: { count: number; average: number | null } | null } | null; error: boolean }>({ data: null, error: false });
  const [counts, setCounts] = useState<{ unreadMessages: number | null; openPrivacyRequests: number | null } | null>(null);
  const [launch, setLaunch] = useState<{ parts: any | null; error: boolean }>({ parts: null, error: false });
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [ga, setGa] = useState<GaState>({ status: "loading" });
  const [lastReset, setLastReset] = useState<{ at: string; removedDays: number } | null>(null);
  const metricIds = useRef(Object.fromEntries(CHART_METRICS.map(m => [m.id, `ov-chart-tab-${m.id}`])) as Record<ChartMetric, string>);

  const range = useMemo(() => resolveRange(preset, { custom, compare: compareMode }), [preset, custom, compareMode, reloadKey]);
  useEffect(() => { writePrefs({ preset, compare: compareMode, from: custom.from, to: custom.to, metric }); }, [preset, compareMode, custom, metric]);

  // Enough daily traffic docs for the range AND its comparison window (a year-on-year view needs ~2 years).
  const needDocs = trafficDocsFor(range);
  const loadDaily = useCallback(() => {
    setDaily(d => ({ rows: d.rows, error: false }));
    adminApi.getDailyAnalytics(needDocs).then((rows: any[]) => setDaily({ rows, error: false }))
      .catch((err: unknown) => { console.error(err); setDaily({ rows: null, error: true }); toast.error("Traffic figures could not be loaded"); });
  }, [needDocs]);
  useEffect(() => { loadDaily(); }, [reloadKey, loadDaily]);

  // Google Analytics for exactly this range (and its comparison window), read by the shop's server.
  useEffect(() => {
    let live = true;
    setGa(g => ({ status: "loading", answer: g.answer }));
    googleAnalyticsApi.report({ startDate: range.startKey, endDate: range.endKey, prevStartDate: range.prevStartKey, prevEndDate: range.prevEndKey })
      .then(answer => { if (live) setGa(answer.connected ? { status: "connected", answer } : answer.code === "no_property" ? { status: "off", answer } : { status: "error", answer, message: answer.error }); })
      .catch((err: any) => { if (live) setGa({ status: "error", message: err?.message || "Google Analytics couldn't be read." }); });
    return () => { live = false; };
  }, [range.startKey, range.endKey, range.prevStartKey, range.prevEndKey, reloadKey]);

  useEffect(() => {
    Promise.all([
      adminApi.getSettings(),
      adminApi.getShippingProfiles(),
      adminApi.getRecentEmailLog(5),
    ]).then(([settings, shippingProfiles, emailLog]) => setLaunch({ parts: { settings, shippingProfiles, emailLog }, error: false }))
      .catch(() => setLaunch({ parts: null, error: true }));
    // The whole catalogue and every order, so 1-year and year-on-year figures are never cut off.
    getOrdersCached({ force: reloadKey > 0 }).then((o: any[]) => { setAllOrders({ orders: o, error: false }); setLoadedAt(new Date()); })
      .catch(() => setAllOrders({ orders: null, error: true }));
    adminApi.getAllBooks().then((b: any[]) => setStock({ books: b, error: false }))
      .catch(() => setStock({ books: null, error: true }));
    adminApi.getAudienceSnapshot().then((d: any) => setAudience({ data: d, error: false }))
      .catch(() => setAudience({ data: null, error: true }));
    adminApi.getAdminBadgeCounts().then(setCounts).catch(() => setCounts({ unreadMessages: null, openPrivacyRequests: null }));
    // Cost prices are admin-only (Inventory); without them profit says "add cost prices", never a guess.
    inventoryApi.costs().then(setCosts).catch(() => setCosts({}));
    googleAnalyticsApi.lastReset().then(setLastReset).catch(() => setLastReset(null));
  }, [reloadKey]);

  const refresh = () => {
    setAllOrders({ orders: null, error: false }); setStock({ books: null, error: false });
    setAudience({ data: null, error: false }); setLaunch({ parts: null, error: false }); setDaily({ rows: null, error: false });
    // Panels that load their own extra data (carts, stock sign-ups) remount via their key.
    setReloadKey(k => k + 1);
  };

  // Only the latest Edit click may open the editor: a slower earlier read is ignored.
  const editRequest = useRef(0);
  const handleEditClick = async (id: string) => {
    if (!onEditBook) return;
    const request = ++editRequest.current;
    setFetchingBookId(id);
    try {
      const book = await adminApi.getBook(id);
      if (request !== editRequest.current) return;
      if (book) onEditBook(book); else toast.error("Could not find book records");
    } catch {
      if (request === editRequest.current) toast.error("Failed to load book records");
    } finally {
      if (request === editRequest.current) setFetchingBookId(null);
    }
  };

  const books = stock.books || [];

  // Everything sales-related comes from paid, real orders — one source of truth for revenue, orders and conversion.
  const periods = useMemo(() => (allOrders.orders ? splitRange(allOrders.orders, range) : null), [allOrders.orders, range]);
  const insights = useMemo(() => {
    if (!periods || !allOrders.orders) return null;
    const rows = titleStock(periods.paid, books);
    return {
      top: bestSellers(periods.current, 1)[0] ?? null,
      cur: totals(periods.current), prev: totals(periods.previous),
      mix: customerMix(periods.paid, periods.current, periods.start),
      shelf: stockValue(books), stockRows: rows, reprint: reprintWatch(rows), dormant: dormantStock(rows).slice(0, 5),
      fulfil: toFulfil(allOrders.orders),
      profit: profitSummary(periods.current, books, costs),
      pace: monthPace(periods.paid, shopDayKey(Date.now())),
    };
  }, [periods, allOrders.orders, books, costs]);

  const readiness = useMemo(() => {
    if (!launch.parts || !allOrders.orders || !stock.books) return null;
    return launchReadiness({ ...launch.parts, books: stock.books, orders: allOrders.orders });
  }, [launch.parts, allOrders.orders, stock.books]);

  // Traffic: Google Analytics when connected, else the shop's own counters (UTC-keyed, shifted onto shop days).
  const shift = trafficShift(range);
  const gaReport = ga.status === "connected" ? ga.answer?.report : undefined;
  const traffic = useMemo(() => (gaReport ? googleTraffic(gaReport) : daily.rows ? shopTraffic(daily.rows, range, shift) : null), [gaReport, daily.rows, range, shift]);
  const trafficReady = ga.status !== "loading" && traffic !== null;
  const trafficFailed = !gaReport && daily.error;
  const dailyCurrent = useMemo(() => shopRowsIn(daily.rows || [], range.startKey, range.endKey, shift), [daily.rows, range, shift]);
  const visits = traffic ? traffic.visitors : { cur: 0, prev: 0 };
  const conv = insights && trafficReady ? { cur: visits.cur > 0 ? (insights.cur.orders / visits.cur) * 100 : 0, prev: visits.prev > 0 ? (insights.prev.orders / visits.prev) * 100 : 0 } : null;
  const funnel = traffic?.funnel;
  const sourceName = traffic?.source === "google" ? "Google Analytics" : "shop counter";

  const reviews = useMemo(() => {
    if (!audience.data) return null;
    const s = reviewSummary(audience.data.reviews);
    const server = {
      ...(typeof audience.data.pendingReviews === "number" ? { pending: audience.data.pendingReviews } : {}),
      ...(audience.data.approvedReviews ? { approved: audience.data.approvedReviews.count, average: audience.data.approvedReviews.average } : {}),
    };
    return { ...s, ...server };
  }, [audience.data]);
  const todos = useMemo(() => (allOrders.orders ? orderTodos(allOrders.orders) : null), [allOrders.orders]);
  const subs = audience.data && periods ? newsletterSummary(audience.data.subscribers, periods.start) : null;

  // The chart. "Today" has no hourly data, so it shows the last 7 days for context.
  const chartRange = useMemo(() => (range.preset === "today" ? resolveRange("7d", { compare: compareMode }) : range), [range, compareMode]);
  const grain: Grain = grainChoice === "auto" ? autoGrain(chartRange.days) : grainChoice;
  const metricMeta = CHART_METRICS.find(m => m.id === metric) || CHART_METRICS[0];
  // Google's figures cover only the chosen range, so "Today"'s 7-day context can't chart Google visitors.
  const visitorsCharted = trafficReady && !(range.preset === "today" && traffic?.source === "google");
  const metricUsable = !metricMeta.needsTraffic || visitorsCharted;
  const buckets = useMemo(() => (periods ? bucketSeries(buildRangeSeries(periods.paid, chartRange, traffic?.visitsOn || (() => 0)), grain) : []), [periods, chartRange, traffic, grain]);
  const chartData = useMemo(() => buckets.map(b => ({ key: b.date, label: b.label, value: metricValue(b, metric), prev: metricValue(b, metric, true) })), [buckets, metric]);
  const summary = useMemo(() => seriesSummary(buckets, metric), [buckets, metric]);
  const fmt = (v: number | null) => (v === null ? "—" : metricMeta.kind === "money" ? money(v) : metricMeta.kind === "percent" ? percent(v, 2) : Math.round(v).toLocaleString());
  const axisFmt = (v: number) => (metricMeta.kind === "money" ? (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`) : metricMeta.kind === "percent" ? `${v}%` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v));
  const chartEmpty = chartData.every(d => !d.value) && chartData.every(d => !d.prev);
  const chartSummary = buckets.length
    ? `${metricMeta.label} by ${grain} over ${chartRange.phrase}: ${fmt(summary.value)}${summary.previous !== null ? ` (${fmt(summary.previous)} in ${chartRange.before})` : ""}.${summary.best ? ` Best ${grain}: ${summary.best.label}, ${fmt(summary.best.value)}.` : ""}`
    : "No chart data for this period.";

  const changes = useMemo(() => (insights && periods ? whatChanged({
    cur: insights.cur, prev: insights.prev, current: periods.current, previous: periods.previous,
    visits: trafficReady ? visits : null, before: range.before, money,
  }) : null), [insights, periods, trafficReady, visits.cur, visits.prev, range.before]);

  const titleRows = useMemo(() => (periods ? titlePerformance({
    current: periods.current, previous: periods.previous, books, costs,
    viewsById: recordedSince(daily.rows || [], "bookViews") ? sumMap(dailyCurrent, "bookViews") : null,
    stock: insights?.stockRows || [],
  }) : []), [periods, books, costs, daily.rows, dailyCurrent, insights]);

  // Real sales only: abandoned/unpaid card attempts and test orders are not orders to look at here.
  const recentOrders = useMemo(() => newestSales(allOrders.orders || []), [allOrders.orders]);
  const recentColumns: Column<any>[] = [
    { key: "id", header: "Order", lead: true, render: o => <a className="rp-mono" href={`#orders/${encodeURIComponent(o.id)}`} aria-label={`Open order ${o.orderId || o.id}`}>{o.orderId || o.id}</a> },
    { key: "cust", header: "Customer", render: o => o.customer?.name || o.customer?.email || "—" },
    { key: "total", header: "Total", numeric: true, render: o => money(o.total) },
    { key: "pay", header: "Status", render: o => { const w = orderStatusWords(o); return <StatusBadge tone={w === "Refunded" || w === "Needs attention" ? "warning" : w === "Paid · to send" ? "info" : "success"}>{w}</StatusBadge>; } },
  ];

  const downloadReport = () => {
    if (!periods) return;
    const csv = salesReportCsv(periods.current, periods.startKey, periods.endKey);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `sales-report-${periods.startKey}-to-${periods.endKey}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  const onMetricKey = (e: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const ids = CHART_METRICS.map(m => m.id);
    const i = ids.indexOf(metric);
    const target = e.key === "Home" ? ids[0] : e.key === "End" ? ids[ids.length - 1] : ids[(i + (e.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length];
    setMetric(target);
    requestAnimationFrame(() => document.getElementById(metricIds.current[target])?.focus());
  };
  const resetTraffic = async () => {
    const result = await googleAnalyticsApi.resetTraffic();
    setLastReset({ at: result.at, removedDays: result.removedDays });
    toast.success(`Traffic counts reset — ${result.removedDays} day${result.removedDays === 1 ? "" : "s"} cleared. Counting starts now.`);
    loadDaily();
  };

  const ordersLoading = !insights && !allOrders.error;
  const stockLoading = stock.books === null && !stock.error;
  const KPI_WAIT = "Loading…";
  const trafficFooter = (text: string) => (trafficFailed ? "Traffic unavailable" : !trafficReady ? KPI_WAIT : text);
  const refreshLabel = loadedAt ? `Updated ${loadedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Loading…";

  const story = insights ? leadStory({ cur: insights.cur, prev: insights.prev, top: insights.top, days: range.preset === "today" ? 1 : Math.max(2, range.days), phrase: range.phrase, money, before: range.before }) : null;
  const openTodos = insights && reviews && todos ? insights.fulfil.length + reviews.pending + insights.reprint.length + insights.shelf.soldOut
    + todos.requests.length + todos.giftCardsMissing.length + todos.awaitingRelease.length
    + (counts?.unreadMessages || 0) + (counts?.openPrivacyRequests || 0) : null;
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const onFlare = "var(--rp-on-primary)";
  const cartStep = funnel && funnel.add_to_cart > 0 ? (funnel.checkout_start / funnel.add_to_cart) * 100 : null;
  const profit = insights?.profit;

  return (
    <div className="rp-stack rp-ov">
      {/* 1 · Masthead: the date, freshness and the period control for every figure that depends on it */}
      <header className="rp-ov-mast">
        <div className="rp-ov-dateline">
          <span>{today}</span>
          <span aria-live="polite">{refreshLabel}{traffic ? ` · traffic from ${sourceName}` : ""}</span>
        </div>
        <div className="rp-ov-mast-row">
          <h2 className="rp-ov-title">The shop today</h2>
          <div className="rp-ov-mast-actions">
            <SecondaryButton size="sm" onClick={refresh} disabled={ordersLoading}>Refresh</SecondaryButton>
            <SecondaryButton size="sm" onClick={downloadReport} disabled={!periods}>Download sales report (CSV)</SecondaryButton>
          </div>
        </div>
        <div className="rp-ov-controls">
          <SelectField label="Period" value={preset} onChange={e => setPreset(e.target.value as Preset)}>
            {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </SelectField>
          {preset === "custom" && (
            <>
              <TextField label="From" type="date" value={custom.from} max={custom.to || shopDayKey(Date.now())} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} />
              <TextField label="To" type="date" value={custom.to} min={custom.from || undefined} max={shopDayKey(Date.now())} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} />
            </>
          )}
          <SelectField label="Compare with" value={compareMode} onChange={e => setCompareMode(e.target.value as CompareMode)}>
            <option value="previous">The period before</option>
            <option value="lastYear">The same days last year</option>
          </SelectField>
          <p className="rp-ov-range" aria-live="polite">
            <strong>{range.phrase[0].toUpperCase() + range.phrase.slice(1)}</strong>{range.preset !== "custom" && <> · {rangeWords(range.startKey, range.endKey)}</>}
            <span> · compared with {range.before} ({rangeWords(range.prevStartKey, range.prevEndKey)})</span>
            {preset === "custom" && range.preset !== "custom" && <span> · pick both dates to use a custom range</span>}
          </p>
        </div>
      </header>

      {/* 2 · Launch checks: a slim strip while anything is open, gone once everything is green */}
      <ReadinessPanel error={launch.error} items={readiness} onRetry={refresh} onOpen={tab => setActiveTab?.(tab)} />

      {/* 3 · Lead story (flare) with the chart, beside today's run sheet (ink) */}
      <div className="rp-ov-front">
        <article className="rp-ov-lead" aria-labelledby="ov-lead-title">
          <div className="rp-ov-lead-head">
            <div style={{ minWidth: 0 }}>
              <div className="rp-ov-eyebrow">Lead story · {range.phrase}</div>
              <h2 id="ov-lead-title" className="rp-ov-headline">
                {allOrders.error ? "Sales figures unavailable" : story ? story.headline : "Counting this period's sales…"}
              </h2>
              <p className="rp-ov-dek">
                {allOrders.error ? "Orders could not be loaded, so revenue can't be calculated." : story ? story.dek : "Paid orders are loading."}
                {insights && insights.cur.refunded > 0 && ` After ${money(insights.cur.refunded)} refunded.`}
              </p>
              {insights?.pace && insights.pace.soFar > 0 && (
                <p className="rp-ov-dek" style={{ marginTop: 4 }}>
                  This month: {money(insights.pace.soFar)} in {insights.pace.daysIn} days — on pace for about <strong>{money(Math.round(insights.pace.projected))}</strong> by month end (a projection at this month's daily average).
                </p>
              )}
            </div>
          </div>
          <div className="rp-ov-switch" role="tablist" aria-label="Chart measure" style={{ marginTop: 14, flexWrap: "wrap" }}>
            {CHART_METRICS.map(m => (
              <button key={m.id} id={metricIds.current[m.id]} type="button" role="tab" aria-selected={metric === m.id}
                aria-controls="ov-chart-panel" tabIndex={metric === m.id ? 0 : -1} onKeyDown={onMetricKey} onClick={() => setMetric(m.id)}>
                {m.label}
              </button>
            ))}
          </div>

          <div id="ov-chart-panel" role="tabpanel" aria-labelledby={metricIds.current[metric]}>
          {allOrders.error ? <ErrorState title="Chart unavailable" description="Orders could not be loaded, so the trend can't be drawn." onRetry={refresh} />
            : metricMeta.needsTraffic && trafficFailed ? <ErrorState title="Traffic unavailable" description="Visits could not be loaded." onRetry={loadDaily} />
            : !periods || (metricMeta.needsTraffic && !trafficReady) ? <LoadingState label="Loading chart…" />
            : !metricUsable ? <p className="rp-ov-dek" style={{ marginTop: 16 }}>Google Analytics visitors chart over a longer period — choose 7 days or more.</p>
            : chartEmpty ? (
              <p className="rp-ov-dek" style={{ marginTop: 16 }}>
                {metricMeta.needsTraffic ? "Visitors will chart here once the storefront records them." : "This will chart here once customers place paid orders."}
              </p>
            ) : (
              <>
                <p className="rp-sr-only">{chartSummary}</p>
                <div className="rp-ov-chart-stats" aria-hidden="true">
                  <span><b>{fmt(summary.value)}</b> {metricMeta.kind === "money" && metric === "aov" ? "average" : "in total"}{summary.previous !== null && <> · <Trend now={summary.value || 0} before={summary.previous || 0} /></>}</span>
                  {summary.perDay !== null && <span><b>{fmt(summary.perDay)}</b> a day</span>}
                  {summary.best && <span>Best {grain}: <b>{summary.best.label}</b> ({fmt(summary.best.value)})</span>}
                </div>
                <div style={{ height: 240, width: "100%", marginTop: 8 }} role="img" aria-label={chartSummary}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ left: 0, right: 8, top: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={onFlare} strokeOpacity={0.18} />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={24} tick={{ fontSize: 11, fill: onFlare }} />
                      <YAxis axisLine={false} tickLine={false} width={48} tick={{ fontSize: 11, fill: onFlare }} tickFormatter={axisFmt} />
                      <Tooltip formatter={(v: any, name: any) => [fmt(v === null || v === undefined ? null : Number(v)), name]}
                        contentStyle={{ background: "var(--rp-surface)", border: "2px solid var(--rp-border-strong)", borderRadius: 0, color: "var(--rp-text)", fontSize: 12 }} />
                      {showCompare && <Area type="monotone" dataKey="prev" name={`${metricMeta.label} (${chartRange.compare === "lastYear" ? "last year" : "before"})`} stroke={onFlare} strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="4 4" fill="none" connectNulls />}
                      <Area type="monotone" dataKey="value" name={metricMeta.label} stroke={onFlare} strokeWidth={3} fill={onFlare} fillOpacity={0.14} connectNulls />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="rp-ov-lead-foot">
                  <span className="rp-ov-legend">
                    <span><i data-line="solid" aria-hidden="true" />{metricMeta.label}{metricMeta.needsTraffic ? ` · ${sourceName}` : ""}</span>
                    {showCompare && <span><i data-line="dashed" aria-hidden="true" />{chartRange.compare === "lastYear" ? "Same days last year" : range.preset === "today" ? "Week before" : "Period before"}</span>}
                  </span>
                  <span style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="rp-ov-switch" role="group" aria-label="Group the chart by">
                      {(["auto", "day", "week", "month"] as const).map(g => (
                        <button key={g} type="button" aria-pressed={grainChoice === g} onClick={() => setGrainChoice(g)}>
                          {g === "auto" ? `Auto (${autoGrain(chartRange.days)})` : g}
                        </button>
                      ))}
                    </span>
                    <Checkbox label="Show comparison" checked={showCompare} onChange={e => setShowCompare(e.target.checked)} />
                  </span>
                </div>
                {range.preset === "today" && <p className="rp-ov-dek" style={{ marginTop: 4 }}>Hourly data isn't recorded — the chart shows the last 7 days for context.</p>}
                <details className="rp-ov-table-toggle">
                  <summary>View chart data as a table</summary>
                  <div style={{ marginTop: 8 }}>
                    <DataTable caption="Chart data" rows={chartData} rowKey={d => d.key}
                      columns={[
                        { key: "d", header: grain === "day" ? "Date" : grain === "week" ? "Week" : "Month", render: d => d.label },
                        { key: "v", header: metricMeta.label, numeric: true, render: d => fmt(d.value) },
                        { key: "p", header: chartRange.compare === "lastYear" ? "Last year" : "Before", numeric: true, render: d => fmt(d.prev) },
                      ]} />
                  </div>
                </details>
              </>
            )}
          </div>
        </article>

        <aside className="rp-ov-run" aria-labelledby="ov-run-title">
          <div className="rp-ov-eyebrow">Live — not tied to the period</div>
          <h2 id="ov-run-title" className="rp-ov-run-title">Today's run sheet</h2>
          <div className="rp-ov-run-total" aria-hidden="true">{openTodos === null ? "…" : openTodos}</div>
          <p className="rp-ov-run-sub">{openTodos === null ? "Counting…" : openTodos === 0 ? "Nothing needs you right now." : `${openTodos} thing${openTodos === 1 ? "" : "s"} need${openTodos === 1 ? "s" : ""} you`}</p>
          {gaReport && gaReport.activeNow !== null && (
            <p className="rp-ov-run-sub"><strong style={{ color: "var(--rp-primary-hover)" }}>{gaReport.activeNow}</strong> {gaReport.activeNow === 1 ? "person is" : "people are"} on the site now (Google Analytics)</p>
          )}
          <ul className="rp-list" aria-label="Things that need attention">
            <RunRow label="paid orders waiting to ship" count={insights ? insights.fulfil.length : null} loading={ordersLoading}
              detail={insights && insights.fulfil[0] ? `Oldest has waited ${insights.fulfil[0].ageDays} day${insights.fulfil[0].ageDays === 1 ? "" : "s"}` : ""}
              onOpen={() => { openFirstActionQueue(); setActiveTab?.("orders"); }} openLabel="Ship orders" />
            <RunRow label="reviews to moderate" count={reviews ? reviews.pending : null} loading={!audience.data && !audience.error}
              detail="Readers are waiting to see these" onOpen={() => setActiveTab?.("reviews")} openLabel="Moderate" />
            <RunRow label="titles to reprint soon" count={insights ? insights.reprint.length : null} loading={ordersLoading || stockLoading}
              detail={`On course to sell out within ${REORDER_COVER_DAYS} days`} onOpen={() => setActiveTab?.("inventory")} openLabel="Open inventory" />
            <RunRow label="print books or editions sold out" count={insights ? insights.shelf.soldOut : null} loading={ordersLoading || stockLoading}
              detail="Customers can't buy these right now" onOpen={() => setActiveTab?.("inventory")} openLabel="Open inventory" />
            <RunRow label="cancel or return requests" count={todos ? todos.requests.length : null} loading={ordersLoading}
              detail="Customers asked from their order page" onOpen={() => { openOrdersQueue("Needs attention"); setActiveTab?.("orders"); }} openLabel="Answer requests" />
            <RunRow label="gift cards not issued" count={todos ? todos.giftCardsMissing.length : null} loading={ordersLoading}
              detail="Paid, but the buyer has no code yet" onOpen={() => setActiveTab?.("giftCards")} openLabel="Open gift cards" />
            <RunRow label="pre-orders awaiting release" count={todos ? todos.awaitingRelease.length : null} loading={ordersLoading}
              detail="Press Ready to ship now on each order when the books arrive" onOpen={() => { openOrdersQueue("Awaiting release"); setActiveTab?.("orders"); }} openLabel="Open pre-orders" />
            <RunRow label="unread messages" count={counts ? counts.unreadMessages : null} loading={!counts}
              detail="From the contact form on your website" onOpen={() => setActiveTab?.("messages")} openLabel="Read messages" />
            <RunRow label="privacy requests" count={counts ? counts.openPrivacyRequests : null} loading={!counts}
              detail="Customers asked for a copy or deletion of their data" onOpen={() => setActiveTab?.("general")} openLabel="Open privacy requests" />
          </ul>
          {(allOrders.error || audience.error || stock.error) && (
            <p className="rp-ov-run-sub">
              {[allOrders.error && "orders", audience.error && "reviews", stock.error && "books"].filter(Boolean).join(", ")} could not be loaded, so some counts are missing.
            </p>
          )}
        </aside>
      </div>

      {/* 4 · The figures behind the story, in ruled columns */}
      {!allOrders.error && (
        <section className="rp-ov-figures" aria-label="Key figures">
          <Figure label="Orders" value={insights ? insights.cur.orders.toLocaleString() : "…"}
            foot={insights ? <><Trend now={insights.cur.orders} before={insights.prev.orders} /> {insights.cur.units.toLocaleString()} books sold</> : KPI_WAIT} />
          <Figure label="Average order" value={insights ? money(insights.cur.aov) : "…"}
            foot={insights ? <><Trend now={insights.cur.aov} before={insights.prev.aov} /> per paid order</> : KPI_WAIT} />
          <Figure label="Visitors" value={trafficReady ? visits.cur.toLocaleString() : trafficFailed ? "—" : "…"}
            foot={trafficReady ? <><Trend now={visits.cur} before={visits.prev} /> {sourceName}</> : trafficFooter(KPI_WAIT)} />
          <Figure label="Visitors → sale" value={conv ? percent(conv.cur) : trafficFailed ? "—" : "…"}
            foot={conv ? <><Trend now={conv.cur} before={conv.prev} /> paid orders ÷ visitors</> : trafficFooter(KPI_WAIT)} />
          <Figure label="Bag → checkout" value={trafficReady && cartStep !== null ? percent(cartStep, 0) : trafficReady ? "—" : "…"}
            foot={trafficReady && funnel ? (funnel.add_to_cart > 0 ? `${funnel.checkout_start.toLocaleString()} checkouts from ${funnel.add_to_cart.toLocaleString()} bag adds` : "no bag adds recorded yet") : trafficFooter(KPI_WAIT)} />
          <Figure label="Gross profit" value={profit ? (profit.costedUnits > 0 ? money(profit.profit) : "—") : "…"}
            foot={profit ? (profit.costedUnits > 0 ? `${profit.margin === null ? "—" : percent(profit.margin, 0)} margin · cost known for ${percent(profit.coverage, 0)} of copies` : "add cost prices in Inventory to see profit") : KPI_WAIT} />
          <Figure label="Returning readers" value={insights ? percent(insights.mix.returningRate, 0) : "…"}
            foot={insights ? `${insights.mix.returning} returning · ${insights.mix.fresh} new` : KPI_WAIT} />
          <Figure label="Refunds & codes" tone={insights && insights.cur.refunded > 0 ? "warn" : undefined} value={insights ? money(insights.cur.refunded + insights.cur.discounts) : "…"}
            foot={insights ? `${money(insights.cur.refunded)} refunded · ${money(insights.cur.discounts)} in codes` : KPI_WAIT} />
        </section>
      )}

      {/* 5 · What changed, beside the newest orders */}
      <div className="rp-split" style={SPLIT}>
        <SectionCard flush title="What changed" description={`The biggest moves compared with ${range.before}`}>
          {allOrders.error ? <ErrorState title="Changes unavailable" description="Orders could not be loaded." onRetry={refresh} />
            : !changes ? <LoadingState label="Comparing…" />
            : changes.length === 0 ? <EmptyState icon="≈" title="Nothing moved much" description={`Sales, titles and traffic are close to ${range.before}.`} />
            : (
              <ul className="rp-list" aria-label="What changed">
                {changes.map(c => (
                  <li key={c.id} style={ROW}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{c.title}</div>
                      <div className="rp-hint">{c.detail}</div>
                    </div>
                    <StatusBadge tone={CHANGE_BADGE[c.tone].tone}>{CHANGE_BADGE[c.tone].text}</StatusBadge>
                  </li>
                ))}
              </ul>
            )}
        </SectionCard>
        <SectionCard flush title="Newest orders" actions={<SecondaryButton size="sm" onClick={() => setActiveTab?.("orders")}>All orders</SecondaryButton>}>
          {allOrders.error ? <ErrorState title="Orders unavailable" description="Recent orders could not be loaded." />
            : !allOrders.orders ? <LoadingState label="Loading orders…" />
            : <DataTable caption="Newest orders" columns={recentColumns} rows={recentOrders} rowKey={o => o.id}
                empty={<EmptyState title="No orders yet" description="New orders appear here as soon as customers check out." />} />}
        </SectionCard>
      </div>

      {/* 6 · Detail, grouped by the question you're asking */}
      <SectionHead kicker="Inside this issue" title="Dig deeper" subcopy={SECTION_COPY[section]}
        actions={<Tabs<Section> label="Detail" value={section} onChange={setSection}
          tabs={[{ id: "sales", label: "Sales" }, { id: "titles", label: "Titles" }, { id: "marketing", label: "Marketing & traffic" }, { id: "customers", label: "Customers" }, { id: "stock", label: "Stock" }]} />} />

      {section === "stock" ? (
        stock.error ? <ErrorState title="Stock unavailable" description="Books could not be loaded." onRetry={refresh} />
        : !insights ? (allOrders.error ? <ErrorState title="Stock insights unavailable" description="Orders could not be loaded, so sales pace can't be calculated." onRetry={refresh} /> : <LoadingState label="Calculating…" />)
        : <OverviewStock key={reloadKey} books={books} shelf={insights.shelf} reprint={insights.reprint} dormant={insights.dormant} setActiveTab={setActiveTab} />
      ) : allOrders.error ? <ErrorState title="Details unavailable" description="Orders could not be loaded, so these lists can't be calculated." onRetry={refresh} />
        : !insights || !periods ? <LoadingState label="Calculating…" />
        : section === "sales" ? (
          <OverviewSales current={periods.current} previous={periods.previous} books={books} dailyCurrent={dailyCurrent}
            categoriesSetting={launch.parts?.settings?.design?.categories} onEditBook={handleEditClick} fetchingBookId={fetchingBookId} />
        ) : section === "titles" ? (
          <OverviewTitles rows={titleRows} startKey={range.startKey} endKey={range.endKey} viewsRecorded={!!recordedSince(daily.rows || [], "bookViews")}
            costsKnown={!!profit && profit.costedUnits > 0} onEditBook={handleEditClick} fetchingBookId={fetchingBookId} />
        ) : section === "marketing" ? (
          trafficFailed && ga.status !== "loading" ? <ErrorState title="Traffic unavailable" description="Visits, searches and sources could not be loaded." onRetry={loadDaily} />
          : !traffic ? <LoadingState label="Loading traffic…" />
          : <OverviewMarketing ga={ga} traffic={traffic} dailyCurrent={dailyCurrent} dailyAll={daily.rows || []} current={periods.current} books={books}
              lastReset={lastReset} onReset={resetTraffic} setActiveTab={setActiveTab} />
        ) : (
          <OverviewCustomers key={reloadKey} paid={periods.paid} current={periods.current} startKey={periods.startKey} mix={insights.mix} startMs={periods.start}
            reviews={reviews} subs={subs} audienceFailed={audience.error} setActiveTab={setActiveTab} />
        )}
    </div>
  );
}
