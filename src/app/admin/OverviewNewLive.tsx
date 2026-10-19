import { useEffect, useMemo, useState, type FormEvent } from "react";
import "./overviewNewLive.css";
import { EmptyState, ErrorState, GhostButton, LoadingState, PrimaryButton, SecondaryButton, useConfirm } from "./riso/components";
import type { Book, Order } from "./overviewInsights";
import type { Range } from "./overviewRange";
import { adminApi } from "./api";
import { abandonedCartApi } from "../lib/commerce";
import { SHOP_OWNER_EMAIL } from "../lib/ownerDevice";
import { shopDayKey } from "../lib/shopDay";
import { formatReleaseDate } from "../features/site/preorder";
import { sharedLoad } from "./overviewShared";
import { readNotes, writeNotes } from "./overviewNotesStore";
import { money } from "./OverviewParts";
import {
  cityMap, cleanLeadDays, dailyRevenue, giftOwed, liveNow, newNoteId, noteEffect, preorderRows, shortDay, soldOutCountdown,
  MAX_NOTE_TEXT, type SalesNote,
} from "./overviewNewLive";

export type NewLiveWidget = "live" | "notes" | "preorders" | "map" | "giftOwed" | "soldOut";
export type NewLiveConfig = { leadDays?: number };

/**
 * Six Overview board widgets (19 October 2026): On the site right now, Sales with your notes, Pre-order tracker,
 * Order map, Gift card money owed and Sold-out countdown. The board draws each one's outer card; the maths is in
 * overviewNewLive.ts. Carts and gift cards are read once per board (sharedLoad); notes are one admin-only document.
 */
export function OverviewNewLive({ only, paid, allOrders, current, books, range, activeNow, config, onConfig, full, setActiveTab }: {
  only: NewLiveWidget;
  /** Every real paid order, all time (the owner's own removed). */ paid: Order[];
  /** Every order loaded, as stored (unpaid checkouts included). */ allOrders: Order[];
  /** Paid orders in the chosen period. */ current: Order[];
  books: Book[]; range: Range;
  /** People on the site now from Google Analytics (null when it isn't connected or didn't say). */ activeNow: number | null;
  config?: NewLiveConfig; onConfig?: (patch: NewLiveConfig) => void; full?: boolean; setActiveTab?: (tab: string) => void;
}) {
  switch (only) {
    case "live": return <LiveNow allOrders={allOrders} activeNow={activeNow} />;
    case "notes": return <SalesNotes paid={paid} range={range} />;
    case "preorders": return <Preorders paid={paid} books={books} setActiveTab={setActiveTab} />;
    case "map": return <OrderMap current={current} full={!!full} range={range} />;
    case "giftOwed": return <GiftOwed setActiveTab={setActiveTab} />;
    case "soldOut": return <SoldOut paid={paid} books={books} leadDays={cleanLeadDays(config?.leadDays)} onLead={d => onConfig?.({ leadDays: d })} full={!!full} />;
  }
}

// ── On the site right now ─────────────────────────────────────────────────────────────────────────────────────────

function LiveNow({ allOrders, activeNow }: { allOrders: Order[]; activeNow: number | null }) {
  const [carts, setCarts] = useState<{ rows: any[] | null; error: boolean }>({ rows: null, error: false });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // The same shared read as the Abandoned carts widget, so this adds no read of its own.
    sharedLoad("carts", () => abandonedCartApi.list(500))
      .then(rows => setCarts({ rows: rows.filter((c: any) => String(c?.email || "").toLowerCase() !== SHOP_OWNER_EMAIL), error: false }))
      .catch(() => setCarts({ rows: null, error: true }));
    // Re-counts the windows each minute from what is already loaded; the board re-reads orders every 5 minutes.
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const live = useMemo(() => liveNow(allOrders, carts.rows, now), [allOrders, carts.rows, now]);
  const tiles: Array<{ n: number | null; label: string; hint: string }> = [
    { n: activeNow, label: "On the site", hint: activeNow === null ? "Connect Google Analytics to see visitors" : "Google Analytics, last 30 min" },
    { n: carts.rows ? live.bags : null, label: "Have a bag", hint: carts.error ? "Carts couldn't be read" : "with an email, last 30 min" },
    { n: live.checkout, label: "At checkout", hint: "card or PayPal started, not paid yet" },
    { n: live.bought, label: "Bought, last hour", hint: live.bought ? money(live.boughtTotal) : "no sale in the last hour" },
  ];
  return (
    <section className="rp-nl-live" aria-label="On the site right now">
      <div className="rp-nl-live-grid">
        {tiles.map(t => (
          <div key={t.label} className="rp-nl-live-tile" data-hot={t.n ? "" : undefined}>
            <div className="rp-nl-live-num">{t.n === null ? "—" : t.n.toLocaleString()}</div>
            <div className="rp-nl-live-label">{t.label}</div>
            <div className="rp-nl-live-hint">{t.hint}</div>
          </div>
        ))}
      </div>
      {live.lastBag && <p className="rp-nl-note">Latest bag has <strong>“{live.lastBag}”</strong> in it.</p>}
      <p className="rp-nl-note">Counts again every minute; new orders arrive with the board's 5-minute refresh.</p>
    </section>
  );
}

// ── Sales with your notes ─────────────────────────────────────────────────────────────────────────────────────────

function SalesNotes({ paid, range }: { paid: Order[]; range: Range }) {
  const [notes, setNotes] = useState<{ rows: SalesNote[] | null; error: boolean }>({ rows: null, error: false });
  const today = shopDayKey(Date.now());
  const [draft, setDraft] = useState<{ id: string | null; day: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [ask, confirmNode] = useConfirm();
  const load = (fresh = false) => {
    setNotes({ rows: null, error: false });
    sharedLoad("overviewNotes", readNotes, fresh).then(rows => setNotes({ rows, error: false })).catch(() => setNotes({ rows: null, error: true }));
  };
  useEffect(() => load(), []);

  const endKey = range.endKey > today ? today : range.endKey;
  const series = useMemo(() => dailyRevenue(paid, range.startKey, endKey), [paid, range.startKey, endKey]);
  const max = Math.max(1, ...series.map(d => d.revenue));
  const inRange = (notes.rows || []).filter(n => n.day >= range.startKey && n.day <= endKey);
  const outside = (notes.rows || []).length - inRange.length;
  const xOf = (day: string) => {
    const i = series.findIndex(d => d.day === day);
    return series.length > 1 ? (Math.max(0, i) / (series.length - 1)) * 100 : 50;
  };
  const line = series.map((d, i) => `${i === 0 ? "M" : "L"}${series.length > 1 ? ((i / (series.length - 1)) * 100).toFixed(2) : 50},${(100 - (d.revenue / max) * 92).toFixed(2)}`).join(" ");

  const save = async (next: SalesNote[]) => {
    setSaving(true); setSaveError("");
    try {
      const clean = await writeNotes(next);
      sharedLoad("overviewNotes", () => Promise.resolve(clean), true);
      setNotes({ rows: clean, error: false });
      return true;
    } catch (err: any) {
      setSaveError(err?.message && /too many/i.test(err.message) ? err.message : "The note couldn't be saved. Check your connection and try again.");
      return false;
    } finally { setSaving(false); }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft || !notes.rows) return;
    const text = draft.text.trim();
    if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(draft.day)) return;
    const next = draft.id
      ? notes.rows.map(n => (n.id === draft.id ? { ...n, day: draft.day, text } : n))
      : [...notes.rows, { id: newNoteId(), day: draft.day, text }];
    if (await save(next)) setDraft(null);
  };
  const remove = async (n: SalesNote) => {
    if (!notes.rows) return;
    if (!(await ask({ title: "Delete this note?", message: `“${n.text}” on ${shortDay(n.day)} will be removed from the chart.`, confirmLabel: "Delete note" }))) return;
    await save(notes.rows.filter(x => x.id !== n.id));
  };

  if (notes.error) return <ErrorState title="Notes unavailable" description="Your notes couldn't be read." onRetry={() => load(true)} />;
  const total = series.reduce((s, d) => s + d.revenue, 0);
  return (
    <section className="rp-nl-notes" aria-label="Sales with your notes">
      {confirmNode}
      <figure className="rp-nl-chart" aria-label={`Net revenue each day, ${range.phrase}: ${money(total)}.${inRange.length ? ` Notes on ${inRange.map(n => shortDay(n.day)).join(", ")}.` : ""}`}>
        <div className="rp-nl-chart-plot" aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
            <path d={`${line} L100,100 L0,100 Z`} className="rp-nl-chart-fill" />
            <path d={line} className="rp-nl-chart-line" vectorEffect="non-scaling-stroke" />
          </svg>
          {inRange.map((n, i) => (
            <span key={n.id} className="rp-nl-flag" style={{ left: `${xOf(n.day)}%` }} title={`${shortDay(n.day)}: ${n.text}`}><span>{i + 1}</span></span>
          ))}
        </div>
        <figcaption className="rp-nl-axis" aria-hidden="true"><span>{shortDay(range.startKey)}</span><span>{shortDay(endKey)}</span></figcaption>
      </figure>

      {notes.rows === null ? <LoadingState label="Loading notes…" /> : (
        <>
          {inRange.length === 0 && !draft && <p className="rp-nl-note">No notes in this period. Add one for a post, a newsletter, a fair or a review to see if it sold books.</p>}
          {inRange.length > 0 && (
            <ol className="rp-nl-notelist" aria-label="Your notes in this period">
              {inRange.map((n, i) => {
                const fx = noteEffect(paid, n.day, today);
                const tone = !fx.complete ? "wait" : fx.next3 > fx.usual * 1.2 ? "up" : fx.next3 < fx.usual * 0.8 ? "down" : "same";
                return (
                  <li key={n.id}>
                    <span className="rp-nl-num" aria-hidden="true">{i + 1}</span>
                    <div className="rp-nl-notebody">
                      <div className="rp-nl-notetext">{n.text} <span className="rp-nl-day">· {shortDay(n.day)}</span></div>
                      <div className="rp-nl-effect" data-tone={tone}>
                        {fx.complete ? "next 3 days" : "so far"} {money(fx.next3)} · usual {money(Math.round(fx.usual))}
                        {tone === "up" ? " ▲" : tone === "down" ? " ▼" : ""}
                      </div>
                    </div>
                    <span className="rp-nl-noteactions">
                      <GhostButton size="sm" onClick={() => setDraft({ id: n.id, day: n.day, text: n.text })} aria-label={`Edit note: ${n.text}`}>Edit</GhostButton>
                      <GhostButton size="sm" onClick={() => remove(n)} disabled={saving} aria-label={`Delete note: ${n.text}`}>Delete</GhostButton>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          {outside > 0 && <p className="rp-nl-note">{outside} more note{outside === 1 ? "" : "s"} outside this period.</p>}
          {draft ? (
            <form className="rp-nl-form" onSubmit={submit} aria-label={draft.id ? "Edit note" : "Add a note"}>
              <label className="rp-field">
                <span className="rp-label">Day</span>
                <input className="rp-input" type="date" required value={draft.day} max={today} onChange={e => setDraft({ ...draft, day: e.target.value })} />
              </label>
              <label className="rp-field rp-nl-form-text">
                <span className="rp-label">What happened</span>
                <input className="rp-input" type="text" required maxLength={MAX_NOTE_TEXT} placeholder="Instagram reel, newsletter, book fair…" value={draft.text}
                  onChange={e => setDraft({ ...draft, text: e.target.value })} autoFocus />
              </label>
              <span className="rp-nl-form-actions">
                <PrimaryButton size="sm" type="submit" disabled={saving || !draft.text.trim()}>{saving ? "Saving…" : draft.id ? "Save note" : "Add note"}</PrimaryButton>
                <GhostButton size="sm" type="button" onClick={() => { setDraft(null); setSaveError(""); }}>Cancel</GhostButton>
              </span>
              {saveError && <p className="rp-nl-error" role="alert">{saveError}</p>}
            </form>
          ) : (
            <div className="rp-nl-bar">
              <SecondaryButton size="sm" onClick={() => setDraft({ id: null, day: endKey, text: "" })}>+ Add a note</SecondaryButton>
              {saveError && <span className="rp-nl-error" role="alert">{saveError}</span>}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ── Pre-order tracker ─────────────────────────────────────────────────────────────────────────────────────────────

function Preorders({ paid, books, setActiveTab }: { paid: Order[]; books: Book[]; setActiveTab?: (tab: string) => void }) {
  const rows = useMemo(() => preorderRows(paid, books), [paid, books]);
  if (!rows.length) return <EmptyState icon="✓" title="No books on pre-order" description="Books with Take pre-orders switched on show here with the copies promised so far." />;
  return (
    <ul className="rp-nl-pre" aria-label="Pre-orders by book">
      {rows.map(r => {
        const share = r.run ? Math.min(100, (r.promised / r.run) * 100) : 0;
        const when = r.release ? `out ${formatReleaseDate(r.release)}` : "date to be announced";
        return (
          <li key={r.bookId} data-full={r.full ? "" : undefined}>
            <div className="rp-nl-pre-head">
              <strong>{r.title}</strong>
              <span className="rp-nl-mono">{r.run !== null ? `${r.promised} of ${r.run}` : `${r.promised} promised`} · {when}</span>
            </div>
            {r.run !== null
              ? <div className="rp-nl-meter" role="progressbar" aria-label={`${r.title}: copies promised`} aria-valuemin={0} aria-valuemax={r.run} aria-valuenow={r.promised}
                  aria-valuetext={`${r.promised} of ${r.run} copies promised`}><span style={{ width: `${share}%` }} /></div>
              : <p className="rp-nl-note">Stock isn't counted for this book, so there's no limit to show.</p>}
            {r.full && <p className="rp-nl-warn">! {r.left === 0 ? "Every copy is promised" : `Only ${r.left} cop${r.left === 1 ? "y" : "ies"} left`} before release.</p>}
          </li>
        );
      })}
      {setActiveTab && <li className="rp-nl-pre-foot"><GhostButton size="sm" onClick={() => setActiveTab("catalog")}>Open books</GhostButton></li>}
    </ul>
  );
}

// ── Order map ─────────────────────────────────────────────────────────────────────────────────────────────────────

const MAP_W = 136, MAP_H = 100;
function OrderMap({ current, full, range }: { current: Order[]; full: boolean; range: Range }) {
  const map = useMemo(() => cityMap(current), [current]);
  if (!current.length) return <EmptyState title="No orders in this period" description="Cities appear once paid orders arrive." />;
  const placed = map.cities.filter(c => c.x !== null && c.y !== null);
  const unplaced = map.cities.filter(c => c.x === null);
  const top = Math.max(1, ...map.cities.map(c => c.orders));
  const ranked = map.cities.slice(0, full ? 20 : 8);
  const labelled = new Set(placed.slice(0, 3).map(c => c.key));
  const lat = (d: number) => ((60 - d) / 36) * MAP_H; // the same box as project()
  const lon = (d: number) => ((d + 130) / 70) * MAP_W;
  return (
    <section className="rp-nl-map" aria-label={`Orders by city, ${range.phrase}`}>
      <figure className="rp-nl-map-fig">
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label={`Map of Canada and the US: ${placed.slice(0, 5).map(c => `${c.city} ${c.orders}`).join(", ") || "no mapped cities"}`}>
          {[30, 40, 50].map(d => <line key={d} x1={0} x2={MAP_W} y1={lat(d)} y2={lat(d)} className="rp-nl-grid" />)}
          {[-120, -110, -100, -90, -80, -70].map(d => <line key={d} y1={0} y2={MAP_H} x1={lon(d)} x2={lon(d)} className="rp-nl-grid" />)}
          {/* The 49th parallel, then the Great Lakes and St. Lawrence, roughly. */}
          <polyline className="rp-nl-border" points={[[49, -123.3], [49, -95.2], [48.3, -89.5], [46.5, -84.5], [45.3, -82.5], [43, -82.4], [42, -83], [41.7, -82.5], [42.8, -79], [43.6, -79.2], [44.2, -76.4], [45, -74.7], [45, -71.5], [47.3, -69.2], [47.1, -67.8], [45.1, -67]].map(([a, o]) => `${lon(o)},${lat(a)}`).join(" ")} />
          <text x={lon(-112)} y={lat(56)} className="rp-nl-country">CANADA</text>
          <text x={lon(-108)} y={lat(37)} className="rp-nl-country">UNITED STATES</text>
          {[...placed].reverse().map(c => {
            const r = 1.6 + Math.sqrt(c.orders / top) * 4.4;
            return (
              <g key={c.key}>
                <circle cx={(c.x! / 100) * MAP_W} cy={(c.y! / 100) * MAP_H} r={r} className="rp-nl-dot"><title>{`${c.city}${c.region ? `, ${c.region}` : ""}: ${c.orders} order${c.orders === 1 ? "" : "s"}`}</title></circle>
                {labelled.has(c.key) && <text x={(c.x! / 100) * MAP_W + r + 1} y={(c.y! / 100) * MAP_H + 1.4} className="rp-nl-city">{c.city}</text>}
              </g>
            );
          })}
        </svg>
        <figcaption className="rp-nl-note">Canada and the US. Bigger dot = more orders. City only, never the street.</figcaption>
      </figure>
      <div className="rp-nl-map-list">
        <ol aria-label="Cities with the most orders">
          {ranked.map(c => (
            <li key={c.key}>
              <span>{c.city}{c.region ? <span className="rp-nl-dim">, {c.region}</span> : null}{c.x === null ? <span className="rp-nl-dim"> · not on the map</span> : null}</span>
              <span className="rp-nl-mono">{c.orders} · {money(Math.round(c.revenue))}</span>
            </li>
          ))}
        </ol>
        {unplaced.length > 0 && ranked.length < map.cities.length && <p className="rp-nl-note">{map.cities.length - ranked.length} more cities, {unplaced.length} not on the map.</p>}
        {map.elsewhere.length > 0 && (
          <p className="rp-nl-note"><strong>Elsewhere:</strong> {map.elsewhere.slice(0, 6).map(e => `${e.country} ${e.orders}`).join(" · ")}{map.elsewhere.length > 6 ? ` · ${map.elsewhere.length - 6} more` : ""}</p>
        )}
        {map.unknown > 0 && <p className="rp-nl-note">{map.unknown} order{map.unknown === 1 ? "" : "s"} without a city (pickup or digital).</p>}
      </div>
    </section>
  );
}

// ── Gift card money owed ──────────────────────────────────────────────────────────────────────────────────────────

function GiftOwed({ setActiveTab }: { setActiveTab?: (tab: string) => void }) {
  const [cards, setCards] = useState<{ rows: any[] | null; error: boolean }>({ rows: null, error: false });
  const load = (fresh = false) => {
    setCards({ rows: null, error: false });
    sharedLoad("giftCards", () => adminApi.getGiftCards(), fresh).then(rows => setCards({ rows, error: false })).catch(() => setCards({ rows: null, error: true }));
  };
  useEffect(() => load(), []);
  const s = useMemo(() => (cards.rows ? giftOwed(cards.rows) : null), [cards.rows]);
  if (cards.error) return <ErrorState title="Gift cards unavailable" description="Gift cards couldn't be read." onRetry={() => load(true)} />;
  if (!s) return <LoadingState label="Reading gift cards…" />;
  if (!s.total) return <EmptyState title="No gift cards yet" description="Once readers buy gift cards, what's still to be spent shows here." />;
  const cad = (minor: number) => money(minor / 100);
  return (
    <section className="rp-nl-gift" aria-label="Gift card money owed">
      <div className="rp-nl-big">{cad(s.owedMinor)}</div>
      <div className="rp-nl-note">still to be spent, on {s.cards} card{s.cards === 1 ? "" : "s"}</div>
      <ul className="rp-nl-stats">
        <li><span>Sold this year</span><span className="rp-nl-mono">{cad(s.soldYearMinor)}</span></li>
        <li><span>Spent so far</span><span className="rp-nl-mono">{cad(s.spentMinor)}</span></li>
        <li data-tone={s.staleCards ? "warn" : undefined}><span>Never used, over 6 months</span><span className="rp-nl-mono">{s.staleCards} · {cad(s.staleMinor)}</span></li>
      </ul>
      {setActiveTab && <GhostButton size="sm" onClick={() => setActiveTab("giftCards")}>Open gift cards</GhostButton>}
    </section>
  );
}

// ── Sold-out countdown ────────────────────────────────────────────────────────────────────────────────────────────

const SCALE = 120;
function SoldOut({ paid, books, leadDays, onLead, full }: { paid: Order[]; books: Book[]; leadDays: number; onLead: (d: number) => void; full: boolean }) {
  const rows = useMemo(() => soldOutCountdown(paid, books, leadDays, Date.now(), full ? 25 : 10), [paid, books, leadDays, full]);
  const [lead, setLead] = useState(String(leadDays));
  useEffect(() => setLead(String(leadDays)), [leadDays]);
  const today = shopDayKey(Date.now());
  const at = (d: number) => `${Math.min(100, (d / SCALE) * 100)}%`;
  const tick = (d: number) => { const t = new Date(`${today}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + d); return shortDay(t.toISOString().slice(0, 10)); };
  const commit = () => { const n = cleanLeadDays(lead); setLead(String(n)); if (n !== leadDays) onLead(n); };
  return (
    <section className="rp-nl-count" aria-label="Sold-out countdown">
      <div className="rp-nl-bar">
        <label className="rp-nl-lead">
          <span>A reprint takes</span>
          <input className="rp-input" type="number" min={1} max={365} inputMode="numeric" value={lead} aria-label="Days a reprint takes"
            onChange={e => setLead(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); }} />
          <span>days</span>
        </label>
      </div>
      {rows.length === 0 ? <EmptyState icon="✓" title="Nothing selling out" description="No counted print book sold in the last 30 days, so nothing is on course to sell out." /> : (
        <>
          <div className="rp-nl-time" aria-hidden="true">
            <span className="rp-nl-time-lead" style={{ left: at(leadDays) }} />
            {[0, 30, 60, 90, 120].map(d => (
              <span key={d} className="rp-nl-time-tick" data-minor={d === 30 || d === 90 ? "" : undefined}
                style={{ left: at(d), transform: d === 0 ? "none" : d === SCALE ? "translateX(-100%)" : undefined }}>{d === 0 ? "Today" : tick(d)}</span>
            ))}
          </div>
          <ol className="rp-nl-countlist" aria-label={`Books by days until sold out. A reprint takes ${leadDays} days.`}>
            {rows.map(r => {
              const days = Math.round(r.days);
              return (
                <li key={r.key} data-soon={r.beforeReprint ? "" : undefined}>
                  <div className="rp-nl-pre-head">
                    <strong>{r.label}</strong>
                    <span className="rp-nl-mono">{days > SCALE ? `${SCALE}+ days` : `${days} day${days === 1 ? "" : "s"}`} · around {shortDay(r.outOn)}</span>
                  </div>
                  <div className="rp-nl-countrack">
                    <span className="rp-nl-countbar" style={{ width: at(Math.max(1, r.days)) }} />
                    <span className="rp-nl-time-lead" style={{ left: at(leadDays) }} />
                  </div>
                  <div className="rp-nl-note">{r.stock} left · {r.sold30} sold in 30 days{r.beforeReprint ? " · ! sells out before a reprint could arrive" : ""}</div>
                </li>
              );
            })}
          </ol>
          <p className="rp-nl-note">Pace = copies a day over the last 30 days. The dashed line is how long a reprint takes.</p>
        </>
      )}
    </section>
  );
}
