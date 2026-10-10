import { useMemo } from "react";
import { EmptyState, GhostButton, SectionCard, StatusBadge } from "./riso/components";
import { bestSellers, formatMix, topCountries, totals, unitsById, type Book, type Order } from "./overviewInsights";
import { categoryBreakdown, categoryNames, weekdayMix, type Daily } from "./overviewTraffic";
import { discountPerformance } from "./discountPerformance";
import { BarRow, ROW, SPLIT, StatRow, money, percent } from "./OverviewParts";

/** Overview › Dig deeper › Sales: what is selling, in which format, where, when and at what discount. */
export function OverviewSales({ current, previous, books, categoriesSetting, dailyCurrent, onEditBook, fetchingBookId }: {
  current: Order[]; previous: Order[]; books: Book[]; categoriesSetting: unknown; dailyCurrent: Daily[];
  onEditBook: (id: string) => void; fetchingBookId: string | null;
}) {
  const cur = useMemo(() => totals(current), [current]);
  const best = useMemo(() => bestSellers(current, 5), [current]);
  const prevUnits = useMemo(() => unitsById(previous), [previous]);
  const formats = useMemo(() => formatMix(current, books), [current, books]);
  const countries = useMemo(() => topCountries(current), [current]);
  const categories = useMemo(() => categoryBreakdown(current, books, categoryNames(categoriesSetting), dailyCurrent), [current, books, categoriesSetting, dailyCurrent]);
  const weekdays = useMemo(() => weekdayMix(current), [current]);
  const codes = useMemo(() => [...discountPerformance(current).entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5), [current]);
  const maxDay = Math.max(1, ...weekdays.map(d => d.orders));

  return (
    <div className="rp-split" style={SPLIT}>
      <SectionCard flush title="Best sellers" description="Top titles by revenue, with units against the period before">
        {best.length === 0 ? <EmptyState title="No sales in this period" description="Your top titles appear once paid orders arrive." /> : (
          <ul className="rp-list" aria-label="Best selling titles">
            {best.map((b, i) => {
              const before = prevUnits.get(b.id) || 0;
              const diff = b.units - before;
              return (
                <li key={b.id} style={ROW}>
                  <div style={{ minWidth: 0 }}>
                    <span className="rp-mono">{i + 1}. </span>
                    <GhostButton size="sm" onClick={() => onEditBook(b.id)} disabled={fetchingBookId === b.id}
                      aria-label={`Edit ${b.title}`} style={{ padding: 0, textAlign: "left", whiteSpace: "normal", textTransform: "none", letterSpacing: 0, fontSize: "var(--rp-text-base)" }}>
                      {b.title}
                    </GhostButton>
                    <div className="rp-hint rp-mono">{b.units} sold · {b.share.toFixed(0)}% of revenue</div>
                  </div>
                  <span style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                    <StatusBadge tone={before === 0 ? "info" : diff > 0 ? "success" : diff < 0 ? "danger" : "neutral"}>
                      {before === 0 ? "new" : diff === 0 ? "no change" : `${diff > 0 ? "+" : ""}${diff} units`}
                    </StatusBadge>
                    <span className="rp-mono" style={{ whiteSpace: "nowrap" }}>{money(b.revenue)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard flush title="Where the money goes" description="What customers paid, broken down">
        {cur.orders === 0 ? <EmptyState title="No sales in this period" description="The breakdown appears once paid orders arrive." /> : (
          <ul className="rp-list" aria-label="Revenue breakdown">
            <StatRow label="Books" hint="before discounts" value={money(cur.subtotal)} />
            <StatRow label="Discounts" hint={`${percent(cur.discountRate)} of list price`} value={`− ${money(cur.discounts)}`} />
            <StatRow label="Shipping charged" value={money(cur.shipping)} />
            <StatRow label="Sales tax collected" hint="owed to the tax office; included in what customers paid" value={money(cur.tax)} />
            {cur.giftCards > 0 && <StatRow label="Paid with gift cards" hint="not in the card/PayPal total below" value={`− ${money(cur.giftCards)}`} />}
            <StatRow label="Paid by customers" hint="card, PayPal and other payments, with tax and shipping" value={money(cur.revenue)} />
            <StatRow label="Refunded" hint="partial refunds" value={cur.refunded > 0 ? `− ${money(cur.refunded)}` : money(0)} tone={cur.refunded > 0 ? "danger" : "muted"} />
            <StatRow label="Net received" hint="after refunds; the revenue figures on this page" value={<strong>{money(cur.net)}</strong>} />
            <StatRow label="Net received without sales tax" hint="approximate: refunds are not split into tax" value={money(Math.max(0, cur.net - cur.tax))} />
            {cur.giftCardsSold > 0 && <StatRow label="Gift cards sold" hint="counted above, but not earned until the card is spent" value={money(cur.giftCardsSold)} tone="muted" />}
          </ul>
        )}
      </SectionCard>

      <SectionCard flush title="Format mix"
        description={formats.total > 0 ? `${formats.printShare.toFixed(0)}% print · ${formats.digitalShare.toFixed(0)}% digital` : "Revenue by book format"}>
        {formats.formats.length === 0 ? <EmptyState title="No sales in this period" description="Print vs digital revenue shows here once books sell." /> : (
          <ul className="rp-list" aria-label="Revenue by format">
            {formats.formats.map(f => (
              <BarRow key={f.format} label={f.format} value={`${money(f.revenue)} · ${f.units} sold`} share={formats.total ? (f.revenue / formats.total) * 100 : 0} />
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard flush title="Where readers are" description="Top destinations by revenue">
        {countries.length === 0 ? <EmptyState title="No orders in this period" description="Countries appear once paid orders arrive." /> : (
          <ul className="rp-list" aria-label="Top countries">
            {countries.map(c => (
              <BarRow key={c.country} label={c.country} value={`${money(c.revenue)} · ${c.orders} order${c.orders === 1 ? "" : "s"}`}
                share={cur.revenue > 0 ? (c.revenue / cur.revenue) * 100 : 0} color="var(--rp-info)" />
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard flush title="Categories" description="Sales and recorded visits in this period">
        {categories.every(c => c.sold === 0 && c.views === 0) ? <EmptyState title="Nothing in this period" description="Categories with visits or sales will be listed here." /> : (
          <ul className="rp-list" aria-label="Categories">
            {categories.map(cat => (
              <li key={cat.name} style={ROW}>
                <div><strong>{cat.name}</strong><div className="rp-hint rp-mono">{cat.views.toLocaleString()} visits</div></div>
                <div style={{ textAlign: "right" }}>
                  <div className="rp-mono">{money(cat.revenue)}</div>
                  <div className="rp-hint rp-mono">{cat.sold} sold</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard flush title="Busiest days" description="Orders by day of the week (Toronto time)">
        {cur.orders === 0 ? <EmptyState title="No orders in this period" description="Weekdays fill in as orders arrive." /> : (
          <ul className="rp-list" aria-label="Orders by weekday">
            {weekdays.map(d => <BarRow key={d.day} label={d.day} value={`${d.orders} order${d.orders === 1 ? "" : "s"} · ${money(d.revenue)}`} share={(d.orders / maxDay) * 100} color="var(--rp-info)" />)}
          </ul>
        )}
      </SectionCard>

      <SectionCard flush title="Discount codes" description="Orders that used a code in this period">
        {codes.length === 0 ? <EmptyState title="No codes used" description="Codes customers apply at checkout are ranked here." /> : (
          <ul className="rp-list" aria-label="Discount code results">
            {codes.map(([code, p]) => (
              <StatRow key={code} label={code.startsWith("#") ? <span>{p.label}</span> : <span className="rp-mono">{p.label}</span>}
                hint={`${p.orders} order${p.orders === 1 ? "" : "s"} · avg ${money(p.avgOrder)} · ${money(p.discountGiven)} given away`} value={money(p.revenue)} />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
