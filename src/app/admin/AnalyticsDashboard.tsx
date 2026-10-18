import { openFirstActionQueue, openOrdersQueue } from "./Orders";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { adminApi } from "./api";
import { inventoryApi } from "./inventoryApi";
import { getOrdersCached } from "./ordersCache";
import { salesReportCsv } from "./salesReport";
import { launchReadiness } from "./launchReadiness";
import toast from "react-hot-toast";
import {
  DataTable, EmptyState, ErrorState, LoadingState, SectionCard, StatusBadge, type BadgeTone, type Column,
} from "./riso/components";
import {
  bestSellers, customerMix, dormantStock, newestSales, newsletterSummary, orderStatusWords, orderTodos, reprintWatch, reviewSummary,
  splitRange, stockValue, titleStock, toFulfil, totals, REORDER_COVER_DAYS,
} from "./overviewInsights";
import { recordedSince, sumMap } from "./overviewTraffic";
import { PRESETS, rangeWords, resolveRange, trafficShift, trafficWindow, type CompareMode, type Preset } from "./overviewRange";
import { autoGrain } from "./overviewRange";
import { bucketSeries, buildRangeSeries, metricValue, monthPace, type ChartMetric } from "./overviewSeries";
import { mergeNewestPage } from "./ordersDesk";
import { googleTraffic, shopRowsIn, shopTraffic } from "./overviewSources";
import { whatChanged, type Change } from "./overviewChanges";
import { profitSummary, titlePerformance } from "./overviewProfit";
import { googleAnalyticsApi } from "./googleAnalytics";
import { shopDayKey } from "../lib/shopDay";
import { isOwnOrder } from "../lib/ownerDevice";
import { Figure, NeedsList, Pill, ReadinessStrip, ROW, Trend, money, percent, type NeedItem } from "./OverviewParts";
import { readinessSummary } from "./launchReadiness";
import { leadStory } from "./overviewStory";
import { OverviewSales } from "./OverviewSales";
import { GOOGLE_PARTS, OverviewMarketing, type GaState } from "./OverviewMarketing";
import { FoundOnGoogleCard } from "./OverviewMarketingExtras";
import { OverviewCustomers } from "./OverviewCustomers";
import { OverviewStock } from "./OverviewStock";
import { OverviewTitles } from "./OverviewTitles";
import { OverviewChart } from "./OverviewChart";
import { OverviewBoard, useBoardStore, type BoardHeader, type RenderWidget } from "./OverviewBoard";
import { DEFAULT_FIGURES, FIGURES, widgetMeta, type BoardView, type FigureId } from "./overviewBoard";
import { clearShared } from "./overviewShared";

const PREFS_KEY = "lm:overview-view";
type Prefs = { preset?: Preset; compare?: CompareMode; from?: string; to?: string };
const readPrefs = (): Prefs => { try { return JSON.parse(window.localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch { return {}; } };
const writePrefs = (p: Prefs) => { try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* per-browser convenience only */ } };
/** How often the board quietly re-reads the newest orders, the to-do counts and today's visits while it is on screen. */
export const AUTO_REFRESH_MS = 5 * 60_000;
/** The period buttons, in the B4 board's short words; `title` says each in full. */
const PERIOD_BUTTONS: Array<{ id: Preset; label: string; title: string }> = [
  { id: "today", label: "Today", title: "Today" }, { id: "7d", label: "7d", title: "The last 7 days" }, { id: "30d", label: "30d", title: "The last 30 days" },
  { id: "90d", label: "90d", title: "The last 90 days" }, { id: "mtd", label: "MTD", title: "This month so far" }, { id: "lastMonth", label: "Last month", title: "Last calendar month" },
  { id: "ytd", label: "YTD", title: "This year so far" }, { id: "365d", label: "12m", title: "The last 12 months" }, { id: "custom", label: "Custom", title: "Pick your own dates" },
];
/** Figures that have a day-by-day line to draw under them. */
const SPARK_METRIC: Partial<Record<FigureId, ChartMetric>> = { revenue: "revenue", orders: "orders", units: "units", aov: "aov", visitors: "visitors", conversion: "conversion" };
const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const CHANGE_BADGE: Record<Change["tone"], { tone: BadgeTone; text: string }> = {
  up: { tone: "success", text: "▲ Up" }, down: { tone: "danger", text: "▼ Down" }, info: { tone: "info", text: "● New" }, warn: { tone: "warning", text: "! Check" },
};

export function AnalyticsDashboard({ setActiveTab, onEditBook }: { setActiveTab?: (tab: string) => void; onEditBook?: (book: any) => void }) {
  const saved = useMemo(readPrefs, []);
  const [preset, setPreset] = useState<Preset>(saved.preset && PRESETS.some(p => p.id === saved.preset) ? saved.preset : "30d");
  const [compareMode, setCompareMode] = useState<CompareMode>(saved.compare === "lastYear" ? "lastYear" : "previous");
  const [custom, setCustom] = useState({ from: saved.from || "", to: saved.to || "" });
  const boards = useBoardStore();
  const [fetchingBookId, setFetchingBookId] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Every source loads on its own so one failure never blanks the page.
  const [daily, setDaily] = useState<{ rows: any[] | null; error: boolean }>({ rows: null, error: false });
  const [allOrders, setAllOrders] = useState<{ orders: any[] | null; error: boolean }>({ orders: null, error: false });
  const [stock, setStock] = useState<{ books: any[] | null; error: boolean }>({ books: null, error: false });
  const [audience, setAudience] = useState<{ data: { reviews: any[]; subscribers: any[]; pendingSubscribers?: any[]; pendingReviews?: number | null; approvedReviews?: { count: number; average: number | null } | null } | null; error: boolean }>({ data: null, error: false });
  const [counts, setCounts] = useState<{ pendingReviews?: number | null; unreadMessages: number | null; openPrivacyRequests: number | null } | null>(null);
  const [launch, setLaunch] = useState<{ parts: any | null; error: boolean }>({ parts: null, error: false });
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [ga, setGa] = useState<GaState>({ status: "loading" });
  const [lastReset, setLastReset] = useState<{ at: string; removedDays: number } | null>(null);
  const [firstTrafficDay, setFirstTrafficDay] = useState<string | null>(null);

  const [tick, setTick] = useState(0);
  const range = useMemo(() => resolveRange(preset, { custom, compare: compareMode }), [preset, custom, compareMode, reloadKey, tick]);
  useEffect(() => { writePrefs({ preset, compare: compareMode, from: custom.from, to: custom.to }); }, [preset, compareMode, custom]);

  // Every daily traffic doc of the range AND its comparison window, however long ago (a year-on-year view needs ~2 years).
  const { fromKey: trafficFrom, toKey: trafficTo } = trafficWindow(range);
  const loadDaily = useCallback(() => {
    setDaily(d => ({ rows: d.rows, error: false }));
    adminApi.getDailyAnalyticsBetween(trafficFrom, trafficTo).then((rows: any[]) => setDaily({ rows, error: false }))
      .catch((err: unknown) => { console.error(err); setDaily({ rows: null, error: true }); toast.error("Traffic figures could not be loaded"); });
  }, [trafficFrom, trafficTo]);
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
    adminApi.getFirstAnalyticsDay().then(setFirstTrafficDay).catch(() => setFirstTrafficDay(null));
  }, [reloadKey]);

  // The shared reads (carts, sign-ups, Search Console) last one visit: coming back to the Overview reads them again.
  useEffect(() => () => clearShared(), []);

  // Every 5 minutes while the Overview is on screen (and on coming back to the tab after that long): the newest
  // 50 orders, the to-do counts and the last two days of visits. Cheap reads only; Refresh reads everything again.
  const quiet = useRef({ busy: false, at: Date.now() });
  const quietRefresh = useCallback(() => {
    if (quiet.current.busy) return;
    quiet.current = { busy: true, at: Date.now() };
    const utcToday = new Date().toISOString().slice(0, 10);
    const utcYesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    Promise.allSettled([
      adminApi.getOrders(50).then((page: any[]) => {
        const clean = page.map(({ _lastDoc, ...o }: any) => o);
        setAllOrders(a => (a.orders ? { orders: mergeNewestPage(a.orders, clean), error: false } : a));
        setLoadedAt(new Date());
      }),
      adminApi.getAdminBadgeCounts().then(setCounts),
      adminApi.getDailyAnalyticsBetween(utcYesterday, utcToday).then((fresh: any[]) => setDaily(d => {
        if (!d.rows) return d;
        const ids = new Set(fresh.map(r => r.id));
        return { rows: [...d.rows.filter(r => !ids.has(r.id)), ...fresh].sort((a, b) => String(a.date).localeCompare(String(b.date))), error: false };
      })),
    ]).finally(() => { quiet.current.busy = false; setTick(t => t + 1); });
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") quietRefresh(); }, AUTO_REFRESH_MS);
    const back = () => { if (document.visibilityState === "visible" && Date.now() - quiet.current.at >= AUTO_REFRESH_MS) quietRefresh(); };
    document.addEventListener("visibilitychange", back);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", back); };
  }, [quietRefresh]);

  const refresh = () => {
    setAllOrders({ orders: null, error: false }); setStock({ books: null, error: false });
    setAudience({ data: null, error: false }); setLaunch({ parts: null, error: false }); setDaily({ rows: null, error: false });
    // Panels that load their own extra data (carts, stock sign-ups, Search Console) remount via their key and read again.
    clearShared();
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
  // Orders the owner placed themselves (with the shop's own email) stay in Orders and
  // in today's to-dos, but are left out of every figure below so they never look like customers.
  const shopOrders = useMemo(() => (allOrders.orders ? allOrders.orders.filter(o => !isOwnOrder(o)) : null), [allOrders.orders]);
  const periods = useMemo(() => (shopOrders ? splitRange(shopOrders, range) : null), [shopOrders, range]);
  const ownOrderCount = useMemo(() => splitRange((allOrders.orders || []).filter(o => isOwnOrder(o)), range).current.length, [allOrders.orders, range]);
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
    // The to-do counts are re-read every 5 minutes, so their pending-review count is the freshest.
    const pending = typeof counts?.pendingReviews === "number" ? counts.pendingReviews : audience.data.pendingReviews;
    const server = {
      ...(typeof pending === "number" ? { pending } : {}),
      ...(audience.data.approvedReviews ? { approved: audience.data.approvedReviews.count, average: audience.data.approvedReviews.average } : {}),
    };
    return { ...s, ...server };
  }, [audience.data, counts?.pendingReviews]);
  const todos = useMemo(() => (allOrders.orders ? orderTodos(allOrders.orders) : null), [allOrders.orders]);
  const subs = audience.data && periods ? newsletterSummary(audience.data.subscribers, periods.start) : null;

  const changes = useMemo(() => (insights && periods ? whatChanged({
    cur: insights.cur, prev: insights.prev, current: periods.current, previous: periods.previous,
    visits: trafficReady ? visits : null, before: range.before, money,
  }) : null), [insights, periods, trafficReady, visits.cur, visits.prev, range.before]);

  const titleRows = useMemo(() => (periods ? titlePerformance({
    current: periods.current, previous: periods.previous, books, costs,
    viewsById: recordedSince(daily.rows || [], "bookViews") ? sumMap(dailyCurrent, "bookViews") : null,
    addsById: recordedSince(daily.rows || [], "bookAdds") ? sumMap(dailyCurrent, "bookAdds") : null,
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
  const resetTraffic = async () => {
    const result = await googleAnalyticsApi.resetTraffic();
    setLastReset({ at: result.at, removedDays: result.removedDays });
    setFirstTrafficDay(null);
    toast.success(`Traffic counts reset — ${result.removedDays} day${result.removedDays === 1 ? "" : "s"} cleared. Counting starts now.`);
    loadDaily();
  };

  const ordersLoading = !insights && !allOrders.error;
  const stockLoading = stock.books === null && !stock.error;
  const KPI_WAIT = "Loading…";
  const trafficFooter = (text: string) => (trafficFailed ? "Traffic unavailable" : !trafficReady ? KPI_WAIT : text);
  const refreshLabel = loadedAt ? `Updated ${loadedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · auto every 5 min` : "Loading…";

  const story = insights ? leadStory({ cur: insights.cur, prev: insights.prev, top: insights.top, days: range.preset === "today" ? 1 : Math.max(2, range.days), phrase: range.phrase, money, before: range.before }) : null;
  const cartStep = funnel && funnel.add_to_cart > 0 ? (funnel.checkout_start / funnel.add_to_cart) * 100 : null;
  const profit = insights?.profit;

  const viewsRecorded = !!recordedSince(daily.rows || [], "bookViews");
  const addsRecorded = !!recordedSince(daily.rows || [], "bookAdds");
  const discountRate = insights && insights.cur.subtotal > 0 ? (insights.cur.discounts / insights.cur.subtotal) * 100 : 0;
  const prevDiscountRate = insights && insights.prev.subtotal > 0 ? (insights.prev.discounts / insights.prev.subtotal) * 100 : 0;

  // One line per figure under its number: day by day, or by week or month over long periods.
  const sparks = useMemo(() => {
    if (!periods) return null;
    const visitsOn = traffic?.visitsOn || (() => 0);
    return bucketSeries(buildRangeSeries(periods.paid, range, visitsOn), autoGrain(range.days));
  }, [periods, range, traffic]);
  const sparkFor = (id: FigureId) => {
    const metric = SPARK_METRIC[id];
    if (!sparks || !metric || sparks.length < 2 || ((metric === "visitors" || metric === "conversion") && !trafficReady)) return undefined;
    return sparks.map(b => metricValue(b, metric));
  };

  // Every number a "Key figures" widget can show, worked out once for all of them.
  const figure = (id: FigureId) => {
    const wait = { value: "…", foot: KPI_WAIT };
    switch (id) {
      case "revenue": return insights ? { value: money(insights.cur.net), foot: <><Trend now={insights.cur.net} before={insights.prev.net} /> after refunds</> } : wait;
      case "orders": return insights ? { value: insights.cur.orders.toLocaleString(), foot: <><Trend now={insights.cur.orders} before={insights.prev.orders} /> paid orders</> } : wait;
      case "units": return insights ? { value: insights.cur.units.toLocaleString(), foot: <><Trend now={insights.cur.units} before={insights.prev.units} /> copies</> } : wait;
      case "aov": return insights ? { value: money(insights.cur.aov), foot: <><Trend now={insights.cur.aov} before={insights.prev.aov} /> per paid order</> } : wait;
      case "visitors": return trafficReady ? { value: visits.cur.toLocaleString(), foot: <><Trend now={visits.cur} before={visits.prev} /> {sourceName}</> } : { value: trafficFailed ? "—" : "…", foot: trafficFooter(KPI_WAIT) };
      case "conversion": return conv ? { value: percent(conv.cur), foot: <><Trend now={conv.cur} before={conv.prev} /> paid orders ÷ visitors</> } : { value: trafficFailed ? "—" : "…", foot: trafficFooter(KPI_WAIT) };
      case "cartStep": return trafficReady
        ? { value: cartStep !== null ? percent(cartStep, 0) : "—", foot: funnel && funnel.add_to_cart > 0 ? `${funnel.checkout_start.toLocaleString()} checkouts from ${funnel.add_to_cart.toLocaleString()} bag adds` : "no bag adds recorded yet" }
        : { value: "…", foot: trafficFooter(KPI_WAIT) };
      case "profit": return profit
        ? { value: profit.costedUnits > 0 ? money(profit.profit) : "—", foot: profit.costedUnits > 0 ? `${profit.margin === null ? "—" : percent(profit.margin, 0)} margin · cost known for ${percent(profit.coverage, 0)} of copies` : "add cost prices in Inventory to see profit" }
        : wait;
      case "returning": return insights ? { value: percent(insights.mix.returningRate, 0), foot: `${insights.mix.returning} returning · ${insights.mix.fresh} new` } : wait;
      case "refunds": return insights ? { value: money(insights.cur.refunded + insights.cur.discounts), foot: `${money(insights.cur.refunded)} refunded · ${money(insights.cur.discounts)} in codes`, tone: insights.cur.refunded > 0 ? "warn" as const : undefined } : wait;
      case "shipping": return insights ? { value: money(insights.cur.shipping), foot: <><Trend now={insights.cur.shipping} before={insights.prev.shipping} /> charged to customers</> } : wait;
      case "discounts": return insights ? { value: percent(discountRate), foot: `${percent(prevDiscountRate)} before · share of list price given in codes` } : wait;
    }
  };

  const ordersGate = (content: () => React.ReactNode) => (
    allOrders.error ? <ErrorState title="Figures unavailable" description="Orders could not be loaded, so this can't be calculated." onRetry={refresh} />
      : !insights || !periods ? <LoadingState label="Calculating…" /> : content()
  );
  const marketing = (only: string) => (only in GOOGLE_PARTS
    // Search Console needs neither orders nor the shop's traffic, so a failure there never holds these up.
    ? <FoundOnGoogleCard range={{ startDate: range.startKey, endDate: range.endKey, prevStartDate: range.prevStartKey, prevEndDate: range.prevEndKey }}
        setActiveTab={setActiveTab} part={GOOGLE_PARTS[only]} />
    : ordersGate(() => (
    trafficFailed && ga.status !== "loading" && !only.startsWith("google") ? <ErrorState title="Traffic unavailable" description="Visits, searches and sources could not be loaded." onRetry={loadDaily} />
      : !traffic ? <LoadingState label="Loading traffic…" />
      : <OverviewMarketing only={only} ga={ga} traffic={traffic} dailyCurrent={dailyCurrent} dailyAll={daily.rows || []} current={periods!.current} paidAll={periods!.paid} books={books}
          range={{ startDate: range.startKey, endDate: range.endKey, prevStartDate: range.prevStartKey, prevEndDate: range.prevEndKey }}
          lastReset={lastReset} firstDay={firstTrafficDay} onReset={resetTraffic} setActiveTab={setActiveTab} />
  )));

  // "Needs you": live jobs, not tied to the period. Each row opens the page where it is done.
  const oldestWait = insights?.fulfil[0]?.ageDays ?? 0;
  const requestsAllCancel = !!todos && todos.requests.every((o: any) => (o.customerRequest?.type || "cancel") === "cancel");
  const needs: NeedItem[] = [
    { id: "ship", count: insights ? insights.fulfil.length : null, loading: ordersLoading, openLabel: "Ship orders",
      title: n => plural(n, "order to ship", "orders to ship"),
      detail: oldestWait > 0 ? `Oldest has waited ${plural(oldestWait, "day", "days")}` : "Paid today",
      pill: oldestWait >= 2 ? { tone: "danger", glyph: "●", text: plural(oldestWait, "day", "days") } : oldestWait === 1 ? { tone: "warning", glyph: "◐", text: "1 day" } : { tone: "info", glyph: "●", text: "Today" },
      onOpen: () => { openFirstActionQueue(); setActiveTab?.("orders"); } },
    { id: "requests", count: todos ? todos.requests.length : null, loading: ordersLoading, openLabel: "Answer requests",
      title: n => plural(n, requestsAllCancel ? "cancel request" : "customer request", requestsAllCancel ? "cancel requests" : "customer requests"),
      detail: "A shopper asked before it ships", pill: { tone: "warning", glyph: "◐", text: "Open" },
      onOpen: () => { openOrdersQueue("Needs attention"); setActiveTab?.("orders"); } },
    { id: "giftcards", count: todos ? todos.giftCardsMissing.length : null, loading: ordersLoading, openLabel: "Open gift cards",
      title: n => plural(n, "gift card not issued", "gift cards not issued"), detail: "Paid, but the buyer has no code yet",
      pill: { tone: "danger", glyph: "!", text: "Fix" }, onOpen: () => setActiveTab?.("giftCards") },
    { id: "reprint", count: insights ? insights.reprint.length : null, loading: ordersLoading || stockLoading, openLabel: "Open inventory",
      title: n => plural(n, "reprint", "reprints"), detail: `On course to sell out within ${REORDER_COVER_DAYS} days`,
      pill: { tone: "warning", glyph: "◐", text: "Decide" }, onOpen: () => setActiveTab?.("inventory") },
    { id: "soldout", count: insights ? insights.shelf.soldOut : null, loading: ordersLoading || stockLoading, openLabel: "Open inventory",
      title: n => plural(n, "book sold out", "books sold out"), detail: "Customers can't buy these right now",
      pill: { tone: "danger", glyph: "✕", text: "Sold out" }, onOpen: () => setActiveTab?.("inventory") },
    { id: "preorders", count: todos ? todos.awaitingRelease.length : null, loading: ordersLoading, openLabel: "Open pre-orders",
      title: n => plural(n, "pre-order awaiting release", "pre-orders awaiting release"), detail: "Ship each one when the books arrive",
      pill: { tone: "info", glyph: "●", text: "Waiting" }, onOpen: () => { openOrdersQueue("Awaiting release"); setActiveTab?.("orders"); } },
    { id: "reviews", count: reviews ? reviews.pending : null, loading: !audience.data && !audience.error, openLabel: "Moderate reviews",
      title: n => plural(n, "review", "reviews"), detail: "Waiting for approval",
      pill: { tone: "info", glyph: "●", text: `${reviews?.pending || 0} new` }, onOpen: () => setActiveTab?.("reviews") },
    { id: "messages", count: counts ? counts.unreadMessages : null, loading: !counts, openLabel: "Read messages",
      title: n => plural(n, "message", "messages"), detail: "Waiting for a reply",
      pill: { tone: "info", glyph: "●", text: `${counts?.unreadMessages || 0} new` }, onOpen: () => setActiveTab?.("messages") },
    { id: "privacy", count: counts ? counts.openPrivacyRequests : null, loading: !counts, openLabel: "Open privacy requests",
      title: n => plural(n, "privacy request", "privacy requests"), detail: "A copy or deletion of their data",
      pill: { tone: "warning", glyph: "◐", text: "Open" }, onOpen: () => setActiveTab?.("general") },
  ];
  const needsMissing = [allOrders.error && "orders", audience.error && "reviews", stock.error && "books"].filter(Boolean) as string[];
  const needsList = (
    <NeedsList items={needs}
      live={gaReport && gaReport.activeNow !== null ? <><b>{gaReport.activeNow}</b> {gaReport.activeNow === 1 ? "person is" : "people are"} on the site now (Google Analytics)</> : undefined}
      missing={needsMissing.length ? `${needsMissing.join(", ")} could not be loaded, so some jobs may be missing.` : undefined} />
  );

  const renderWidget: RenderWidget = (w, { full, setConfig }) => {
    const band = widgetMeta(w.type).band;
    switch (w.type) {
      case "needs": return needsList;
      case "readiness":
        return launch.error ? <ErrorState title="Launch checks unavailable" description="Settings, shipping or email records could not be loaded. Readiness is unknown until these checks refresh." onRetry={refresh} />
          : !readiness ? <LoadingState label="Checking…" />
          : readinessSummary(readiness) === "ok" ? <EmptyState icon="✓" title="Ready to sell" description="Every launch check passes." />
          : <ReadinessStrip items={readiness} onOpen={tab => setActiveTab?.(tab)} />;
      case "changes":
        return (
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
        );
      case "newest":
        if (allOrders.error) return <ErrorState title="Orders unavailable" description="Recent orders could not be loaded." onRetry={refresh} />;
        if (!allOrders.orders) return <LoadingState label="Loading orders…" />;
        if (full) {
          return <DataTable caption="Newest orders" columns={recentColumns} rows={newestSales(allOrders.orders, 25)} rowKey={o => o.id}
            empty={<EmptyState title="No orders yet" description="New orders appear here as soon as customers check out." />} />;
        }
        return recentOrders.length === 0 ? <EmptyState title="No orders yet" description="New orders appear here as soon as customers check out." /> : (
          <div>
            <ul className="rp-wb-rows" aria-label="Newest orders">
              {recentOrders.map((o: any) => {
                const w = orderStatusWords(o);
                return (
                  <li key={o.id}>
                    <a className="rp-wb-nrow" href={`#orders/${encodeURIComponent(o.id)}`} aria-label={`Open order ${o.orderId || o.id}`}>
                      <span className="rp-wb-nrow-main"><b>{o.customer?.name || o.customer?.email || "Customer"}</b><small className="rp-mono">{o.orderId || o.id}</small></span>
                      <span className="rp-wb-nrow-end"><span className="rp-mono">{money(o.total)}</span>
                        <Pill tone={w === "Refunded" || w === "Needs attention" ? "warning" : w === "Paid · to send" ? "info" : "success"} glyph={w === "Paid · to send" ? "●" : w === "Refunded" || w === "Needs attention" ? "◐" : "✓"}>{w}</Pill></span>
                    </a>
                  </li>
                );
              })}
            </ul>
            <p className="rp-wb-foot"><button type="button" className="rp-wb-a" onClick={() => setActiveTab?.("orders")}>All orders →</button></p>
          </div>
        );
      case "story":
        return (
          <article className="rp-ov-lead" aria-label="Headline">
            <div className="rp-ov-eyebrow">Lead story · {range.phrase}</div>
            <p className="rp-ov-headline" style={{ fontSize: full ? undefined : "clamp(22px, 2.4vw, 32px)" }}>
              {allOrders.error ? "Sales figures unavailable" : story ? story.headline : "Counting this period's sales…"}
            </p>
            <p className="rp-ov-dek">
              {allOrders.error ? "Orders could not be loaded, so revenue can't be calculated." : story ? story.dek : "Paid orders are loading."}
              {insights && insights.cur.refunded > 0 && ` After ${money(insights.cur.refunded)} refunded.`}
            </p>
            {insights?.pace && insights.pace.soFar > 0 && (
              <p className="rp-ov-dek">
                This month: {money(insights.pace.soFar)} in {insights.pace.daysIn} days — on pace for about <strong>{money(Math.round(insights.pace.projected))}</strong> by month end (a projection at this month's daily average).
              </p>
            )}
          </article>
        );
      case "chart":
        return (
          <OverviewChart widgetId={w.id} paid={periods ? periods.paid : null} range={range} compareMode={compareMode} traffic={traffic}
            trafficReady={trafficReady} trafficFailed={trafficFailed} ordersError={allOrders.error} sourceName={sourceName}
            config={w.config || {}} onConfig={setConfig} onRetry={refresh} onRetryTraffic={loadDaily} full={full} />
        );
      case "figures": {
        if (allOrders.error) return <ErrorState title="Figures unavailable" description="Orders could not be loaded." onRetry={refresh} />;
        const ids = (w.config?.figures?.length ? w.config.figures : DEFAULT_FIGURES) as FigureId[];
        return (
          <section className="rp-ov-figures" aria-label="Key figures">
            {ids.map(id => { const f = figure(id); return <Figure key={id} label={FIGURES.find(x => x.id === id)!.label} value={f.value} foot={f.foot} tone={(f as any).tone} spark={sparkFor(id)} />; })}
          </section>
        );
      }
      case "titles":
        return ordersGate(() => (
          <OverviewTitles rows={titleRows} startKey={range.startKey} endKey={range.endKey} viewsRecorded={viewsRecorded} addsRecorded={addsRecorded}
            costsKnown={!!profit && profit.costedUnits > 0} onEditBook={handleEditClick} fetchingBookId={fetchingBookId} />
        ));
      case "viewed": return marketing("viewed");
      default: break;
    }
    if (band === "sales") {
      return ordersGate(() => (
        <OverviewSales only={w.type} current={periods!.current} previous={periods!.previous} books={books} dailyCurrent={dailyCurrent}
          categoriesSetting={launch.parts?.settings?.design?.categories} onEditBook={handleEditClick} fetchingBookId={fetchingBookId} />
      ));
    }
    if (band === "traffic" || band === "search") return marketing(w.type);
    if (band === "customers") {
      return ordersGate(() => (
        <OverviewCustomers key={reloadKey} only={w.type === "custKpis" ? "kpis" : w.type} paid={periods!.paid} current={periods!.current} startKey={periods!.startKey} mix={insights!.mix} startMs={periods!.start}
          reviews={reviews} subs={subs} audienceFailed={audience.error} setActiveTab={setActiveTab}
          newsletter={audience.data ? { subscribers: audience.data.subscribers, pending: audience.data.pendingSubscribers || [] } : null} />
      ));
    }
    if (band === "stock") {
      return stock.error ? <ErrorState title="Stock unavailable" description="Books could not be loaded." onRetry={refresh} />
        : !insights ? (allOrders.error ? <ErrorState title="Stock insights unavailable" description="Orders could not be loaded, so sales pace can't be calculated." onRetry={refresh} /> : <LoadingState label="Calculating…" />)
        : <OverviewStock key={reloadKey} only={w.type === "stockKpis" ? "kpis" : w.type} books={books} shelf={insights.shelf} reprint={insights.reprint} dormant={insights.dormant} setActiveTab={setActiveTab}
            dailyCurrent={dailyCurrent} dailyAll={daily.rows || []} />;
    }
    return null;
  };

  // The board's header (design B4): the period buttons and comparison every figure follows. The board adds the
  // title, layout picker, Edit board and the hint line around it.
  const view: BoardView = { preset, compare: compareMode, ...(preset === "custom" ? { from: custom.from, to: custom.to } : {}) };
  const applyView = (v: BoardView) => {
    setPreset(v.preset); setCompareMode(v.compare);
    if (v.preset === "custom" && v.from && v.to) setCustom({ from: v.from, to: v.to });
  };
  const header: BoardHeader = {
    updated: <>{refreshLabel}{traffic ? ` · traffic from ${sourceName}` : ""}</>,
    period: (
      <>
        <div className="rp-wb-seg" role="group" aria-label="Period">
          {PERIOD_BUTTONS.map(p => (
            <button key={p.id} type="button" aria-pressed={preset === p.id} title={p.title} onClick={() => setPreset(p.id)}>{p.label}</button>
          ))}
        </div>
        {preset === "custom" && (
          <span className="rp-wb-dates">
            <label className="rp-wb-lbl" htmlFor="wb-from">From</label>
            <input id="wb-from" className="rp-wb-select" type="date" value={custom.from} max={custom.to || shopDayKey(Date.now())} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} />
            <label className="rp-wb-lbl" htmlFor="wb-to">To</label>
            <input id="wb-to" className="rp-wb-select" type="date" value={custom.to} min={custom.from || undefined} max={shopDayKey(Date.now())} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} />
          </span>
        )}
        <label className="rp-wb-lbl" htmlFor="wb-compare">vs</label>
        <select id="wb-compare" className="rp-wb-select" value={compareMode} onChange={e => setCompareMode(e.target.value as CompareMode)}>
          <option value="previous">Period before</option>
          <option value="lastYear">Same days last year</option>
        </select>
      </>
    ),
    summary: (
      <>
        <b>{range.phrase[0].toUpperCase() + range.phrase.slice(1)}</b>{range.preset !== "custom" && <> ({rangeWords(range.startKey, range.endKey)})</>}
        {" "}against {range.before}.{preset === "custom" && range.preset !== "custom" && " Pick both dates to use your own range."}
        {ownOrderCount > 0 && ` ${ownOrderCount} ${ownOrderCount === 1 ? "order" : "orders"} you placed yourself ${ownOrderCount === 1 ? "is" : "are"} left out.`}
      </>
    ),
    viewName: range.phrase,
    view, onApplyView: applyView,
    onExport: downloadReport, exportReady: !!periods,
    onRefresh: refresh, refreshing: ordersLoading,
  };

  return (
    <OverviewBoard store={boards.store} setStore={boards.setStore} saveState={boards.saveState} saveError={boards.saveError}
      onRetrySave={boards.retrySave} renderWidget={renderWidget} header={header} />
  );
}
