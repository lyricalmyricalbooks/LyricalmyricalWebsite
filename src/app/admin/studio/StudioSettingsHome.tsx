import { Fragment, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Eye } from "lucide-react";

// Presentation-only pieces for Studio's friendlier Theme settings / Text & labels homes.
// They never edit the design themselves; StudioEditor passes the existing editors in as children.

export type HomeCategory = { id: string; title: string; blurb: string; changed?: number; onPage?: boolean };
export type HomeHeading = { id: string; title: string; blurb?: string; advanced?: boolean; band?: string; categories: HomeCategory[] };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function ChangedBadge({ count, label = "changed" }: { count?: number; label?: string }) {
  if (!count) return null;
  return <span className="studio-changed-badge"><span aria-hidden="true">● </span>{count} {label}</span>;
}

/** Category cards under task headings. Advanced headings stay folded until asked for. */
export function SettingsHome({ headings, onOpen, changedTotal, onOpenChanged, changedNoun = "setting", onShowOnPage }: {
  headings: HomeHeading[]; onOpen: (id: string) => void;
  changedTotal?: number; onOpenChanged?: () => void; changedNoun?: string;
  /** "Show on page": open the page where this category's part appears and select it. */
  onShowOnPage?: (id: string) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState<Record<string, boolean>>({});
  return (
    <div className="studio-settings-home">
      {Boolean(changedTotal) && onOpenChanged && (
        <button type="button" className="studio-changed-link" onClick={onOpenChanged}>
          <span><strong>What I've changed</strong><small>{plural(changedTotal!, changedNoun)} {changedTotal === 1 ? "differs" : "differ"} from the default, all in one list</small></span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      )}
      {headings.map((h) => {
        const open = !h.advanced || showAdvanced[h.id];
        const changed = h.categories.reduce((n, c) => n + (c.changed || 0), 0);
        return (
          <Fragment key={h.id}>
          {h.band && <h2 className="studio-settings-band">{h.band}</h2>}
          <section className="studio-settings-heading" aria-labelledby={`studio-heading-${h.id}`}>
            <div className="studio-settings-heading-title">
              {h.title ? <h3 id={`studio-heading-${h.id}`}>{h.title}</h3> : <span id={`studio-heading-${h.id}`} className="rp-sr-only">{h.band}</span>}
              {h.advanced && <ChangedBadge count={changed} />}
            </div>
            {h.blurb && <p className="studio-hint">{h.blurb}</p>}
            {h.advanced && (
              <button type="button" className="studio-advanced-toggle" aria-expanded={Boolean(open)}
                onClick={() => setShowAdvanced((s) => ({ ...s, [h.id]: !s[h.id] }))}>
                {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                {open ? "Hide" : "Show"} {h.categories.length} advanced {h.categories.length === 1 ? "category" : "categories"}
              </button>
            )}
            {open && <div className="studio-category-cards">
              {h.categories.map((c) => (
                <div key={c.id} className="studio-category-item">
                  <button type="button" className="studio-category-card" onClick={() => onOpen(c.id)}>
                    <span className="studio-category-card-text"><strong>{c.title}</strong>{c.blurb && <small>{c.blurb}</small>}</span>
                    <span className="studio-category-card-side"><ChangedBadge count={c.changed} /><ChevronRight size={15} aria-hidden="true" /></span>
                  </button>
                  {c.onPage && onShowOnPage && <button type="button" className="studio-show-on-page" aria-label={`Show ${c.title} on the page`}
                    onClick={() => onShowOnPage(c.id)}><Eye size={13} aria-hidden="true" /> Show on page</button>}
                </div>
              ))}
            </div>}
          </section>
          </Fragment>
        );
      })}
    </div>
  );
}

/** Title strip at the top of an opened category. */
export function CategoryHeader({ title, blurb, backLabel, onBack, extra }: {
  title: string; blurb?: string; backLabel: string; onBack: () => void; extra?: ReactNode;
}) {
  return (
    <div className="studio-category-header">
      <button type="button" className="studio-back" onClick={onBack}><ArrowLeft size={14} aria-hidden="true" /> {backLabel}</button>
      <h3>{title}</h3>
      {blurb && <p className="studio-hint">{blurb}</p>}
      {extra}
    </div>
  );
}

/**
 * A short, collapsible list inside a category. Opens by default when asked, when it holds the field
 * Find anything is jumping to (`focusKey`), or when the owner opens it.
 */
export function SettingsSubsection({ title, count, changed, defaultOpen = false, keys, focusKey, children, noun = "setting" }: {
  title: string; count: number; changed?: number; defaultOpen?: boolean;
  keys: string[]; focusKey?: { key: string; nonce: number } | null; children: ReactNode;
  noun?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => { if (focusKey && keys.includes(focusKey.key)) setOpen(true); }, [focusKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!title) return <div className="studio-subsection-body">{children}</div>;
  return (
    <section className="studio-subsection">
      <button type="button" className="studio-subsection-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
        <span>{title}</span>
        <small>{plural(count, noun)}</small>
        <ChangedBadge count={changed} />
      </button>
      {open && <div className="studio-subsection-body">{children}</div>}
    </section>
  );
}

const TIPS_KEY = "studio-tips-dismissed";
const readDismissed = () => { try { return window.localStorage.getItem(TIPS_KEY) === "1"; } catch { return false; } };

/** Three-line orientation card. Dismissal is remembered in this browser only. */
export function StudioTips({ forceOpen = 0 }: { forceOpen?: number }) {
  const [hidden, setHidden] = useState(readDismissed);
  useEffect(() => { if (forceOpen) setHidden(false); }, [forceOpen]);
  if (hidden) return null;
  const dismiss = () => { setHidden(true); try { window.localStorage.setItem(TIPS_KEY, "1"); } catch { /* private mode */ } };
  return (
    <aside className="studio-tips" aria-label="How Studio works">
      <strong>How Studio works</strong>
      <ol>
        <li><b>Click anything in the preview</b> to open its settings. Double-click text to type over it.</li>
        <li><b>Theme settings</b> change the look of every page; <b>Page layout</b> adds and arranges sections.</li>
        <li><b>Save draft</b> keeps your work private. <b>Publish</b> puts it live. Press <kbd>Ctrl</kbd> <kbd>K</kbd> to find any setting.</li>
      </ol>
      <button type="button" className="studio-reset" onClick={dismiss}>Got it, hide these tips</button>
    </aside>
  );
}
