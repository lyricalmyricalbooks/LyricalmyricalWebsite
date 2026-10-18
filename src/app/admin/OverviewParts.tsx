import { useState, type ReactNode } from "react";
import { SecondaryButton, StatusBadge, ErrorState, type BadgeTone } from "./riso/components";
import { change } from "./overviewInsights";
import { readinessProgress, readinessSummary, type ReadinessItem } from "./launchReadiness";

// Small pieces shared by the Overview shell and its four detail tabs.

export const money = (n: number) => `CA$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
export const percent = (n: number, digits = 1) => `${Number(n || 0).toFixed(digits)}%`;
export const SPLIT = { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))" } as const;
export const ROW = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 } as const;

/** A rounded status pill with its own glyph (the B4 board's "● 2 days", "▲ 29%"). The glyph is decoration. */
export function Pill({ tone = "neutral", glyph, children, title }: { tone?: BadgeTone; glyph?: string; children: ReactNode; title?: string }) {
  return <span className="rp-badge" data-tone={tone} title={title}>{glyph && <span aria-hidden="true">{glyph}</span>}{children}</span>;
}

/** The change against the comparison period as a pill: ▲ up, ▼ down, = flat, ● new when there was nothing before. */
export function Trend({ now, before, title }: { now: number; before: number; title?: string }) {
  const v = change(now, before);
  if (v === null) return <Pill tone="info" glyph="●" title={title}>New</Pill>;
  const size = Math.abs(v);
  const words = `${size >= 10 ? Math.round(size) : size.toFixed(1)}%`;
  if (Math.round(v * 10) === 0) return <Pill tone="neutral" glyph="=" title={title}>0%</Pill>;
  return (
    <Pill tone={v > 0 ? "success" : "danger"} glyph={v > 0 ? "▲" : "▼"} title={title}>
      <span className="rp-sr-only">{v > 0 ? "up " : "down "}</span>{words}
    </Pill>
  );
}

/** A tiny line of the period's values (decorative: the figure beside it carries the number). */
export function Sparkline({ values }: { values: Array<number | null> }) {
  const pts = values.map(v => (v === null || !Number.isFinite(v) ? 0 : v));
  if (pts.length < 2 || pts.every(v => v === 0)) return null;
  const max = Math.max(...pts), min = Math.min(...pts);
  const span = max - min || 1;
  const line = pts.map((v, i) => `${((i / (pts.length - 1)) * 100).toFixed(2)},${(21 - ((v - min) / span) * 18).toFixed(2)}`).join(" ");
  return (
    <svg className="rp-ov-spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <polyline fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" points={line} />
    </svg>
  );
}

/** A thin proportional bar. Decorative on its own; give it `label` when it stands alone as a progress readout. */
export function Meter({ share, color = "var(--rp-primary)", label, valueText }: { share: number; color?: string; label?: string; valueText?: string }) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(share) ? share : 0));
  return (
    <div role={label ? "progressbar" : "presentation"} aria-label={label} aria-valuemin={label ? 0 : undefined} aria-valuemax={label ? 100 : undefined}
      aria-valuenow={label ? Math.round(pct) : undefined} aria-valuetext={label ? valueText : undefined}
      style={{ height: 8, marginTop: 8, background: "var(--rp-surface-inset)", border: "1px solid var(--rp-border)" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color }} />
    </div>
  );
}

/** A bar row: label + value, with a proportional bar underneath. */
export function BarRow({ label, value, share, color }: { label: ReactNode; value: ReactNode; share: number; color?: string }) {
  return (
    <li>
      <div style={ROW}><strong style={{ minWidth: 0, overflowWrap: "anywhere" }}>{label}</strong><span className="rp-mono" style={{ whiteSpace: "nowrap" }}>{value}</span></div>
      <Meter share={share} color={color} />
    </li>
  );
}

/** One thing on the "Needs you" list. `count` null = still loading; zero = done, so it isn't listed. */
export type NeedItem = {
  id: string; count: number | null; loading: boolean; title: (n: number) => string; detail: string;
  pill: { tone: BadgeTone; glyph: string; text: string }; onOpen: () => void; openLabel: string;
};

/**
 * "Needs you" as the B4 board draws it: one light row per open job (bold count, a line on why, a status pill), each
 * opening the page where it is done. Jobs that are done drop off; the footer counts what is left.
 */
export function NeedsList({ items, live, missing }: { items: NeedItem[]; live?: ReactNode; missing?: string }) {
  const open = items.filter(i => !i.loading && (i.count || 0) > 0);
  const checking = items.filter(i => i.loading).length;
  const total = open.reduce((n, i) => n + (i.count || 0), 0);
  return (
    <div className="rp-wb-needs">
      {live && <p className="rp-wb-needs-live">{live}</p>}
      {open.length === 0 && checking === 0 && (
        <p className="rp-wb-needs-clear"><span aria-hidden="true">✓</span> Nothing needs you right now.</p>
      )}
      {open.length > 0 && (
        <ul className="rp-wb-rows" aria-label="Things that need you">
          {open.map(i => (
            <li key={i.id}>
              <button type="button" className="rp-wb-nrow" onClick={i.onOpen} aria-label={`${i.title(i.count!)}: ${i.openLabel}`}>
                <span className="rp-wb-nrow-main"><b>{i.title(i.count!)}</b>{i.detail && <small>{i.detail}</small>}</span>
                <Pill tone={i.pill.tone} glyph={i.pill.glyph}>{i.pill.text}</Pill>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="rp-wb-foot" aria-live="polite">
        {checking > 0 && open.length === 0 ? "Checking orders, reviews and messages…"
          : total > 0 ? `${total} thing${total === 1 ? "" : "s"} in all${checking > 0 ? ", still checking the rest" : ""}. Done items drop off by themselves.`
          : "Live: this list doesn't follow the period above."}
        {missing && ` ${missing}`}
      </p>
    </div>
  );
}

/** One figure tile: label, the number, how it moved, and a small line of the period when there is one. */
export function Figure({ label, value, foot, tone, spark }: { label: string; value: ReactNode; foot: ReactNode; tone?: "warn"; spark?: Array<number | null> }) {
  return (
    <div className="rp-ov-figure" data-tone={tone}>
      <div className="rp-ov-figure-label">{label}</div>
      <div className="rp-ov-figure-value">{value}</div>
      <div className="rp-ov-figure-foot">{foot}</div>
      {spark && <Sparkline values={spark} />}
    </div>
  );
}

/** A "label … value" line inside an `rp-list`, with an optional hint underneath. */
export function StatRow({ label, hint, value, tone }: { label: ReactNode; hint?: ReactNode; value: ReactNode; tone?: "danger" | "muted" }) {
  return (
    <li style={ROW}>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontWeight: 600, overflowWrap: "anywhere", color: tone === "muted" ? "var(--rp-text-muted)" : undefined }}>{label}</span>
        {hint && <div className="rp-hint rp-mono">{hint}</div>}
      </div>
      <span className="rp-mono" style={{ whiteSpace: "nowrap", color: tone === "danger" ? "var(--rp-danger)" : undefined }}>{value}</span>
    </li>
  );
}

function ReadinessRow({ item, onOpen }: { item: ReadinessItem; onOpen: (tab: string) => void }) {
  return (
    <li style={{ ...ROW, flexWrap: "wrap" }}>
      <div style={{ minWidth: 0, flex: "1 1 240px", overflowWrap: "anywhere" }}>
        <div style={{ fontWeight: 600 }}>{item.label}</div>
        <div className="rp-hint">{item.detail}</div>
      </div>
      {item.status === "ok"
        ? <StatusBadge tone="success">Done</StatusBadge>
        : <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <StatusBadge tone={item.status === "block" ? "danger" : "warning"}>{item.status === "block" ? "Blocking" : "Check"}</StatusBadge>
            {item.href ? <a className="rp-btn rp-btn-secondary rp-btn-sm" href={item.href} target="_blank" rel="noopener noreferrer">{item.action}</a> : <SecondaryButton size="sm" onClick={() => onOpen(item.tab)}>{item.action}</SecondaryButton>}
          </span>}
    </li>
  );
}

/**
 * "Ready to sell" as the B4 board draws it: "7 of 8" with a pill, one box per check, then only the open checks
 * (the finished ones fold away). The board shows a plain "Ready to sell" once every check passes.
 */
export function ReadinessStrip({ items, onOpen }: { items: ReadinessItem[]; onOpen: (tab: string) => void }) {
  const [showDone, setShowDone] = useState(false);
  const { done, total, open, completed } = readinessProgress(items);
  const blocking = open.filter(i => i.status === "block").length;
  return (
    <div className="rp-wb-ready">
      <div className="rp-wb-ready-head">
        <span className="rp-wb-big">{done} of {total}</span>
        {blocking > 0 ? <Pill tone="danger" glyph="✕">{blocking} blocking</Pill> : <Pill tone="warning" glyph="◐">{open.length} open</Pill>}
      </div>
      <div className="rp-wb-meter" role="progressbar" aria-label="Launch checks ready" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-valuetext={`${done} of ${total}`}>
        {[...completed, ...open].map(i => <i key={i.id} data-state={i.status} />)}
      </div>
      <ul className="rp-list" aria-label="Launch checks still open">
        {open.map(item => <ReadinessRow key={item.id} item={item} onOpen={onOpen} />)}
      </ul>
      {completed.length > 0 && (
        <button type="button" className="rp-wb-a" aria-expanded={showDone} aria-controls="overview-readiness-done" onClick={() => setShowDone(v => !v)}>
          {showDone ? "Hide" : "Show"} the {completed.length} finished check{completed.length === 1 ? "" : "s"}
        </button>
      )}
      {showDone && (
        <ul id="overview-readiness-done" className="rp-list" aria-label="Launch checks already done">
          {completed.map(item => <ReadinessRow key={item.id} item={item} onOpen={onOpen} />)}
        </ul>
      )}
    </div>
  );
}

/** A failed readiness read remains visible as unknown and can be retried. */
export function ReadinessPanel({ error, items, onRetry, onOpen }: { error: boolean; items: ReadinessItem[] | null; onRetry: () => void; onOpen: (tab: string) => void }) {
  if (error) return <ErrorState title="Launch checks unavailable" description="Settings, shipping or email records could not be loaded. Readiness is unknown until these checks refresh." onRetry={onRetry} />;
  return items && readinessSummary(items) !== "ok" ? <ReadinessStrip items={items} onOpen={onOpen} /> : null;
}
