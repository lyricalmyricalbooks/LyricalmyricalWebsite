import { useEffect, useMemo, useState } from "react";
import { DataTable, EmptyState, ErrorState, LoadingState, MetricCard, SecondaryButton, SectionCard, StatusBadge, type Column } from "./riso/components";
import type { Order } from "./overviewInsights";
import { cartRecovery } from "./overviewTraffic";
import { buildCustomers, customerStats, SEGMENT_LABELS } from "./customerInsights";
import { cohortRetention, newVsReturningRevenue, repeatTiming } from "./overviewCohorts";
import { shopDayKey } from "../lib/shopDay";
import { abandonedCartApi } from "../lib/commerce";
import { BarRow, SPLIT, StatRow, money, percent } from "./OverviewParts";
import { newsletterWeeks, reminderResults } from "./overviewSignals";
import { SHOP_OWNER_EMAIL } from "../lib/ownerDevice";

type Mix = { total: number; returning: number; fresh: number; returningRate: number };
type Reviews = { pending: number; approved: number; average: number | null } | null;
type Subs = { total: number; added: number } | null;

/** Overview › Dig deeper › Customers: who buys, who comes back, and what happens to carts people leave. */
export function OverviewCustomers({ paid, current, startKey, mix, startMs, reviews, subs, audienceFailed, setActiveTab, newsletter = null }: {
  paid: Order[]; current: Order[]; startKey: string; mix: Mix; startMs: number; reviews: Reviews; subs: Subs; audienceFailed: boolean; setActiveTab?: (tab: string) => void;
  newsletter?: { subscribers: any[]; pending: any[] } | null;
}) {
  // Carts are read only when this tab is opened (the panel mounts then), so the Overview itself stays light.
  const [carts, setCarts] = useState<{ rows: any[] | null; error: boolean }>({ rows: null, error: false });
  const load = () => {
    setCarts({ rows: null, error: false });
    // The owner's own test carts aren't customers.
    abandonedCartApi.list(500).then(rows => setCarts({ rows: rows.filter((c: any) => String(c?.email || "").toLowerCase() !== SHOP_OWNER_EMAIL), error: false })).catch(() => setCarts({ rows: null, error: true }));
  };
  useEffect(load, []);

  const customers = useMemo(() => buildCustomers(paid), [paid]);
  const stats = useMemo(() => customerStats(customers), [customers]);
  const top = useMemo(() => [...customers].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 5), [customers]);
  const recovery = useMemo(() => (carts.rows ? cartRecovery(carts.rows, startMs) : null), [carts.rows, startMs]);
  const reminders = useMemo(() => (carts.rows ? reminderResults(carts.rows, startMs) : null), [carts.rows, startMs]);
  const weeks = useMemo(() => (newsletter ? newsletterWeeks(newsletter.subscribers, newsletter.pending) : null), [newsletter]);
  const weekTop = Math.max(1, ...(weeks || []).map(w => w.confirmed + w.waiting));
  const cohorts = useMemo(() => cohortRetention(paid, shopDayKey(Date.now()), 12, 6), [paid]);
  const timing = useMemo(() => repeatTiming(paid), [paid]);
  const split = useMemo(() => newVsReturningRevenue(paid, current, startKey), [paid, current, startKey]);
  const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
  const cohortColumns: Column<(typeof cohorts)[number]>[] = [
    { key: "m", header: "First order", lead: true, render: r => monthName(r.month) },
    { key: "c", header: "Customers", numeric: true, render: r => r.customers },
    ...Array.from({ length: 6 }, (_, k) => ({
      key: `m${k + 1}`, header: `+${k + 1} mo`, numeric: true,
      render: (r: (typeof cohorts)[number]) => {
        const v = r.cells[k];
        if (v === null) return <span style={{ color: "var(--rp-text-subtle)" }}>·</span>;
        return <span style={{ display: "inline-block", minWidth: 40, padding: "2px 4px", background: v > 0 ? `color-mix(in srgb, var(--rp-primary) ${Math.round(30 + 70 * Math.min(1, v / 50))}%, transparent)` : "transparent" }}>{v.toFixed(0)}%</span>;
      },
    })),
    { key: "r", header: "Spent", numeric: true, render: r => money(r.revenue) },
  ];

  return (
    <>
      <div className="rp-kpi-grid">
        <MetricCard label="Returning readers" value={percent(mix.returningRate, 0)}
          footer={`${mix.returning} returning · ${mix.fresh} new of ${mix.total} buyers this period`} />
        <MetricCard label="Repeat customers" value={percent(stats.repeatRate * 100, 0)}
          footer={`${stats.repeat} of ${stats.total} customers ever bought twice`} />
        <MetricCard label="Lifetime value" value={money(stats.avgLtv)} footer="average spend per customer, all time" />
        <MetricCard label="Revenue from returning" value={percent(split.returningShare, 0)} footer={`${money(split.returning)} returning · ${money(split.fresh)} new this period`} />
        <MetricCard label="Time to come back" value={timing.medianDays === null ? "—" : `${timing.medianDays} days`}
          footer={timing.within90Rate === null ? "median to a second order" : `median · ${percent(timing.within90Rate, 0)} back within 90 days`} />
        <MetricCard label="Subscribers" value={subs ? subs.total.toLocaleString() : audienceFailed ? "—" : "…"}
          footer={subs ? `+${subs.added} in this period` : audienceFailed ? "Newsletter unavailable" : "Loading…"} />
      </div>

      <div className="rp-split" style={SPLIT}>
        <SectionCard flush title="Do customers come back?" description="Each row is the customers whose first order was in that month; the cells show the share who bought again 1–6 months later (· = not yet)">
          {cohorts.length === 0 ? <EmptyState title="No customers yet" description="Cohorts appear after the first paid orders." />
            : <DataTable caption="Repeat purchases by first-order month" columns={cohortColumns} rows={cohorts} rowKey={r => r.month} />}
        </SectionCard>

        <SectionCard flush title="Top customers" description="By total spend, all time"
          actions={<SecondaryButton size="sm" onClick={() => setActiveTab?.("customers")}>All customers</SecondaryButton>}>
          {top.length === 0 ? <EmptyState title="No customers yet" description="Customers appear after their first paid order." /> : (
            <ul className="rp-list" aria-label="Top customers">
              {top.map(c => (
                <StatRow key={c.key} label={c.name || c.email}
                  hint={`${c.orderCount} order${c.orderCount === 1 ? "" : "s"} · last ${c.daysSinceLast} day${c.daysSinceLast === 1 ? "" : "s"} ago${c.country ? ` · ${c.country}` : ""}`}
                  value={<span style={{ display: "flex", gap: 8, alignItems: "center" }}><StatusBadge tone={c.segment === "vip" ? "primary" : c.segment === "at-risk" ? "warning" : "neutral"}>{SEGMENT_LABELS[c.segment]}</StatusBadge>{money(c.totalSpent)}</span>} />
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard flush title="Abandoned carts" description="Carts left with an email address, started in this period">
          {carts.error ? <ErrorState title="Carts unavailable" description="The saved carts could not be loaded." onRetry={load} />
            : !recovery ? <LoadingState label="Loading carts…" />
            : recovery.total === 0 ? <EmptyState icon="✓" title="No abandoned carts" description="Carts shoppers leave behind (after typing an email) are tracked here." />
            : (
              <ul className="rp-list" aria-label="Abandoned carts">
                <StatRow label="Carts left behind" hint={`${recovery.reminded} reminded by email`} value={recovery.total} />
                <StatRow label="Came back and bought" hint={`${percent(recovery.recoveryRate, 0)} of carts`} value={`${recovery.recovered} · ${money(recovery.recoveredValue)}`} />
                <StatRow label="Still waiting" hint="value of books left in bags" value={money(recovery.openValue)} tone={recovery.openValue > 0 ? "danger" : "muted"} />
              </ul>
            )}
        </SectionCard>

        <SectionCard flush title="Did the reminder emails work?" description="Reminder emails sent for carts left behind in this period, and who bought after getting one">
          {carts.error ? <ErrorState title="Carts unavailable" description="The saved carts could not be loaded." onRetry={load} />
            : !reminders ? <LoadingState label="Loading carts…" />
            : reminders.sent === 0 ? <EmptyState title="No reminders sent in this period" description="A reminder goes out about an hour after a shopper leaves a cart with their email (Settings › Notifications › Abandoned cart)." />
            : (
              <ul className="rp-list" aria-label="Reminder emails">
                <StatRow label="Reminders sent" value={reminders.sent} />
                <StatRow label="Bought after the reminder" hint={reminders.rate === null ? undefined : `${percent(reminders.rate, 0)} of reminders`} value={reminders.bought} />
                <StatRow label="Sales after a reminder" hint="the bag's value when it was left" value={money(reminders.value)} />
              </ul>
            )}
          <p className="rp-hint" style={{ padding: "12px 20px 16px", margin: 0 }}>Saved carts are kept for 30 days, so longer periods show the last 30 days.</p>
        </SectionCard>

        <SectionCard flush title="Newsletter sign-ups by week" description="Confirmed sign-ups and those still waiting for the shopper to click the confirmation email, last 8 weeks">
          {!weeks ? (audienceFailed ? <ErrorState title="Newsletter unavailable" description="Sign-ups could not be loaded." /> : <LoadingState label="Loading sign-ups…" />)
            : weeks.every(w => w.confirmed + w.waiting === 0) ? <EmptyState title="No sign-ups in the last 8 weeks" description="Sign-ups from the newsletter box appear here by week." />
            : (
              <ul className="rp-list" aria-label="Newsletter sign-ups by week">
                {weeks.map(w => (
                  <BarRow key={w.week} label={`Week of ${w.label}`} share={((w.confirmed + w.waiting) / weekTop) * 100} color="var(--rp-success)"
                    value={<>{w.confirmed} confirmed{w.waiting > 0 && <span style={{ color: "var(--rp-warning)" }}> · {w.waiting} waiting</span>}</>} />
                ))}
              </ul>
            )}
          {weeks && weeks.reduce((s, w) => s + w.waiting, 0) > weeks.reduce((s, w) => s + w.confirmed, 0) && (
            <p className="rp-hint" style={{ padding: "12px 20px 16px", margin: 0, color: "var(--rp-warning)" }}>! More sign-ups are waiting than confirmed: the confirmation email may be landing in spam folders.</p>
          )}
        </SectionCard>

        <SectionCard flush title="Reader reviews" description="What readers say about your books"
          actions={<SecondaryButton size="sm" onClick={() => setActiveTab?.("reviews")}>Moderate</SecondaryButton>}>
          {!reviews ? (audienceFailed ? <ErrorState title="Reviews unavailable" description="Reviews could not be loaded." /> : <LoadingState label="Loading reviews…" />) : (
            <ul className="rp-list" aria-label="Reviews">
              <StatRow label="Average rating" hint={`${reviews.approved} approved review${reviews.approved === 1 ? "" : "s"}`}
                value={reviews.average !== null ? `${reviews.average.toFixed(1)} / 5` : "None yet"} />
              <StatRow label="Waiting for moderation" value={reviews.pending > 0 ? <StatusBadge tone="warning">{reviews.pending}</StatusBadge> : <StatusBadge tone="success">✓ None</StatusBadge>} />
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
