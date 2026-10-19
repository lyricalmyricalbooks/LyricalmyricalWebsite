import { useMemo, useState, type FormEvent } from "react";
import { EmptyState, GhostButton, PrimaryButton, SecondaryButton, StatusBadge, TextField } from "./riso/components";
import type { Book, Order } from "./overviewInsights";
import type { Range } from "./overviewRange";
import { monthPace } from "./overviewSeries";
import { shopDayKey } from "../lib/shopDay";
import { smallPhotoUrl } from "../features/site/photoSources";
import { money } from "./OverviewParts";
import { Columns, Cover, RankBars } from "./OverviewViz";
import {
  bookOfTheWeek, calendarLevel, launchCurves, monthGoal, parseGoal, salesCalendar, shipHeadline, shipWeeks, signedMix,
} from "./overviewNewSales";
import "./overviewNew.css";

export type NewSalesWidget = "calendar" | "goal" | "shipDays" | "launches" | "bookOfWeek" | "signed";

const dayWords = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
const fullDay = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const days = (n: number | null) => (n === null ? "—" : `${n < 10 ? n.toFixed(1) : Math.round(n)} day${n === 1 ? "" : "s"}`);

/**
 * Six Overview widgets added 19 October 2026 (Sales calendar, Month goal, Days to ship, Launch curves, Book of the week,
 * Signed or not). They draw only orders and books the board already loaded; the maths is in overviewNewSales.ts.
 */
export function OverviewNewSales({ only, paid, current, books, range, config, onConfig, full, onEditBook }: {
  only: NewSalesWidget; paid: Order[]; current: Order[]; previous?: Order[]; books: Book[]; range: Range;
  config: { goal?: number }; onConfig: (patch: { goal?: number }) => void; full?: boolean; onEditBook?: (id: string) => void;
}) {
  const today = shopDayKey(Date.now());
  switch (only) {
    case "calendar": return <SalesCalendarWidget paid={paid} today={today} />;
    case "goal": return <MonthGoalWidget paid={paid} today={today} goal={config.goal} onGoal={goal => onConfig({ goal })} />;
    case "shipDays": return <ShipDaysWidget paid={paid} today={today} />;
    case "launches": return <LaunchCurvesWidget paid={paid} books={books} today={today} full={full} />;
    case "bookOfWeek": return <BookOfWeekWidget paid={paid} books={books} today={today} onEditBook={onEditBook} />;
    case "signed": return <SignedWidget current={current} books={books} phrase={range.phrase} />;
  }
}

function SalesCalendarWidget({ paid, today }: { paid: Order[]; today: string }) {
  const cal = useMemo(() => salesCalendar(paid, today), [paid, today]);
  const summary = `Sales calendar, past 12 months: ${money(cal.total)} over ${cal.daysWithSale} of ${cal.days} days with a sale.`
    + (cal.longest ? ` Longest run: ${cal.longest.length} days in a row (${dayWords(cal.longest.from)} to ${dayWords(cal.longest.to)}).` : "")
    + (cal.busiest ? ` Busiest day: ${fullDay(cal.busiest.date)}, ${money(cal.busiest.revenue)}.` : "");
  if (cal.daysWithSale === 0) return <EmptyState icon="▦" title="No sales in the past year" description="Each day you sell something shows up here as a red square." />;
  const ROWS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];
  return (
    <div className="rp-nw">
      <dl className="rp-nw-stats">
        <div><dt>Past 12 months</dt><dd>{money(cal.total)}</dd></div>
        <div><dt>Sold on</dt><dd>{cal.daysWithSale} <small>of {cal.days} days</small></dd></div>
        {cal.longest && <div><dt>Longest run</dt><dd>{cal.longest.length} days <small>({dayWords(cal.longest.from)} – {dayWords(cal.longest.to)})</small></dd></div>}
        {cal.busiest && <div><dt>Busiest day</dt><dd>{money(cal.busiest.revenue)} <small>{fullDay(cal.busiest.date)}</small></dd></div>}
      </dl>
      <figure className="rp-nw-cal" aria-label={summary}>
        <div className="rp-nw-cal-scroll" tabIndex={0} aria-label="Sales calendar, scrolls sideways" role="group">
          <div className="rp-nw-cal-grid" aria-hidden="true" style={{ gridTemplateColumns: `28px repeat(${cal.weeks.length}, 12px)` }}>
            <span />
            {cal.weeks.map((_, c) => <span key={c} className="rp-nw-cal-month">{cal.months.find(m => m.col === c)?.label || ""}</span>)}
            {ROWS.map((name, r) => (
              <Row key={r} name={name} cells={cal.weeks.map(w => w[r])} max={cal.max} />
            ))}
          </div>
        </div>
        <figcaption className="rp-nw-cal-key">
          <span>No sale</span>
          {[0, 1, 2, 3, 4].map(l => <i key={l} className="rp-nw-cal-cell" data-level={l} aria-hidden="true" />)}
          <span>Busiest</span>
        </figcaption>
      </figure>
    </div>
  );
}

function Row({ name, cells, max }: { name: string; cells: Array<{ date: string; revenue: number; orders: number } | null>; max: number }) {
  return (
    <>
      <span className="rp-nw-cal-day">{name}</span>
      {cells.map((d, i) => d
        ? <i key={i} className="rp-nw-cal-cell" data-level={calendarLevel(d.revenue, max)}
            title={`${fullDay(d.date)}: ${d.orders ? `${money(d.revenue)} · ${d.orders} order${d.orders === 1 ? "" : "s"}` : "no sale"}`} />
        : <i key={i} className="rp-nw-cal-cell" data-empty />)}
    </>
  );
}

function MonthGoalWidget({ paid, today, goal, onGoal }: { paid: Order[]; today: string; goal?: number; onGoal: (goal: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(goal ? String(goal) : "");
  const [error, setError] = useState("");
  const g = useMemo(() => monthGoal(paid, today, goal || 0), [paid, today, goal]);
  const pace = useMemo(() => monthPace(paid, today), [paid, today]);
  const save = (e: FormEvent) => {
    e.preventDefault();
    const n = parseGoal(text);
    if (n === null) { setError("Type an amount in dollars, like 2000."); return; }
    setError(""); setEditing(false); onGoal(n);
  };
  if (!goal || editing) {
    return (
      <form className="rp-nw rp-nw-goalform" onSubmit={save}>
        <p className="rp-hint" style={{ margin: 0 }}>
          {goal ? "Change the amount you want to take in each month." : "Set what you'd like to take in each month, and this shows whether you're on track."}
          {" "}So far in {g.month}: <strong>{money(g.soFar)}</strong>.
        </p>
        <TextField label="Monthly goal (CA$)" inputMode="decimal" value={text} onChange={e => setText(e.target.value)} error={error || undefined} placeholder="2000" />
        <div className="rp-nw-row">
          <PrimaryButton size="sm" type="submit">Set goal</PrimaryButton>
          {goal ? <GhostButton size="sm" type="button" onClick={() => { setEditing(false); setError(""); setText(String(goal)); }}>Cancel</GhostButton> : null}
        </div>
      </form>
    );
  }
  const R = 52, C = 2 * Math.PI * R;
  const shown = Math.min(100, g.share);
  const paceAngle = (g.paceShare / 100) * 2 * Math.PI - Math.PI / 2;
  const said = `${money(g.soFar)} of a ${money(g.goal)} goal for ${g.month} (${Math.round(g.share)}%). ${g.daysIn} of ${g.daysInMonth} days gone, so an even pace would be ${Math.round(g.paceShare)}%. ${g.ahead ? "Ahead of pace." : "Behind pace."}`;
  return (
    <div className="rp-nw rp-nw-goal">
      <svg className="rp-nw-ring" viewBox="0 0 128 128" role="img" aria-label={said}>
        <circle cx="64" cy="64" r={R} className="rp-nw-ring-track" />
        <circle cx="64" cy="64" r={R} className="rp-nw-ring-fill" data-ahead={g.ahead ? "" : undefined}
          strokeDasharray={`${(shown / 100) * C} ${C}`} transform="rotate(-90 64 64)" />
        <line className="rp-nw-ring-pace" x1={64 + Math.cos(paceAngle) * (R - 11)} y1={64 + Math.sin(paceAngle) * (R - 11)} x2={64 + Math.cos(paceAngle) * (R + 11)} y2={64 + Math.sin(paceAngle) * (R + 11)} />
        <text x="64" y="62" className="rp-nw-ring-big">{Math.round(g.share)}%</text>
        <text x="64" y="80" className="rp-nw-ring-small">of goal</text>
      </svg>
      <div className="rp-nw-goal-text">
        <div className="rp-nw-big">{money(g.soFar)} <small>of {money(g.goal)}</small></div>
        <p className="rp-hint" style={{ margin: "4px 0 8px" }}>{g.month}, {g.daysIn} of {g.daysInMonth} days in. The line on the ring marks where an even pace would put you today ({Math.round(g.paceShare)}%).</p>
        <StatusBadge tone={g.ahead ? "success" : "warning"}>{g.ahead ? "Ahead of pace" : "Behind pace"}</StatusBadge>
        <p className="rp-hint" style={{ margin: "8px 0 0" }}>
          {pace ? <>At this month's pace you'd end near <strong>{money(Math.round(pace.projected))}</strong>. </> : null}
          {g.needPerDay !== null ? <>To reach the goal: about {money(Math.round(g.needPerDay))} a day from here.</> : g.soFar >= g.goal ? <>Goal reached. 🎉</> : null}
        </p>
        <SecondaryButton size="sm" onClick={() => { setText(String(goal)); setEditing(true); }} style={{ marginTop: 10 }}>Change goal</SecondaryButton>
      </div>
    </div>
  );
}

function ShipDaysWidget({ paid, today }: { paid: Order[]; today: string }) {
  const weeks = useMemo(() => shipWeeks(paid, today), [paid, today]);
  const head = useMemo(() => shipHeadline(paid, today), [paid, today]);
  if (weeks.every(w => !w.shipped)) return <EmptyState icon="📦" title="Nothing shipped in the last 12 weeks" description="Once parcels go out, this shows how many days they wait after payment." />;
  const faster = head.recent !== null && head.before !== null ? head.recent < head.before - 0.05 ? "faster" : head.recent > head.before + 0.05 ? "slower" : "same" : null;
  return (
    <div className="rp-nw">
      <div className="rp-nw-head">
        <div className="rp-nw-big">{days(head.recent)} <small>typical, last 4 weeks</small></div>
        {faster && <StatusBadge tone={faster === "faster" ? "success" : faster === "slower" ? "warning" : "neutral"}>{faster === "faster" ? "Faster" : faster === "slower" ? "Slower" : "About the same"} · was {days(head.before)}</StatusBadge>}
      </div>
      <Columns label="Typical days to ship, by week" format={n => n.toFixed(1)}
        items={weeks.map(w => ({ key: w.week, label: w.label, value: w.median === null ? 0 : Math.round(w.median * 10) / 10, title: `Week of ${w.label}: ${w.shipped ? `${days(w.median)} typical, ${w.shipped} parcel${w.shipped === 1 ? "" : "s"}` : "nothing shipped"}` }))} />
      <p className="rp-hint rp-nw-foot">Each column is one week (by the day parcels left), last 12 weeks. Days count from payment; pre-orders count from release day.</p>
    </div>
  );
}

function LaunchCurvesWidget({ paid, books, today, full }: { paid: Order[]; books: Book[]; today: string; full?: boolean }) {
  const curves = useMemo(() => launchCurves(paid, books, today, full ? 6 : 4), [paid, books, today, full]);
  if (!curves.length) return <EmptyState icon="↗" title="No launches yet" description="Each book's first 30 days of sales draw here as a line, newest in red." />;
  const W = 320, H = 150, P = { l: 28, r: 8, t: 8, b: 20 };
  const max = Math.max(1, ...curves.map(c => c.total));
  const x = (d: number) => P.l + (d / 30) * (W - P.l - P.r);
  const y = (n: number) => H - P.b - (n / max) * (H - P.t - P.b);
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const said = curves.map(c => `${c.title}: ${c.total} cop${c.total === 1 ? "y" : "ies"} by day ${c.daysSoFar}`).join("; ");
  return (
    <div className="rp-nw">
      <svg className="rp-nw-launch" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Launch curves, copies sold in each book's first 30 days. ${said}.`}>
        {ticks.map(t => <g key={t}><line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="rp-nw-grid" /><text x={P.l - 4} y={y(t) + 3} className="rp-nw-axis" textAnchor="end">{t}</text></g>)}
        {[0, 10, 20, 30].map(d => <text key={d} x={x(d)} y={H - 6} className="rp-nw-axis" textAnchor="middle">{d === 0 ? "day 0" : d}</text>)}
        {[...curves].reverse().map((c, ri) => {
          const i = curves.length - 1 - ri;
          return <path key={c.id} d={c.points.map((n, d) => `${d ? "L" : "M"}${x(d).toFixed(1)},${y(n).toFixed(1)}`).join(" ")} className="rp-nw-line" data-rank={Math.min(i, 3)} />;
        })}
        {curves.map((c, i) => <circle key={c.id} cx={x(c.daysSoFar)} cy={y(c.total)} r={i === 0 ? 3.5 : 2.5} className="rp-nw-dot" data-rank={Math.min(i, 3)} />)}
      </svg>
      <ul className="rp-nw-legend" aria-label="Books in the chart">
        {curves.map((c, i) => (
          <li key={c.id}>
            <i className="rp-nw-key" data-rank={Math.min(i, 3)} aria-hidden="true" />
            <span className="rp-nw-legend-title">{c.title}{i === 0 && <span className="rp-viz-dim"> (newest)</span>}</span>
            <span className="rp-nw-legend-val">{c.total} by day {c.daysSoFar}{c.daysSoFar < 30 ? " so far" : ""}</span>
          </li>
        ))}
      </ul>
      <p className="rp-hint rp-nw-foot">Copies sold, counted from each book's first sale. First sale: {curves.map(c => `${c.title} ${dayWords(c.firstDay)}`).join(" · ")}.</p>
    </div>
  );
}

function BookOfWeekWidget({ paid, books, today, onEditBook }: { paid: Order[]; books: Book[]; today: string; onEditBook?: (id: string) => void }) {
  const top = useMemo(() => bookOfTheWeek(paid, today), [paid, today]);
  if (!top) return <EmptyState icon="★" title="No sales in the last 7 days" description="The book that sells the most copies this week shows here." />;
  const book = books.find(b => String(b.id) === top.id);
  const diff = top.copies - top.before;
  return (
    <div className="rp-nw rp-nw-bow">
      <Cover url={smallPhotoUrl(book?.photos?.[0], 160) || null} text={top.title} />
      <div style={{ minWidth: 0 }}>
        <StatusBadge tone="info">#1 this week</StatusBadge>
        <div className="rp-nw-bow-title">{onEditBook ? <button type="button" className="rp-nw-link" onClick={() => onEditBook(top.id)}>{top.title}</button> : top.title}</div>
        <div className="rp-nw-big">{top.copies} <small>cop{top.copies === 1 ? "y" : "ies"} · {money(top.revenue)}</small></div>
        <p className="rp-hint" style={{ margin: "4px 0 0" }}>
          {top.before === 0 ? "No copies the week before." : diff > 0 ? `Up from ${top.before} the week before${top.beforeRank ? ` (#${top.beforeRank} then)` : ""}.` : diff < 0 ? `Down from ${top.before} the week before, but still the top seller.` : `Same as the week before (${top.before}).`}
          {top.runnerUp ? ` Runner-up: ${top.runnerUp}.` : ""}
        </p>
      </div>
    </div>
  );
}

function SignedWidget({ current, books, phrase }: { current: Order[]; books: Book[]; phrase: string }) {
  const mix = useMemo(() => signedMix(current, books), [current, books]);
  if (!mix.rows.length) {
    return <EmptyState icon="✍" title={mix.booksWithSigned ? `No signed or unsigned copies sold in ${phrase}` : "No signed editions yet"}
      description='A copy counts as signed when its edition is named with the word "Signed" (for example "Signed hardcover"). Name an edition that way in Books › edit › Editions and it shows up here.' />;
  }
  return (
    <div className="rp-nw">
      <div className="rp-nw-head">
        <div className="rp-nw-big">{Math.round(mix.share)}% <small>of these copies sold signed · {mix.signed} of {mix.all}</small></div>
      </div>
      <RankBars label="Share of copies sold signed, by book" scaleMax={100}
        rows={mix.rows.map(r => ({
          key: r.id, label: r.title, value: r.share,
          valueText: `${Math.round(r.share)}% signed`,
          sub: `${r.signed} signed · ${r.unsigned} not${r.signedPrice !== null && r.unsignedPrice !== null ? ` · signed ${money(r.signedPrice)} vs ${money(r.unsignedPrice)}` : ""}`,
        }))} />
      <p className="rp-hint rp-nw-foot">
        {mix.premium !== null ? <>Readers paid <strong>{money(Math.abs(mix.premium))} {mix.premium >= 0 ? "more" : "less"}</strong> on average for a signed copy of the same book. </> : null}
        Books with a signed edition, {phrase}. Bar = share of copies sold signed.
      </p>
    </div>
  );
}
