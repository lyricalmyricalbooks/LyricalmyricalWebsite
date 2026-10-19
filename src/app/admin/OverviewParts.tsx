import { useState, type ReactNode } from "react";
import { SecondaryButton, SectionCard, StatusBadge, GhostButton, ErrorState, type BadgeTone } from "./riso/components";
import { change } from "./overviewInsights";
import { SHOP_TZ } from "../lib/shopDay";
import { readinessProgress, readinessSummary, type ReadinessItem } from "./launchReadiness";

// Small pieces shared by the Overview shell and its four detail tabs.

export const money = (n: number) => `CA$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
export const percent = (n: number, digits = 1) => `${Number(n || 0).toFixed(digits)}%`;
/** A moment in the shop's own time, e.g. "Oct 17, 3:42 PM"; "" when unknown. */
export const shopWhen = (v: unknown) => {
  const t = new Date(v as any).getTime();
  return Number.isNaN(t) || !v ? "" : new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: SHOP_TZ });
};
/** The admin address of one order (opens Orders on it). */
export const orderHref = (id: string) => `#orders/${encodeURIComponent(id)}`;
export const SPLIT = { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))" } as const;
export const ROW = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 } as const;

/** % change badge; "new" when there is nothing earlier to compare with. */
export function Trend({ now, before }: { now: number; before: number }) {
  const v = change(now, before);
  const tone: BadgeTone = v === null || v > 0 ? "success" : v < 0 ? "danger" : "neutral";
  return <StatusBadge tone={tone}>{v === null ? "new" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}</StatusBadge>;
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

/** A bar row: label + value, with a proportional bar underneath. With `details`, the row opens to show what's behind it. */
export function BarRow({ label, value, share, color, details }: { label: ReactNode; value: ReactNode; share: number; color?: string; details?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const head = <div style={ROW}><strong style={{ minWidth: 0, overflowWrap: "anywhere" }}>{details ? <Chevron open={open} /> : null}{label}</strong><span className="rp-mono" style={{ whiteSpace: "nowrap" }}>{value}</span></div>;
  return (
    <li>
      {details ? <button type="button" className="rp-ov-drill" aria-expanded={open} onClick={() => setOpen(v => !v)}>{head}<Meter share={share} color={color} /></button>
        : <>{head}<Meter share={share} color={color} /></>}
      {details && open && <div className="rp-ov-drill-body">{details}</div>}
    </li>
  );
}

function Chevron({ open }: { open: boolean }) {
  return <span aria-hidden="true" className="rp-ov-drill-mark">{open ? "▾" : "▸"}</span>;
}

/** One record behind a figure: what it is, a line of facts, and its own value; `href` opens it in the admin. */
export interface DrillItem { key: string; title: ReactNode; sub?: ReactNode; value?: ReactNode; href?: string; tone?: "danger" | "success" | "muted" }

/** The records behind a figure, shown when a row opens: the first `limit`, then "Show all". */
export function DrillList({ items, empty = "Nothing to show for this period.", limit = 8, label }: { items: DrillItem[]; empty?: ReactNode; limit?: number; label: string }) {
  const [all, setAll] = useState(false);
  if (!items.length) return <p className="rp-hint" style={{ margin: 0 }}>{empty}</p>;
  const shown = all ? items : items.slice(0, limit);
  return (
    <>
      <ul className="rp-ov-drill-list" aria-label={label}>
        {shown.map(it => (
          <li key={it.key}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{it.href ? <a href={it.href}>{it.title}</a> : it.title}</div>
              {it.sub && <div className="rp-hint" style={{ overflowWrap: "anywhere" }}>{it.sub}</div>}
            </div>
            {it.value !== undefined && <span className="rp-mono" style={{ whiteSpace: "nowrap", color: it.tone === "danger" ? "var(--rp-danger)" : it.tone === "success" ? "var(--rp-success)" : it.tone === "muted" ? "var(--rp-text-muted)" : undefined }}>{it.value}</span>}
          </li>
        ))}
      </ul>
      {items.length > limit && <GhostButton size="sm" onClick={() => setAll(v => !v)}>{all ? "Show fewer" : `Show all ${items.length}`}</GhostButton>}
    </>
  );
}

/** One line of the run sheet (the ink "to do" tile): a big count, what it is, and where to fix it. */
export function RunRow({ label, detail, count, loading, onOpen, openLabel }: {
  label: string; detail: string; count: number | null; loading: boolean; onOpen: () => void; openLabel: string;
}) {
  const clear = count === 0;
  return (
    <li className="rp-ov-run-row" data-clear={clear || undefined}>
      <span className="rp-ov-run-count">{loading ? "…" : count}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="rp-ov-run-label">{label}</div>
        <div className="rp-ov-run-detail">{loading ? "Loading…" : clear ? "✓ All clear" : detail}</div>
        {!loading && !clear && <button type="button" className="rp-ov-run-go" onClick={onOpen}>{openLabel} <span aria-hidden="true">→</span></button>}
      </div>
    </li>
  );
}

/** One column of the Overview's ruled figures strip. */
export function Figure({ label, value, foot, tone, spark }: { label: string; value: ReactNode; foot: ReactNode; tone?: "warn"; spark?: ReactNode }) {
  return (
    <div className="rp-ov-figure" data-tone={tone}>
      <div className="rp-ov-figure-label">{label}</div>
      <div className="rp-ov-figure-value">{value}</div>
      <div className="rp-ov-figure-foot">{foot}</div>
      {spark}
    </div>
  );
}

/** A "label … value" line inside an `rp-list`, with an optional hint underneath. With `details`, it opens to show the records behind it. */
export function StatRow({ label, hint, value, tone, details }: { label: ReactNode; hint?: ReactNode; value: ReactNode; tone?: "danger" | "muted"; details?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const head = (
    <>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontWeight: 600, overflowWrap: "anywhere", color: tone === "muted" ? "var(--rp-text-muted)" : undefined }}>{details ? <Chevron open={open} /> : null}{label}</span>
        {hint && <div className="rp-hint rp-mono">{hint}</div>}
      </div>
      <span className="rp-mono" style={{ whiteSpace: "nowrap", color: tone === "danger" ? "var(--rp-danger)" : undefined }}>{value}</span>
    </>
  );
  if (!details) return <li style={ROW}>{head}</li>;
  return (
    <li>
      <button type="button" className="rp-ov-drill" aria-expanded={open} onClick={() => setOpen(v => !v)} style={ROW}>{head}</button>
      {open && <div className="rp-ov-drill-body">{details}</div>}
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
 * "Ready to sell?" as a slim progress strip: how many checks are green, only the open ones listed, and the finished
 * ones folded away. The page parent hides it entirely once every check passes.
 */
export function ReadinessStrip({ items, onOpen }: { items: ReadinessItem[]; onOpen: (tab: string) => void }) {
  const [showDone, setShowDone] = useState(false);
  const { done, total, open, completed } = readinessProgress(items);
  const blocking = open.some(i => i.status === "block");
  return (
    <SectionCard flush title="Ready to sell?"
      description={`${done} of ${total} launch checks are ready${blocking ? " — something is blocking sales" : ""}`}
      actions={completed.length > 0
        ? <GhostButton size="sm" aria-expanded={showDone} aria-controls="overview-readiness-done" onClick={() => setShowDone(v => !v)}>
            {showDone ? "Hide" : "Show"} completed ({completed.length})
          </GhostButton>
        : undefined}>
      <div style={{ padding: "0 20px 16px" }}>
        <Meter share={total ? (done / total) * 100 : 0} color={blocking ? "var(--rp-danger)" : "var(--rp-primary)"}
          label="Launch checks ready" valueText={`${done} of ${total}`} />
      </div>
      <ul className="rp-list" aria-label="Launch checks still open">
        {open.map(item => <ReadinessRow key={item.id} item={item} onOpen={onOpen} />)}
      </ul>
      {showDone && (
        <ul id="overview-readiness-done" className="rp-list" aria-label="Launch checks already done" style={{ borderTop: "1px solid var(--rp-divider)" }}>
          {completed.map(item => <ReadinessRow key={item.id} item={item} onOpen={onOpen} />)}
        </ul>
      )}
    </SectionCard>
  );
}

/** A failed readiness read remains visible as unknown and can be retried. */
export function ReadinessPanel({ error, items, onRetry, onOpen }: { error: boolean; items: ReadinessItem[] | null; onRetry: () => void; onOpen: (tab: string) => void }) {
  if (error) return <ErrorState title="Launch checks unavailable" description="Settings, shipping or email records could not be loaded. Readiness is unknown until these checks refresh." onRetry={onRetry} />;
  return items && readinessSummary(items) !== "ok" ? <ReadinessStrip items={items} onOpen={onOpen} /> : null;
}
