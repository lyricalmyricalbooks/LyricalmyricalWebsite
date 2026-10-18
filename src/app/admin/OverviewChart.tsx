import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Checkbox, DataTable, ErrorState, LoadingState } from "./riso/components";
import type { Order } from "./overviewInsights";
import { autoGrain, resolveRange, type CompareMode, type Grain, type Range } from "./overviewRange";
import { bucketSeries, buildRangeSeries, CHART_METRICS, metricValue, seriesSummary, type ChartMetric } from "./overviewSeries";
import type { TrafficFigures } from "./overviewSources";
import type { ChartGrain, WidgetConfig } from "./overviewBoard";
import { Trend, money, percent } from "./OverviewParts";

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * One trend chart on the Overview board, drawn as the B4 board does: the period's total with its change, visitors
 * beside it, a flare line for this period, a dashed line for the one before and grey visitor bars behind. Each
 * chart widget keeps its own measure, grouping, comparison and bars (saved in the widget's settings).
 */
export function OverviewChart({ widgetId, paid, range, compareMode, traffic, trafficReady, trafficFailed, ordersError, sourceName, config, onConfig, onRetry, onRetryTraffic, full }: {
  widgetId: string; paid: Order[] | null; range: Range; compareMode: CompareMode; traffic: TrafficFigures | null;
  trafficReady: boolean; trafficFailed: boolean; ordersError: boolean; sourceName: string;
  config: WidgetConfig; onConfig: (patch: WidgetConfig) => void; onRetry: () => void; onRetryTraffic: () => void; full?: boolean;
}) {
  const metric: ChartMetric = config.metric || "revenue";
  const grainChoice: ChartGrain = config.grain || "auto";
  const showCompare = config.compare !== false;
  const measureId = `${widgetId}-measure`;

  // "Today" has no hourly data, so it shows the last 7 days for context.
  const chartRange = useMemo(() => (range.preset === "today" ? resolveRange("7d", { compare: compareMode }) : range), [range, compareMode]);
  const grain: Grain = grainChoice === "auto" ? autoGrain(chartRange.days) : grainChoice;
  const meta = CHART_METRICS.find(m => m.id === metric) || CHART_METRICS[0];
  // Google's figures cover only the chosen range, so "Today"'s 7-day context can't chart Google visitors.
  const visitorsCharted = trafficReady && !(range.preset === "today" && traffic?.source === "google");
  const usable = !meta.needsTraffic || visitorsCharted;
  const bars = config.bars !== false && metric !== "visitors" && visitorsCharted;
  const buckets = useMemo(() => (paid ? bucketSeries(buildRangeSeries(paid, chartRange, traffic?.visitsOn || (() => 0)), grain) : []), [paid, chartRange, traffic, grain]);
  const data = useMemo(() => buckets.map(b => ({ key: b.date, label: b.label, value: metricValue(b, metric), prev: metricValue(b, metric, true), visits: b.visits })), [buckets, metric]);
  const summary = useMemo(() => seriesSummary(buckets, metric), [buckets, metric]);
  const visitorTotals = useMemo(() => buckets.reduce((t, b) => ({ now: t.now + b.visits, before: t.before + b.prevVisits }), { now: 0, before: 0 }), [buckets]);
  const fmt = (v: number | null) => (v === null ? "—" : meta.kind === "money" ? money(v) : meta.kind === "percent" ? percent(v, 2) : Math.round(v).toLocaleString());
  const axisFmt = (v: number) => (meta.kind === "money" ? (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`) : meta.kind === "percent" ? `${v}%` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v));
  const empty = data.every(d => !d.value) && data.every(d => !d.prev);
  const maxVisits = Math.max(1, ...data.map(d => d.visits || 0));
  const nowName = cap(chartRange.phrase.replace(/^the /, ""));
  const beforeName = cap(chartRange.before.replace(/^the /, ""));
  const words = buckets.length
    ? `${meta.label} by ${grain} over ${chartRange.phrase}: ${fmt(summary.value)}${summary.previous !== null ? ` (${fmt(summary.previous)} in ${chartRange.before})` : ""}.${summary.best ? ` Best ${grain}: ${summary.best.label}, ${fmt(summary.best.value)}.` : ""}`
    : "No chart data for this period.";

  const ink = "var(--rp-text)";
  const flare = "var(--rp-primary)";
  const controls = (
    <div className="rp-wb-chart-opts">
      <label className="rp-wb-lbl" htmlFor={measureId}>Show</label>
      <select id={measureId} className="rp-wb-select" value={metric} onChange={e => onConfig({ metric: e.target.value as ChartMetric })}>
        {CHART_METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
      <span className="rp-wb-seg" role="group" aria-label="Group the chart by">
        {(["auto", "day", "week", "month"] as const).map(g => (
          <button key={g} type="button" aria-pressed={grainChoice === g} onClick={() => onConfig({ grain: g })}>
            {g === "auto" ? `Auto (${autoGrain(chartRange.days)})` : g[0].toUpperCase() + g.slice(1)}
          </button>
        ))}
      </span>
      <Checkbox label="Compare" checked={showCompare} onChange={e => onConfig({ compare: e.target.checked })} />
      {metric !== "visitors" && <Checkbox label="Visitor bars" checked={config.bars !== false} disabled={!visitorsCharted} onChange={e => onConfig({ bars: e.target.checked })} />}
    </div>
  );
  return (
    <div className="rp-wb-chart">
      {ordersError ? <ErrorState title="Chart unavailable" description="Orders could not be loaded, so the trend can't be drawn." onRetry={onRetry} />
        : meta.needsTraffic && trafficFailed ? <ErrorState title="Traffic unavailable" description="Visits could not be loaded." onRetry={onRetryTraffic} />
        : !paid || (meta.needsTraffic && !trafficReady) ? <LoadingState label="Loading chart…" />
        : !usable ? <><p className="rp-hint" style={{ margin: "8px 0" }}>Google Analytics visitors chart over a longer period. Choose 7 days or more.</p>{controls}</>
        : empty ? <><p className="rp-hint" style={{ margin: "8px 0" }}>{meta.needsTraffic ? "Visitors will chart here once the storefront records them." : "This will chart here once customers place paid orders."}</p>{controls}</>
        : (
          <>
            <p className="rp-sr-only">{words}</p>
            <div className="rp-wb-chart-top">
              <span className="rp-wb-big">{fmt(summary.value)}</span>
              {showCompare && summary.previous !== null && <Trend now={summary.value || 0} before={summary.previous || 0} title={`Against ${chartRange.before}`} />}
              {metric !== "visitors" && visitorsCharted && (
                <>
                  <span className="rp-mono rp-wb-chart-visits">{visitorTotals.now.toLocaleString()} visitor{visitorTotals.now === 1 ? "" : "s"}</span>
                  {showCompare && <Trend now={visitorTotals.now} before={visitorTotals.before} title={`Visitors against ${chartRange.before}`} />}
                </>
              )}
              <span className="rp-wb-legend" aria-hidden="true">
                <span><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="var(--rp-primary)" strokeWidth="3" /></svg>{nowName}</span>
                {showCompare && <span><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="var(--rp-text-subtle)" strokeWidth="1.5" strokeDasharray="4 3" /></svg>{range.preset === "today" ? "Week before" : beforeName}</span>}
                {bars && <span><i className="rp-wb-legend-bar" />Visitors{traffic?.source === "google" ? " (Google)" : ""}</span>}
              </span>
            </div>
            <div className="rp-wb-chart-plot" style={{ height: full ? 420 : 200 }} role="img" aria-label={words}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ left: full ? 0 : 6, right: 6, top: 10, bottom: 0 }} barCategoryGap="35%">
                  {full && <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={ink} strokeOpacity={0.12} />}
                  <XAxis dataKey="label" hide={!full} axisLine={false} tickLine={false} minTickGap={24} tick={{ fontSize: 11, fill: ink }} />
                  <YAxis yAxisId="v" hide={!full} axisLine={false} tickLine={false} width={48} tick={{ fontSize: 11, fill: ink }} tickFormatter={axisFmt} />
                  <YAxis yAxisId="bars" hide domain={[0, maxVisits * 1.7]} />
                  <Tooltip formatter={(v: any, name: any) => [name === "Visitors" ? Number(v || 0).toLocaleString() : fmt(v === null || v === undefined ? null : Number(v)), name]}
                    contentStyle={{ background: "var(--rp-surface)", border: "2px solid var(--rp-border-strong)", borderRadius: 0, color: "var(--rp-text)", fontSize: 12 }} />
                  {bars && <Bar yAxisId="bars" dataKey="visits" name="Visitors" fill={ink} fillOpacity={0.12} isAnimationActive={false} />}
                  {showCompare && <Line yAxisId="v" type="linear" dataKey="prev" name={`${meta.label} (${chartRange.compare === "lastYear" ? "last year" : "before"})`} stroke="var(--rp-text-subtle)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false} />}
                  <Line yAxisId="v" type="linear" dataKey="value" name={meta.label} stroke={flare} strokeWidth={3} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {!full && data.length > 1 && (
              <div className="rp-wb-axis" aria-hidden="true"><span>{data[0].label}</span><span>{data[data.length - 1].label}</span></div>
            )}
            <p className="rp-hint rp-wb-chart-sum">
              {summary.perDay !== null && <><b className="rp-mono">{fmt(summary.perDay)}</b> a day · </>}
              {summary.best && <>Best {grain}: <b>{summary.best.label}</b> ({fmt(summary.best.value)}) · </>}
              {meta.needsTraffic || bars ? `Visitors from ${sourceName}` : `${meta.label} from paid orders`}
              {range.preset === "today" && " · Hourly data isn't recorded, so this shows the last 7 days."}
            </p>
            {controls}
            <details className="rp-ov-table-toggle" open={full || undefined}>
              <summary>View chart data as a table</summary>
              <div style={{ marginTop: 8 }}>
                <DataTable caption="Chart data" rows={data} rowKey={d => d.key}
                  columns={[
                    { key: "d", header: grain === "day" ? "Date" : grain === "week" ? "Week" : "Month", render: d => d.label },
                    { key: "v", header: meta.label, numeric: true, render: d => fmt(d.value) },
                    { key: "p", header: chartRange.compare === "lastYear" ? "Last year" : "Before", numeric: true, render: d => fmt(d.prev) },
                    ...(visitorsCharted && metric !== "visitors" ? [{ key: "vis", header: "Visitors", numeric: true, render: (d: any) => Number(d.visits || 0).toLocaleString() }] : []),
                  ]} />
              </div>
            </details>
          </>
        )}
    </div>
  );
}
