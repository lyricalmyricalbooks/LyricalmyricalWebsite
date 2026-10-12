import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Dialog } from "../riso/components";
import { KIND_LABEL, paletteGroups, pushRecent, type SearchEntry } from "./studioSearch";

const RECENT_KEY = "studio-find-recent";
const readRecent = (): string[] => {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(v) ? v.filter(x => typeof x === "string") : []; }
  catch { return []; }
};
const writeRecent = (list: string[]) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* storage blocked */ } };

/**
 * "Find anything" — one search box over every Style control, text label, page part, page, book,
 * section and action. Before typing it offers commands for the current selection, recent results
 * and shortcuts; ">" lists commands only.
 */
export function StudioSearch({ open, onClose, index, context = [], onPick }: {
  open: boolean; onClose: () => void; index: SearchEntry[]; context?: SearchEntry[]; onPick: (entry: SearchEntry, query: string) => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>(readRecent);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const groups = useMemo(() => paletteGroups(index, q, { context, recent }), [index, q, context, recent]);
  const results = useMemo(() => groups.flatMap(g => g.entries), [groups]);
  useEffect(() => { if (open) { setQ(""); setActive(0); setRecent(readRecent()); setTimeout(() => inputRef.current?.focus(), 30); } }, [open]);
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => { document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" }); }, [active, listId]);

  const pick = (entry?: SearchEntry) => {
    if (!entry) return;
    // Selection commands only make sense for the current selection, so they aren't remembered.
    if (entry.target.type !== "context") { const next = pushRecent(recent, entry.id); setRecent(next); writeRecent(next); }
    onClose(); onPick(entry, q);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => Math.min(results.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    // Enter during IME composition confirms the typed characters; it must not open a result.
    else if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); pick(results[active]); }
  };

  let n = -1;
  return (
    <Dialog open={open} onClose={onClose} title="Find anything" description="Type what you want to change — “price colour”, “footer words”, “phone”, “publish”. Start with > for commands only.">
      <div className="studio-find">
        <div className="studio-find-box">
          <Search size={16} aria-hidden />
          <input ref={inputRef} role="combobox" aria-expanded={results.length > 0} aria-controls={listId} aria-activedescendant={results.length ? `${listId}-${active}` : undefined}
            aria-label="Find a setting, text, page, section or action" autoComplete="off" spellCheck={false}
            placeholder="Search settings, words, pages, books, sections…  (> for commands)" value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKeyDown} />
        </div>
        <ul id={listId} role="listbox" aria-label="Results" className="studio-find-list">
          {groups.map(g => (
            <Fragment key={g.title}>
              {(groups.length > 1 || !q) && <li role="presentation" className="studio-find-group">{g.title}</li>}
              {g.entries.map(r => {
                const i = ++n;
                return (
                  <li key={`${g.title}:${r.id}`} id={`${listId}-${i}`} role="option" aria-selected={i === active} className="studio-find-row"
                    data-active={i === active || undefined} onMouseEnter={() => setActive(i)} onClick={() => pick(r)}>
                    <span className="studio-find-kind" data-kind={r.kind}>{KIND_LABEL[r.kind]}</span>
                    <span className="studio-find-main"><strong>{r.title}</strong><small>{r.where}</small></span>
                    {r.keys && <kbd className="studio-find-keys">{r.keys}</kbd>}
                  </li>
                );
              })}
            </Fragment>
          ))}
        </ul>
        {q && !results.length && <p className="studio-empty">Nothing matches “{q}”. Try a simpler word, like “color”, “font”, “button” or “footer”.</p>}
        <p className="studio-hint" aria-hidden="true">↑ ↓ to move · Enter to open · Esc to close · &gt; for commands</p>
      </div>
    </Dialog>
  );
}
