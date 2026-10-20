import type { ReactNode } from "react";
import { TabPanel, Tabs } from "./riso/components";
import { friendlyReason, isPlainMessage } from "./studio/friendlyError";

/**
 * Layout helpers for the long Settings pages (General, Payments): sub tabs, one per topic (a dot marks a topic with
 * unsaved edits), and a folded "How to set it up" box for step-by-step instructions. Every topic stays mounted, so one
 * Save bar still covers edits made on any sub tab. Jumps scroll and move focus without touching the address bar (the
 * admin's hash is its page route).
 */

export type SettingsTab = { id: string; title: string; unsaved?: boolean; count?: number };

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Scrolls to the element with this id and moves keyboard focus there. */
export function jumpTo(id: string) {
  const el = typeof document !== "undefined" ? document.getElementById(id) : null;
  if (!el) return;
  el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  el.focus({ preventScroll: true });
}

export function SettingsTabs({ tabs, value, onChange, label }: { tabs: SettingsTab[]; value: string; onChange: (id: string) => void; label: string }) {
  return <Tabs label={label} value={value} onChange={onChange}
    tabs={tabs.map((t) => ({ id: t.id, label: t.title, unsaved: t.unsaved, ...(t.count ? { count: t.count } : {}) }))} />;
}

/** One topic of a settings page: the sub tab's panel, a line saying what it covers, then its cards. */
export function SettingsGroup({ id, subcopy, active, children }: { id: string; subcopy?: string; active: boolean; children: ReactNode }) {
  return (
    <TabPanel tabId={id} active={active}>
      <div className="rp-stack" style={{ gap: "var(--rp-space-4)" }}>
        {subcopy && <p className="rp-page-desc" style={{ margin: 0 }}>{subcopy}</p>}
        {children}
      </div>
    </TabPanel>
  );
}

/** A card other parts of the page can jump to. */
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
