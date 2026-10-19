import type { ReactNode } from "react";
import { StatusBadge } from "./riso/components";
import { friendlyReason, isPlainMessage } from "./studio/friendlyError";

/**
 * Layout helpers for the long Settings pages (General, Payments): an "On this page" list that jumps to a topic or
 * card, topic groups with a heading, and a folded "How to set it up" box for step-by-step instructions.
 * Jumps scroll and move focus without touching the address bar (the admin's hash is its page route).
 */

export type ContentsItem = { id: string; label: string; unsaved?: boolean; note?: string };
export type ContentsGroup = { id: string; title: string; items: ContentsItem[] };

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Scrolls to the element with this id and moves keyboard focus there. */
export function jumpTo(id: string) {
  const el = typeof document !== "undefined" ? document.getElementById(id) : null;
  if (!el) return;
  el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  el.focus({ preventScroll: true });
}

const buttonStyle = {
  display: "inline-flex", alignItems: "center", flexWrap: "wrap" as const, gap: 6, minHeight: 32, padding: "2px 0", border: 0,
  background: "none", font: "inherit", textAlign: "left" as const, cursor: "pointer",
};
const underline = { textDecoration: "underline", textDecorationColor: "var(--rp-border-strong, currentColor)", textUnderlineOffset: 3 };

export function SettingsContents({ groups, label = "On this page" }: { groups: ContentsGroup[]; label?: string }) {
  return (
    <nav aria-label={label} className="rp-card" style={{ padding: "16px 20px" }} data-settings-contents>
      <div className="rp-sect" style={{ marginBottom: 12 }}>{label}</div>
      <div style={{ display: "grid", gap: "12px 24px", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))" }}>
        {groups.map((g) => {
          const unsaved = g.items.filter((i) => i.unsaved).length;
          return (
            <div key={g.id} style={{ minWidth: 0 }}>
              <button type="button" onClick={() => jumpTo(g.id)} className="rp-label" style={{ ...buttonStyle, fontWeight: 700, color: "var(--rp-text)" }}>
                {g.title}
                {unsaved > 0 && <StatusBadge tone="warning">{unsaved} unsaved</StatusBadge>}
              </button>
              <ul style={{ listStyle: "none", margin: "2px 0 0", padding: 0, display: "flex", flexWrap: "wrap", columnGap: 16 }}>
                {g.items.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => jumpTo(item.id)} className="rp-hint" style={{ ...buttonStyle, color: "var(--rp-text-muted)" }}>
                      <span style={underline}>{item.label}</span>
                      {item.unsaved && <><span aria-hidden="true" style={{ color: "var(--rp-warning)" }}>●</span><span className="rp-sr-only">(unsaved changes)</span></>}
                      {item.note && <span>· {item.note}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

/** One topic of a settings page: a heading the contents list jumps to, then its cards. */
export function SettingsGroup({ id, title, subcopy, children }: { id: string; title: string; subcopy?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="rp-stack" style={{ gap: "var(--rp-space-4)" }}>
      <div id={id} tabIndex={-1} style={{ scrollMarginTop: 16, outline: "none", marginTop: "var(--rp-space-5)", paddingTop: "var(--rp-space-4)", borderTop: "2px solid var(--rp-border-strong, var(--rp-border))" }}>
        <h2 id={`${id}-title`} className="rp-kicker" style={{ margin: 0, fontSize: "var(--rp-text-sm)" }}>{title}</h2>
        {subcopy && <p className="rp-page-desc" style={{ margin: "6px 0 0" }}>{subcopy}</p>}
      </div>
      {children}
    </section>
  );
}

/** A card the contents list can jump to. */
export function SettingsAnchor({ id, children }: { id: string; children: ReactNode }) {
  return <div id={id} tabIndex={-1} style={{ scrollMarginTop: 16, outline: "none" }}>{children}</div>;
}

/** Step-by-step setup instructions, folded so the card shows its controls first. */
export function HowTo({ summary = "How to set it up", open, children }: { summary?: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} style={{ margin: "0 0 12px", border: "1px solid var(--rp-border)", background: "var(--rp-surface-sunken)", padding: "0 12px" }}>
      <summary className="rp-label" style={{ cursor: "pointer", padding: "10px 0" }}>{summary}</summary>
      <div style={{ paddingBottom: 12 }}>{children}</div>
    </details>
  );
}

/**
 * "Couldn't <what>. <reason>" for a toast or message box: a recognised failure (permissions, timeout, offline) gets a
 * sentence the owner can act on, a short plain message from the shop's server is kept, and anything else (provider
 * codes, stack text) becomes a generic "try again". The raw error goes to the browser console.
 */
export function friendlyError(err: unknown, what: string): string {
  console.error(`[Settings] couldn't ${what}`, err);
  const raw = String((err as any)?.message ?? (typeof err === "string" ? err : "")).trim();
  const reason = friendlyReason(err) || (isPlainMessage(raw) ? (/[.!?]$/.test(raw) ? raw : `${raw}.`) : "Something went wrong. Try again in a moment.");
  return `Couldn't ${what}. ${reason}`;
}
