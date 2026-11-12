// The Overview's "Daily desk" bento (owner's mockup "Admin Overview v3", 12 November 2026): a revenue tile with the
// period's running total against the period before, the Needs you jobs, four stat tiles, What changed and the newest
// orders. Model: overviewDesk.ts (pure, tested). Figures arrive already worked out by AnalyticsDashboard.
import type { CSSProperties, ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { openOrdersQueue } from "../Orders";
import type { Change } from "./overviewChanges";
import type { Order, PeriodTotals } from "./overviewInsights";
import type { NeedsInput, NeedsLink } from "./needsStrip";
import { needsCalm } from "./needsStrip";
import { money, orderHref } from "./OverviewParts";
import {
  axisDays, biggestOrder, chartScale, copiesIn, deskNeeds, deskOrderPill, initials, plainPhrase, revenueLine, revenuePill,
  tileDelta, wholeMoney, type Dir, type RevenueSteps,
} from "./overviewDesk";
import "./overviewDesk.css";

export type DeskProps = {
  /** Paid-order totals for the period and the one before; null while loading. */
  cur: PeriodTotals | null; prev: PeriodTotals | null;
  steps: RevenueSteps | null; current: Order[];
  phrase: string; before: string;
  changes: Change[] | null; newest: Order[] | null;
  needs: NeedsInput;
  ordersFailed: boolean; onRetry: () => void;
  setActiveTab?: (tab: string) => void;
};

const GLYPH: Record<Dir, string> = { up: "▲", down: "▼", same: "=" };

function Delta({ dir, text }: { dir: Dir; text: string }) {
  return <span className="ovd-delta" data-dir={dir}><span aria-hidden="true">{GLYPH[dir]} </span><span className="rp-sr-only">{dir === "same" ? "" : `${dir} `}</span>{text}</span>;
}

function Tile({ tint, className = "", children, label, style }: { tint: string; className?: string; children: ReactNode; label: string; style?: CSSProperties }) {
  return <section className={`ovd-tile ${className}`} data-tint={tint} aria-label={label} style={style}>{children}</section>;
}

/** The running total, as steps: now in tomato, the period before dashed, the biggest order on a sticker. */
function RevenueChart({ steps, current, before }: { steps: RevenueSteps; current: Order[]; before: string }) {
  const n = steps.days.length;
  const last = (a: number[]) => a[a.length - 1] || 0;
  const { top, ticks } = chartScale(Math.max(last(steps.now), last(steps.before)));
  const W = 1000, H = 180;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (v: number) => H - (v / top) * H;
  const path = (vals: number[]) => `M0 ${H} ` + vals.map((v, i) => `${i === 0 ? "" : `H${x(i).toFixed(1)} `}V${y(v).toFixed(1)}`).join(" ") + ` H${W}`;
  const pct = (i: number) => `${(x(i) / W) * 100}%`;
  const big = biggestOrder(current, steps.days);
  const endY = (y(last(steps.now)) / H) * 100;
  const beforeY = (y(last(steps.before)) / H) * 100;
  const summary = `Revenue added up day by day: ${money(last(steps.now))} now against ${money(last(steps.before))} in ${before}.`;
  return (
    <figure className="ovd-chart" aria-label={summary}>
      <div className="ovd-chart-y" aria-hidden="true">
        {ticks.map(t => <span key={t} style={{ top: `${100 - (t / top) * 100}%` }}>{t === 0 ? "CA$0" : wholeMoney(t).replace("CA$", "")}</span>)}
      </div>
      <div className="ovd-chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {ticks.slice(1).map(t => <line key={t} className="ovd-grid" x1="0" x2={W} y1={y(t)} y2={y(t)} vectorEffect="non-scaling-stroke" />)}
          <line className="ovd-base" x1="0" x2={W} y1={H} y2={H} vectorEffect="non-scaling-stroke" />
          <path className="ovd-before" d={path(steps.before)} vectorEffect="non-scaling-stroke" />
          <path className="ovd-now" d={path(steps.now)} vectorEffect="non-scaling-stroke" />
        </svg>
        {last(steps.before) > 0 && (
          <span className="ovd-before-label" style={{ top: `${beforeY}%` }} aria-hidden="true">Before · {money(last(steps.before))}</span>
        )}
        {last(steps.now) > 0 && <span className="ovd-end" style={{ top: `${endY}%` }} aria-hidden="true" />}
        {big && (
          <span className="ovd-sticker" data-side={big.index / Math.max(1, n - 1) < 0.4 ? "right" : "left"}
            style={{ left: pct(big.index), top: `${(y(steps.now[big.index] || 0) / H) * 100}%` }}>
            <span className="rp-sr-only">Biggest order: </span>{big.label}
          </span>
        )}
      </div>
      <div className="ovd-chart-x" aria-hidden="true">
        {axisDays(steps.days).map(d => <span key={d.index} style={{ left: pct(d.index) }} data-edge={d.index === 0 ? "start" : d.index === n - 1 ? "end" : undefined}>{d.label}</span>)}
      </div>
    </figure>
  );
}

export function OverviewDesk({ cur, prev, steps, current, phrase, before, changes, newest, needs, ordersFailed, onRetry, setActiveTab }: DeskProps) {
  const go = (to: NeedsLink) => { if (to.queue) openOrdersQueue(to.queue); setActiveTab?.(to.tab); };
  const jobs = deskNeeds(needs);
  const pill = cur && prev ? revenuePill(cur.net, prev.net) : null;
  const wait = ordersFailed ? "—" : "…";
  const failNote = <p className="ovd-note">Orders could not be loaded. <button type="button" className="ovd-link" onClick={onRetry}>Try again</button></p>;

  const stat = (label: string, tint: string, value: string, foot: ReactNode, title?: string, warn?: boolean) => (
    <Tile tint={tint} className="ovd-stat" label={label}>
      <h3 className="ovd-label">{label}</h3>
      <p className="ovd-stat-value" data-warn={warn || undefined} title={title}>{value}</p>
      <div className="ovd-stat-foot">{foot}</div>
    </Tile>
  );

  return (
    <div className="ovd" aria-label="Daily desk">
      {/* 1 · Revenue */}
      <Tile tint="paper" className="ovd-revenue" label="Revenue">
        <div className="ovd-revenue-head">
          <h3 className="ovd-label">Revenue · {plainPhrase(phrase)}</h3>
          <span className="ovd-legend" aria-hidden="true"><span className="ovd-key-now" />Now <span className="ovd-key-before" />Before</span>
        </div>
        <p className="ovd-hero" title={cur ? money(cur.net) : undefined}>{cur ? wholeMoney(cur.net) : wait}</p>
        {pill && <span className="ovd-pill" data-dir={pill.dir}><span aria-hidden="true">{GLYPH[pill.dir]} </span>{pill.text}<span className="rp-sr-only"> against {before}</span></span>}
        {ordersFailed ? failNote : <p className="ovd-copy">{cur && prev ? revenueLine(cur, prev, phrase, before, money) : "Adding up paid orders…"}</p>}
        {steps && !ordersFailed && <RevenueChart steps={steps} current={current} before={before} />}
      </Tile>

      {/* 2 · Needs you */}
      <Tile tint="paper" className="ovd-needs" label="Needs you">
        <div className="ovd-head">
          <h2 className="ovd-title">Needs you</h2>
          {jobs.open !== null && <span className="ovd-count" data-zero={jobs.open === 0 || undefined}>{jobs.open} open</span>}
        </div>
        {jobs.next && (
          <div className="ovd-next">
            <span className="ovd-label">Next up</span>
            <p className="ovd-next-title">{jobs.next.text}</p>
            <p className="ovd-next-detail">{jobs.next.detail}</p>
            <button type="button" className="ovd-btn" onClick={() => go(jobs.next!.to)}>{jobs.next.action} <ArrowRight size={15} aria-hidden /></button>
          </div>
        )}
        {jobs.rows.length > 0 && (
          <ul className="ovd-jobs">
            {jobs.rows.map(j => (
              <li key={j.id}>
                <button type="button" className="ovd-job" data-tint={j.tint} onClick={() => go(j.to)}>
                  <span className="ovd-check" aria-hidden="true" />
                  <span className="ovd-job-text">
                    <span className="ovd-job-title">{j.warn && <span aria-hidden="true">⚠ </span>}{j.text}</span>
                    <span className="ovd-job-detail">{j.detail}</span>
                  </span>
                  <span className="ovd-job-go">{j.action && <span>{j.action}</span>}<ArrowRight size={15} aria-hidden /></span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!jobs.next && jobs.rows.length === 0 && <p className="ovd-calm" role="status">{needsCalm(needs)}</p>}
        {(jobs.next || jobs.rows.length > 0) && needs.failed && <p className="ovd-note">Some counts could not be loaded.</p>}
      </Tile>

      {/* 3 · Four stat tiles */}
      <div className="ovd-stats">
        {stat("Orders", "sky", cur ? cur.orders.toLocaleString() : wait, cur && prev ? <Delta {...tileDelta(cur.orders, prev.orders, "count", money)} /> : null)}
        {stat("Average order", "paper", cur ? wholeMoney(cur.aov) : wait, cur && prev ? <Delta {...tileDelta(cur.aov, prev.aov, "money", money)} /> : null, cur ? money(cur.aov) : undefined)}
        {stat("Copies sold", "mint", cur ? cur.units.toLocaleString() : wait, cur && prev ? <Delta {...tileDelta(cur.units, prev.units, "count", money)} /> : null)}
        {needs.lowest
          ? stat("Running low", "butter", `${needs.lowest.stock} left`, <button type="button" className="ovd-warn-link" onClick={() => setActiveTab?.("inventory")}>{needs.lowest.title} · reprint advised</button>, undefined, true)
          : needs.soldOut
            ? stat("Running low", "butter", `${needs.soldOut} out`, <button type="button" className="ovd-warn-link" onClick={() => setActiveTab?.("inventory")}>Sold out · reprint or hide</button>, undefined, true)
            : needs.soldOut === null
              ? stat("Running low", "butter", needs.failed ? "—" : "…", <span className="ovd-delta" data-dir="same">{needs.failed ? "Stock counts not loaded" : "Counting stock…"}</span>)
              : stat("Running low", "butter", "None", <span className="ovd-delta" data-dir="same">Nothing close to selling out</span>)}
      </div>

      {/* 4 · What changed */}
      <Tile tint="paper" className="ovd-changes ovd-flush" label="What changed">
        <div className="ovd-head ovd-head-rule">
          <h2 className="ovd-title">What changed</h2>
          <span className="ovd-aside">Now against {before}</span>
        </div>
        {ordersFailed ? <div className="ovd-pad">{failNote}</div>
          : !changes ? <p className="ovd-calm ovd-pad">Comparing…</p>
          : changes.length === 0 ? <p className="ovd-calm ovd-pad">Nothing moved much. Sales, titles and traffic are close to {before}.</p>
          : (
            <ul className="ovd-change-list">
              {changes.map(c => (
                <li key={c.id} className="ovd-change">
                  <span className="ovd-marker" data-tone={c.tone} aria-hidden="true">{c.tone === "up" ? "▲" : c.tone === "down" ? "▼" : c.tone === "info" ? "●" : "!"}</span>
                  <span className="ovd-change-text">
                    <span className="ovd-change-title">{c.title}</span>
                    <span className="ovd-change-detail">{c.detail}</span>
                  </span>
                  {c.delta && <span className="ovd-change-delta" data-tone={c.tone}>{c.delta}</span>}
                </li>
              ))}
            </ul>
          )}
      </Tile>

      {/* 5 · Newest orders */}
      <Tile tint="sky" className="ovd-orders" label="Newest orders">
        <div className="ovd-head">
          <h2 className="ovd-title">Newest orders</h2>
          <button type="button" className="ovd-link ovd-link-strong" onClick={() => { openOrdersQueue("All orders"); setActiveTab?.("orders"); }}>All orders <ArrowRight size={14} aria-hidden /></button>
        </div>
        {ordersFailed ? failNote
          : !newest ? <p className="ovd-calm">Loading orders…</p>
          : newest.length === 0 ? <p className="ovd-calm">New orders appear here as soon as customers check out.</p>
          : (
            <ul className="ovd-order-list">
              {newest.map((o, i) => {
                const name = o.customer?.name || o.customer?.email || "Customer";
                const p = deskOrderPill(o);
                const n = copiesIn(o);
                return (
                  <li key={o.id}>
                    <a className="ovd-order" href={orderHref(o.id)} aria-label={`Order ${o.orderId || o.id} from ${name}, ${money(o.total ?? 0)}, ${p.text}`}>
                      <span className="ovd-avatar" data-cycle={i % 4} aria-hidden="true">{initials(name)}</span>
                      <span className="ovd-order-who">
                        <span className="ovd-order-name">{name}</span>
                        <span className="ovd-order-meta">{o.orderId || o.id} · {n} {n === 1 ? "copy" : "copies"}</span>
                      </span>
                      <span className="ovd-order-end">
                        <span className="ovd-order-total" data-refunded={o.paymentStatus === "refunded" || undefined}>{money(o.total ?? 0)}</span>
                        <span className="ovd-status" data-tone={p.tone}>{p.text}</span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
      </Tile>
    </div>
  );
}
