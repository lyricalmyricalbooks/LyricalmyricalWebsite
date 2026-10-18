import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight, GripVertical, Maximize2, Plus } from "lucide-react";
import {
  ActionMenu, CardInWidget, Checkbox, Dialog, EmptyState, GhostButton, IconButton, PrimaryButton, SearchField, SecondaryButton,
  SelectField, StatusBadge, TextField, useConfirm, usePrompt, useRisoToast, type MenuAction,
} from "./riso/components";
import {
  BANDS, FIGURES, HEIGHTS, MAX_BOARDS, SIZES, TEMPLATES, WIDGETS, activeBoard, addBoard, addWidget, collapseBandWidgets, collapseEverything,
  copyBoard, countOf, defaultStore, deleteBoard, duplicateWidget, findWidget, makeWidget, moveBand, moveWidget, moveWidgetTo, removeWidget,
  renameBoard, renameWidget, replaceBoard, resetBoard, restoreWidget, revealWidget, searchCatalog, selectBoard, setWidgetConfig, updateBand, updateWidget, visibleBands,
  widgetMeta, widgetTitle, canAdd,
  type BandId, type Board, type BoardStore, type BoardWidget, type FigureId, type TemplateId, type WidgetConfig, type WidgetType,
} from "./overviewBoard";
import { readLocalBoards, readRemoteBoards, writeLocalBoards, writeRemoteBoards } from "./overviewBoardStore";

export type SaveState = "loading" | "saving" | "saved" | "local" | "error";
export type RenderWidget = (w: BoardWidget, opts: { full: boolean; setConfig: (patch: WidgetConfig) => void }) => ReactNode;

/**
 * The boards, kept in this browser at once and in the owner's account a moment later. The account copy is read
 * once on open and replaces this browser's copy only when it is newer and nothing was changed here yet.
 */
export function useBoardStore() {
  const [store, setState] = useState<BoardStore>(() => readLocalBoards() || defaultStore(0));
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [saveError, setSaveError] = useState("");
  const latest = useRef(store);
  // The copy this browser started from: an account copy newer than it wins, even over a change made while it loaded.
  const startedAt = useRef(store.updatedAt);
  const readDone = useRef(false);
  const pending = useRef(false);
  const timer = useRef<number | null>(null);

  const upload = useCallback(() => {
    timer.current = null;
    pending.current = false;
    setSaveState("saving");
    writeRemoteBoards(latest.current).then(() => { if (!pending.current) setSaveState("saved"); setSaveError(""); })
      .catch((err: any) => { setSaveState("error"); setSaveError(err?.message || "Couldn't save to your account."); });
  }, []);
  const schedule = useCallback(() => {
    pending.current = true;
    setSaveState("saving");
    // Nothing goes up before the account copy has been read, so an old browser copy never overwrites a newer one.
    if (!readDone.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(upload, 1200);
  }, [upload]);

  useEffect(() => {
    let live = true;
    readRemoteBoards().then(remote => {
      if (!live) return;
      readDone.current = true;
      if (remote && remote.updatedAt > startedAt.current) {
        // Newer on the account (another device): take it. A change made in the moment before it arrived is dropped.
        pending.current = false;
        latest.current = remote; setState(remote); writeLocalBoards(remote);
        setSaveState("saved");
      } else if (pending.current || (latest.current.updatedAt > 0 && (!remote || latest.current.updatedAt > remote.updatedAt))) {
        // This browser holds changes the account hasn't got (edited just now, or a save that never went up last time).
        schedule();
      } else setSaveState("saved");
    }).catch(() => { if (live) { readDone.current = true; setSaveState("local"); } });
    return () => { live = false; };
  }, [schedule]);

  const setStore = useCallback((next: BoardStore) => {
    latest.current = next;
    setState(next);
    writeLocalBoards(next);
    schedule();
  }, [schedule]);
  // Leaving the Overview, or closing the tab, with a save still waiting sends it straight away. If that fails, the
  // browser copy is newer than the account's next time, and the read above sends it up then.
  useEffect(() => {
    const flush = () => {
      if (!timer.current) return;
      window.clearTimeout(timer.current); timer.current = null;
      writeRemoteBoards(latest.current).catch(() => {});
    };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, []);
  return { store, setStore, saveState, saveError, retrySave: upload };
}

type Focus = { kind: "widget"; id: string } | { kind: "type"; type: WidgetType } | { kind: "band"; band: BandId } | null;
const bandMeta = (id: BandId) => BANDS.find(b => b.id === id)!;
const SAVE_WORDS: Record<SaveState, string> = {
  loading: "Opening your boards…", saving: "Saving…", saved: "✓ Saved to your account", local: "Saved on this browser only", error: "! Not saved to your account",
};

export function OverviewBoard({ store, setStore, saveState, saveError, onRetrySave, renderWidget, header }: {
  store: BoardStore; setStore: (s: BoardStore) => void; saveState: SaveState; saveError: string; onRetrySave: () => void;
  renderWidget: RenderWidget; header: ReactNode;
}) {
  const board = activeBoard(store);
  const say = useRisoToast();
  const [confirm, confirmNode] = useConfirm();
  const [prompt, promptNode] = usePrompt();
  const [editing, setEditing] = useState(false);
  const [past, setPast] = useState<BoardStore[]>([]);
  const [future, setFuture] = useState<BoardStore[]>([]);
  const [tray, setTray] = useState<{ open: boolean; band: BandId | "all" }>({ open: false, band: "all" });
  const [focus, setFocus] = useState<Focus>(null);
  const [figuresFor, setFiguresFor] = useState<string | null>(null);
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [drag, setDragState] = useState<{ id: string; over: string | null } | null>(null);
  // Drag handlers read the ref: the first dragover can fire before React has re-rendered with the new state.
  const dragRef = useRef<{ id: string; over: string | null } | null>(null);
  const setDrag = (d: { id: string; over: string | null } | null) => { dragRef.current = d; setDragState(d); };
  const [tempConfig, setTempConfig] = useState<Record<string, WidgetConfig>>({});
  const scrollBack = useRef(0);

  // Every change goes through here, so Undo/Redo cover it.
  const commitStore = useCallback((next: BoardStore) => {
    if (next === store) return;
    setPast(p => [...p.slice(-39), store]);
    setFuture([]);
    setStore(next);
  }, [store, setStore]);
  const commit = useCallback((fn: (b: Board) => Board) => {
    const next = fn(board);
    if (next !== board) commitStore(replaceBoard(store, next));
  }, [board, store, commitStore]);
  const undo = useCallback(() => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setPast(p => p.slice(0, -1)); setFuture(f => [store, ...f]);
    setStore({ ...prev, updatedAt: Date.now() });
  }, [past, store, setStore]);
  const redo = useCallback(() => {
    const next = future[0];
    if (!next) return;
    setFuture(f => f.slice(1)); setPast(p => [...p, store]);
    setStore({ ...next, updatedAt: Date.now() });
  }, [future, store, setStore]);

  // A toast's action runs later, so it reaches the board as it is then, not as it was when the toast was made.
  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName || "");
      if (e.key === "Escape" && focus) { e.preventDefault(); closeFocus(); return; }
      if (typing || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" || (!editing && !past.length)) return;
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!flash) return;
    const el = document.getElementById(`wb-${flash}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = window.setTimeout(() => setFlash(null), 1800);
    return () => window.clearTimeout(t);
  }, [flash]);

  const openFocus = (f: Exclude<Focus, null>) => { if (!focus) scrollBack.current = window.scrollY; setFocus(f); window.scrollTo({ top: 0 }); };
  function closeFocus() { setFocus(null); requestAnimationFrame(() => window.scrollTo({ top: scrollBack.current })); }

  const add = (type: WidgetType, config?: WidgetConfig) => {
    const { board: next, id } = addWidget(board, type, config);
    if (!id) {
      // Already on the board (a single-copy widget): open its topic and unfold it so "Show it" really shows it.
      const existing = board.bands.flatMap(b => b.widgets).find(w => w.type === type);
      if (existing) { commit(b => revealWidget(b, existing.id)); setFlash(existing.id); }
      return;
    }
    commit(() => next);
    setFlash(id);
  };
  const remove = (w: BoardWidget) => {
    const index = findWidget(board, w.id)?.band.widgets.findIndex(x => x.id === w.id) ?? 0;
    commit(b => removeWidget(b, w.id));
    // This Undo brings back this widget only, whatever was changed after it.
    say(`Removed “${widgetTitle(w)}” from the board`, { actionLabel: "Undo", onAction: () => commitRef.current(b => restoreWidget(b, w, index)) });
  };
  const rename = async (w: BoardWidget) => {
    const name = await prompt({ title: "Rename this widget", label: "Name (leave empty for the usual name)", defaultValue: w.title || "", confirmLabel: "Rename" });
    if (name !== null) commit(b => renameWidget(b, w.id, name));
  };
  const renameThisBoard = async () => {
    const name = await prompt({ title: "Rename this board", label: "Board name", defaultValue: board.name, confirmLabel: "Rename" });
    if (name && name.trim()) commitStore(renameBoard(store, board.id, name));
  };
  const deleteThisBoard = async () => {
    if (!(await confirm({ title: `Delete “${board.name}”?`, message: "Only this layout is deleted. Your orders, figures and other boards are not touched.", confirmLabel: "Delete board" }))) return;
    commitStore(deleteBoard(store, board.id));
  };
  const resetThisBoard = async () => {
    const t = TEMPLATES.find(x => x.id === board.template)!;
    if (!(await confirm({ title: `Put “${board.name}” back to the ${t.name} layout?`, message: "Widgets you added, moved, resized or renamed on this board go back to how the layout starts. You can press Undo straight after.", confirmLabel: "Reset layout" }))) return;
    commitStore(resetBoard(store, board.id));
  };

  const allFolded = board.bands.every(b => b.collapsed || b.widgets.every(w => w.collapsed));
  const bands = visibleBands(board, editing);
  const hiddenBands = board.bands.filter(b => b.hidden);
  const widgetCount = board.bands.reduce((n, b) => n + b.widgets.length, 0);

  const sizeButtons = (w: BoardWidget) => (
    <span className="rp-wb-sizes" role="group" aria-label={`Size of ${widgetTitle(w)}`}>
      {SIZES.map(s => (
        <button key={s.id} type="button" aria-pressed={w.size === s.id} title={s.name} aria-label={s.name} onClick={() => commit(b => updateWidget(b, w.id, { size: s.id }))}>{s.label}</button>
      ))}
    </span>
  );

  const menuFor = (w: BoardWidget, index: number, total: number): MenuAction[] => {
    const meta = widgetMeta(w.type);
    const list: MenuAction[] = [
      { label: "Open full view", onSelect: () => openFocus({ kind: "widget", id: w.id }) },
      { label: w.collapsed ? "Unfold" : "Fold to its title", onSelect: () => commit(b => updateWidget(b, w.id, { collapsed: !w.collapsed })) },
      { label: "Rename…", onSelect: () => rename(w) },
    ];
    if (w.type === "figures") list.push({ label: "Choose figures…", onSelect: () => setFiguresFor(w.id) });
    SIZES.filter(s => s.id !== w.size).forEach(s => list.push({ label: `Size: ${s.name}`, onSelect: () => commit(b => updateWidget(b, w.id, { size: s.id })) }));
    HEIGHTS.filter(h => h.id !== w.height).forEach(h => list.push({ label: `Height: ${h.label}`, onSelect: () => commit(b => updateWidget(b, w.id, { height: h.id })) }));
    if (meta.multi) list.push({ label: "Duplicate", onSelect: () => { const r = duplicateWidget(board, w.id); if (r.id) { commit(() => r.board); setFlash(r.id); } } });
    if (index > 0) list.push({ label: "Move earlier", onSelect: () => commit(b => moveWidget(b, w.id, -1)) });
    if (index < total - 1) list.push({ label: "Move later", onSelect: () => commit(b => moveWidget(b, w.id, 1)) });
    list.push({ label: "Remove from board", tone: "danger", onSelect: () => remove(w) });
    return list;
  };

  /** One widget: its bar (title, fold, full view, menu; in edit mode grip, move and size) and its content. */
  const frame = (w: BoardWidget, opts: { index: number; total: number; explore?: boolean }) => {
    const title = widgetTitle(w);
    const meta = widgetMeta(w.type);
    const onBoard = !opts.explore || !!findWidget(board, w.id);
    const live = onBoard && !opts.explore;
    const setConfig = (patch: WidgetConfig) => (live || findWidget(board, w.id) ? commit(b => setWidgetConfig(b, w.id, patch)) : setTempConfig(c => ({ ...c, [w.id]: { ...(c[w.id] || w.config || {}), ...patch } })));
    const shown = !live && tempConfig[w.id] ? { ...w, config: tempConfig[w.id] } : w;
    const folded = live && !!w.collapsed;
    const bodyId = `wb-body-${w.id}`;
    const isDragging = drag?.id === w.id;
    const dropHere = drag && drag.over === w.id && drag.id !== w.id;
    return (
      <article key={w.id} id={`wb-${w.id}`} className="rp-wb-widget" data-size={w.size} data-height={w.height} data-folded={folded || undefined}
        data-flash={flash === w.id || undefined} data-dragging={isDragging || undefined} data-drop={dropHere || undefined} aria-label={title}
        onDragOver={e => { const d = dragRef.current; if (!d || d.id === w.id || findWidget(board, d.id)?.band.id !== meta.band) return; e.preventDefault(); if (d.over !== w.id) setDrag({ ...d, over: w.id }); }}
        onDrop={e => { const d = dragRef.current; if (!d) return; e.preventDefault(); commit(b => moveWidgetTo(b, d.id, w.id)); setDrag(null); }}>
        <header className="rp-wb-bar">
          {editing && live && (
            <span className="rp-wb-grip" title="Drag to move within this topic" aria-hidden="true" draggable
              onDragStart={e => {
                e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", w.id);
                const card = e.currentTarget.closest("article");
                if (card) e.dataTransfer.setDragImage(card, 24, 20);
                setDrag({ id: w.id, over: null });
              }}
              onDragEnd={() => setDrag(null)}><GripVertical size={16} /></span>
          )}
          {live && (
            <button type="button" className="rp-wb-fold" aria-expanded={!folded} aria-controls={bodyId} aria-label={`${folded ? "Unfold" : "Fold"} ${title}`}
              onClick={() => commit(b => updateWidget(b, w.id, { collapsed: !folded }))}>
              <ChevronRight size={16} aria-hidden style={{ transform: folded ? "none" : "rotate(90deg)" }} />
            </button>
          )}
          <h3 className="rp-wb-title">
            <button type="button" onClick={() => openFocus(live ? { kind: "widget", id: w.id } : { kind: "type", type: w.type })} title="Open full view">{title}</button>
          </h3>
          {meta.google && <span className="rp-wb-tag" title="Needs Google Analytics">GA</span>}
          <span className="rp-wb-tools">
            {editing && live && (
              <>
                <IconButton label={`Move ${title} earlier`} disabled={opts.index === 0} onClick={() => commit(b => moveWidget(b, w.id, -1))}><span aria-hidden="true">←</span></IconButton>
                <IconButton label={`Move ${title} later`} disabled={opts.index >= opts.total - 1} onClick={() => commit(b => moveWidget(b, w.id, 1))}><span aria-hidden="true">→</span></IconButton>
                {sizeButtons(w)}
              </>
            )}
            {!live && (!onBoard && canAdd(board, w.type)
              ? <SecondaryButton size="sm" onClick={() => add(w.type, tempConfig[w.id] || w.config)}><Plus size={14} aria-hidden /> Add to board</SecondaryButton>
              : <StatusBadge tone="success">On your board</StatusBadge>)}
            {!opts.explore && <IconButton label={`Open ${title} full view`} onClick={() => openFocus({ kind: "widget", id: w.id })}><Maximize2 size={15} aria-hidden /></IconButton>}
            {opts.explore && <IconButton label={`Open ${title} full view`} onClick={() => openFocus(onBoard && findWidget(board, w.id) ? { kind: "widget", id: w.id } : { kind: "type", type: w.type })}><Maximize2 size={15} aria-hidden /></IconButton>}
            {live && <ActionMenu label={`More for ${title}`} actions={menuFor(w, opts.index, opts.total)} />}
          </span>
        </header>
        {!folded && (
          <div id={bodyId} className="rp-wb-body">
            <CardInWidget.Provider value={true}>{renderWidget(shown, { full: false, setConfig })}</CardInWidget.Provider>
          </div>
        )}
      </article>
    );
  };

  // ── Full view: one widget at full size, then everything else on the same topic ──
  if (focus) {
    const fromBoard = focus.kind === "widget" ? findWidget(board, focus.id) : null;
    if (focus.kind === "widget" && !fromBoard) { setTimeout(() => setFocus(null)); return null; }
    const band: BandId = focus.kind === "band" ? focus.band : focus.kind === "widget" ? fromBoard!.band.id : widgetMeta(focus.type).band;
    const main: BoardWidget | null = focus.kind === "widget" ? fromBoard!.widget : focus.kind === "type" ? { ...makeWidget(focus.type), id: `explore-${focus.type}` } : null;
    const mainConfig = main && (focus.kind === "type" ? tempConfig[main.id] || main.config : main.config);
    const setMainConfig = (patch: WidgetConfig) => {
      if (!main) return;
      if (focus.kind === "widget") commit(b => setWidgetConfig(b, main.id, patch));
      else setTempConfig(c => ({ ...c, [main.id]: { ...(c[main.id] || main.config || {}), ...patch } }));
    };
    const others = WIDGETS.filter(m => m.band === band && m.type !== main?.type).map(m => {
      const onBoardCopy = board.bands.flatMap(b => b.widgets).find(w => w.type === m.type);
      return onBoardCopy || { ...makeWidget(m.type), id: `explore-${m.type}` };
    });
    const meta = bandMeta(band);
    return (
      <div className="rp-stack rp-ov rp-wb" data-density={board.density}>
        {header}
        <nav className="rp-wb-crumbs" aria-label="Where you are">
          <GhostButton size="sm" onClick={closeFocus}>← Back to “{board.name}”</GhostButton>
          <span aria-hidden="true">›</span>
          {main ? <button type="button" className="rp-wb-crumb" onClick={() => openFocus({ kind: "band", band })}>{meta.title}</button> : <span>{meta.title}</span>}
          {main && <><span aria-hidden="true">›</span><span aria-current="page">{widgetTitle(main)}</span></>}
          <span className="rp-hint" style={{ marginLeft: "auto" }}>Esc goes back</span>
        </nav>
        {main && (
          <section className="rp-wb-full" aria-labelledby="wb-full-title">
            <div className="rp-wb-full-head">
              <div>
                <div className="rp-ov-eyebrow">{meta.title} · full view</div>
                <h2 id="wb-full-title" className="rp-wb-full-title">{widgetTitle(main)}</h2>
                <p className="rp-hint" style={{ margin: "4px 0 0" }}>{widgetMeta(main.type).blurb}</p>
              </div>
              <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {focus.kind === "type" && (canAdd(board, main.type)
                  ? <PrimaryButton size="sm" onClick={() => add(main.type, mainConfig || undefined)}><Plus size={14} aria-hidden /> Add to board</PrimaryButton>
                  : <StatusBadge tone="success">On your board</StatusBadge>)}
                {focus.kind === "widget" && main.type === "figures" && <SecondaryButton size="sm" onClick={() => setFiguresFor(main.id)}>Choose figures…</SecondaryButton>}
              </span>
            </div>
            <div className="rp-wb-full-body">
              <CardInWidget.Provider value={true}>{renderWidget({ ...main, ...(mainConfig ? { config: mainConfig } : {}) }, { full: true, setConfig: setMainConfig })}</CardInWidget.Provider>
            </div>
          </section>
        )}
        <section className="rp-wb-band" aria-labelledby="wb-more-title">
          <div className="rp-wb-band-head">
            <div style={{ minWidth: 0 }}>
              <h2 id="wb-more-title" className="rp-wb-band-title">{main ? `More about ${meta.title.toLowerCase()}` : `Everything about ${meta.title.toLowerCase()}`}</h2>
              <p className="rp-wb-band-blurb">{meta.blurb}. Widgets already on your board say so; add any other with one click.</p>
            </div>
          </div>
          <div className="rp-wb-grid">{(main ? others : [...others]).map((w, i, a) => frame(w, { index: i, total: a.length, explore: true }))}</div>
        </section>
        {figuresFor && <FiguresDialog board={board} widgetId={figuresFor} onClose={() => setFiguresFor(null)} onSave={figs => commit(b => setWidgetConfig(b, figuresFor, { figures: figs }))} />}
        {confirmNode}{promptNode}
      </div>
    );
  }

  return (
    <div className="rp-stack rp-ov rp-wb" data-density={board.density} data-editing={editing || undefined}>
      {header}

      {/* The board's own toolbar: which board, how dense, fold everything, add widgets, edit */}
      <div className="rp-wb-toolbar" role="toolbar" aria-label="Board">
        <div className="rp-wb-toolbar-row">
          <div className="rp-wb-boardpick">
            <SelectField label="Board" value={board.id} onChange={e => {
              if (e.target.value === "__new") setNewBoardOpen(true);
              else commitStore(selectBoard(store, e.target.value));
            }}>
              {store.boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              {store.boards.length < MAX_BOARDS && <option value="__new">+ New board…</option>}
            </SelectField>
            <ActionMenu label="Board actions" actions={[
              { label: "Rename this board…", onSelect: renameThisBoard },
              ...(store.boards.length < MAX_BOARDS ? [
                { label: "Copy this board", onSelect: () => commitStore(copyBoard(store)) },
                { label: "New board…", onSelect: () => setNewBoardOpen(true) },
              ] : []),
              { label: `Reset to the ${TEMPLATES.find(t => t.id === board.template)?.name} layout…`, onSelect: resetThisBoard },
              ...(store.boards.length > 1 ? [{ label: "Delete this board…", tone: "danger" as const, onSelect: deleteThisBoard }] : []),
            ]} />
          </div>
          <div className="rp-wb-toolbar-actions">
            <span className="rp-ov-switch" role="group" aria-label="Density">
              {(["comfortable", "compact"] as const).map(d => (
                <button key={d} type="button" aria-pressed={board.density === d} onClick={() => commit(b => ({ ...b, density: d }))}>{d === "comfortable" ? "Comfortable" : "Compact"}</button>
              ))}
            </span>
            <SecondaryButton size="sm" onClick={() => commit(b => collapseEverything(b, !allFolded))}>{allFolded ? "Unfold everything" : "Fold everything"}</SecondaryButton>
            <SecondaryButton size="sm" onClick={() => setTray({ open: true, band: "all" })}><Plus size={14} aria-hidden /> Add widgets</SecondaryButton>
            {editing
              ? <PrimaryButton size="sm" onClick={() => setEditing(false)}>Done editing</PrimaryButton>
              : <SecondaryButton size="sm" onClick={() => setEditing(true)}>Edit board</SecondaryButton>}
          </div>
        </div>
        <div className="rp-wb-toolbar-row">
          <nav className="rp-wb-jump" aria-label="Jump to a topic">
            {bands.filter(b => b.widgets.length > 0).map(b => (
              <a key={b.id} href={`#wb-band-${b.id}`} onClick={e => {
                e.preventDefault();
                if (b.collapsed) commit(x => updateBand(x, b.id, { collapsed: false }));
                document.getElementById(`wb-band-${b.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}>{bandMeta(b.id).title}<span className="rp-mono"> {b.widgets.length}</span></a>
            ))}
          </nav>
          <span className="rp-wb-save" role="status" aria-live="polite" data-state={saveState} title={saveState === "error" ? saveError : saveState === "local" ? "Your account copy couldn't be reached; this browser keeps your layout." : undefined}>
            {SAVE_WORDS[saveState]}
            {saveState === "error" && <button type="button" className="rp-wb-link" onClick={onRetrySave}>Try again</button>}
          </span>
          {(past.length > 0 || future.length > 0) && (
            <span style={{ display: "flex", gap: 6 }}>
              <GhostButton size="sm" onClick={undo} disabled={!past.length} aria-keyshortcuts="Control+Z">Undo</GhostButton>
              <GhostButton size="sm" onClick={redo} disabled={!future.length} aria-keyshortcuts="Control+Shift+Z">Redo</GhostButton>
            </span>
          )}
        </div>
        {editing && (
          <p className="rp-wb-edit-hint">
            Editing <strong>{board.name}</strong>: drag a widget by its grip (or use ← →) to move it within its topic, pick S · M · L · XL to resize, and use ⋯ to rename, change height, duplicate or remove.
            Topics move with ↑ ↓. Changes save by themselves; Ctrl/⌘+Z undoes.
          </p>
        )}
      </div>

      {widgetCount === 0 && (
        <EmptyState title="This board is empty" description="Add the figures and lists you want to watch. They sit under their own topic, so the board stays tidy."
          action={<PrimaryButton onClick={() => setTray({ open: true, band: "all" })}>Add widgets</PrimaryButton>} />
      )}

      {bands.map((band, bi) => {
        const meta = bandMeta(band.id);
        const folded = !!band.collapsed;
        const allWidgetsFolded = band.widgets.length > 0 && band.widgets.every(w => w.collapsed);
        return (
          <section key={band.id} id={`wb-band-${band.id}`} className="rp-wb-band" data-band={band.id} data-folded={folded || undefined} aria-labelledby={`wb-band-title-${band.id}`}>
            <div className="rp-wb-band-head">
              <button type="button" className="rp-wb-fold" aria-expanded={!folded} aria-controls={`wb-band-body-${band.id}`} aria-label={`${folded ? "Unfold" : "Fold"} ${meta.title}`}
                onClick={() => commit(b => updateBand(b, band.id, { collapsed: !folded }))}>
                <ChevronRight size={20} aria-hidden style={{ transform: folded ? "none" : "rotate(90deg)" }} />
              </button>
              <div style={{ minWidth: 0, flex: "1 1 240px" }}>
                <h2 id={`wb-band-title-${band.id}`} className="rp-wb-band-title">
                  <button type="button" onClick={() => commit(b => updateBand(b, band.id, { collapsed: !folded }))}>{meta.title}</button>
                  <span className="rp-wb-band-count">{band.widgets.length}</span>
                </h2>
                {!folded && <p className="rp-wb-band-blurb">{meta.blurb}</p>}
              </div>
              <span className="rp-wb-band-actions">
                {!folded && band.widgets.length > 1 && (
                  <GhostButton size="sm" onClick={() => commit(b => collapseBandWidgets(b, band.id, !allWidgetsFolded))}>{allWidgetsFolded ? "Unfold widgets" : "Fold widgets"}</GhostButton>
                )}
                <SecondaryButton size="sm" onClick={() => openFocus({ kind: "band", band: band.id })}>Explore all {WIDGETS.filter(w => w.band === band.id).length}</SecondaryButton>
                {editing && (
                  <>
                    <IconButton label={`Move ${meta.title} up`} disabled={bi === 0} onClick={() => commit(b => moveBand(b, band.id, -1))}><span aria-hidden="true">↑</span></IconButton>
                    <IconButton label={`Move ${meta.title} down`} disabled={bi === bands.length - 1} onClick={() => commit(b => moveBand(b, band.id, 1))}><span aria-hidden="true">↓</span></IconButton>
                    <SecondaryButton size="sm" onClick={() => setTray({ open: true, band: band.id })}><Plus size={14} aria-hidden /> Add</SecondaryButton>
                    <GhostButton size="sm" onClick={() => commit(b => updateBand(b, band.id, { hidden: true }))}>Hide topic</GhostButton>
                  </>
                )}
              </span>
            </div>
            {!folded && (
              <div id={`wb-band-body-${band.id}`} className="rp-wb-grid">
                {band.widgets.map((w, i) => frame(w, { index: i, total: band.widgets.length }))}
                {editing && (
                  <button type="button" className="rp-wb-dropzone" data-drop={drag && drag.over === `end-${band.id}` || undefined}
                    onDragOver={e => { const d = dragRef.current; if (!d || findWidget(board, d.id)?.band.id !== band.id) return; e.preventDefault(); if (d.over !== `end-${band.id}`) setDrag({ ...d, over: `end-${band.id}` }); }}
                    onDrop={e => { const d = dragRef.current; if (!d) return; e.preventDefault(); commit(b => moveWidgetTo(b, d.id, null)); setDrag(null); }}
                    onClick={() => setTray({ open: true, band: band.id })}>
                    {drag ? "Drop here to put it last" : band.widgets.length === 0 ? `Nothing in ${meta.title} yet — add a widget` : `+ Add to ${meta.title}`}
                  </button>
                )}
              </div>
            )}
          </section>
        );
      })}

      {editing && hiddenBands.length > 0 && (
        <p className="rp-wb-edit-hint">
          Hidden topics:{" "}
          {hiddenBands.map((b, i) => (
            <Fragment key={b.id}>{i > 0 && " · "}<button type="button" className="rp-wb-link" onClick={() => commit(x => updateBand(x, b.id, { hidden: false }))}>Show {bandMeta(b.id).title}</button></Fragment>
          ))}
        </p>
      )}

      <AddWidgetTray open={tray.open} band={tray.band} board={board} onBand={band => setTray(t => ({ ...t, band }))}
        onClose={() => setTray(t => ({ ...t, open: false }))} onAdd={add}
        onPreview={type => { setTray(t => ({ ...t, open: false })); openFocus({ kind: "type", type }); }} />
      <NewBoardDialog open={newBoardOpen} onClose={() => setNewBoardOpen(false)} canCopy={store.boards.length < MAX_BOARDS}
        onCreate={(template, name) => { commitStore(template === "copy" ? copyBoard(store, name) : addBoard(store, template, name)); setNewBoardOpen(false); }} />
      {figuresFor && <FiguresDialog board={board} widgetId={figuresFor} onClose={() => setFiguresFor(null)} onSave={figs => commit(b => setWidgetConfig(b, figuresFor, { figures: figs }))} />}
      {confirmNode}{promptNode}
    </div>
  );
}

/** "Add widgets": every widget there is, by topic, with a search box. Adding keeps the tray open for the next one. */
function AddWidgetTray({ open, band, board, onBand, onClose, onAdd, onPreview }: {
  open: boolean; band: BandId | "all"; board: Board; onBand: (b: BandId | "all") => void; onClose: () => void;
  onAdd: (type: WidgetType) => void; onPreview: (type: WidgetType) => void;
}) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => searchCatalog(query).filter(g => band === "all" || g.band.id === band), [query, band]);
  const total = groups.reduce((n, g) => n + g.widgets.length, 0);
  return (
    <Dialog open={open} onClose={onClose} variant="drawer" title="Add widgets" description={`${WIDGETS.length} widgets in ${BANDS.length} topics. Each joins its own topic on the board.`}
      footer={<PrimaryButton onClick={onClose}>Done</PrimaryButton>}>
      <div className="rp-stack" style={{ gap: 12 }}>
        <SearchField label="Find a widget" placeholder="Try “refunds”, “Google”, “reprint”…" value={query} onChange={e => setQuery(e.target.value)} />
        <div className="rp-wb-chips" role="group" aria-label="Topic">
          <button type="button" aria-pressed={band === "all"} onClick={() => onBand("all")}>All</button>
          {BANDS.map(b => <button key={b.id} type="button" aria-pressed={band === b.id} onClick={() => onBand(b.id)}>{b.title}</button>)}
        </div>
        <p className="rp-hint" role="status" aria-live="polite" style={{ margin: 0 }}>{total} widget{total === 1 ? "" : "s"}</p>
        {groups.length === 0 && <EmptyState title="No widget matches" description="Try another word, or pick All topics." />}
        {groups.map(g => (
          <section key={g.band.id} aria-label={g.band.title}>
            <h3 className="rp-wb-tray-head">{g.band.title}</h3>
            <ul className="rp-wb-tray">
              {g.widgets.map(m => {
                const n = countOf(board, m.type);
                const can = canAdd(board, m.type);
                return (
                  <li key={m.type}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{m.title}</div>
                      <div className="rp-hint">{m.blurb}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                        {n > 0 && <StatusBadge tone="success">On board{n > 1 ? ` ×${n}` : ""}</StatusBadge>}
                        {m.multi && <StatusBadge tone="info">Add as many as you like</StatusBadge>}
                        {m.google && <StatusBadge tone="neutral">Google Analytics</StatusBadge>}
                      </div>
                    </div>
                    <span style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "stretch" }}>
                      <SecondaryButton size="sm" onClick={() => { onAdd(m.type); if (!can) onClose(); }} aria-label={`${can ? "Add" : "Show"} ${m.title}`}>{can ? "Add" : "Show it"}</SecondaryButton>
                      <GhostButton size="sm" onClick={() => onPreview(m.type)} aria-label={`Preview ${m.title}`}>Preview</GhostButton>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

function NewBoardDialog({ open, onClose, onCreate, canCopy }: {
  open: boolean; onClose: () => void; canCopy: boolean; onCreate: (template: TemplateId | "copy", name: string) => void;
}) {
  const [template, setTemplate] = useState<TemplateId | "copy">("everything");
  const [name, setName] = useState("");
  useEffect(() => { if (open) { setTemplate("everything"); setName(""); } }, [open]);
  const chosen = TEMPLATES.find(t => t.id === template);
  return (
    <Dialog open={open} onClose={onClose} title="New board" description="Boards are separate layouts of the same figures — one for the morning, one for money, one for a launch."
      footer={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton><PrimaryButton disabled={!canCopy} onClick={() => onCreate(template, name.trim() || (template === "copy" ? "" : chosen?.name || "My board"))}>Create board</PrimaryButton></>}>
      <div className="rp-stack" style={{ gap: 12 }}>
        <fieldset className="rp-wb-templates">
          <legend className="rp-label">Start from</legend>
          {TEMPLATES.map(t => (
            <label key={t.id}>
              <input type="radio" name="wb-template" checked={template === t.id} onChange={() => setTemplate(t.id)} />
              <span><strong>{t.name}</strong><span className="rp-hint" style={{ display: "block" }}>{t.blurb} · {t.widgets.length} widgets</span></span>
            </label>
          ))}
          <label>
            <input type="radio" name="wb-template" checked={template === "copy"} onChange={() => setTemplate("copy")} />
            <span><strong>A copy of the board on screen</strong><span className="rp-hint" style={{ display: "block" }}>Same widgets, sizes and settings, to change without touching the original</span></span>
          </label>
        </fieldset>
        <TextField label="Name" placeholder={template === "copy" ? "e.g. Launch of The Hound" : chosen?.name} value={name} maxLength={40} onChange={e => setName(e.target.value)} />
      </div>
    </Dialog>
  );
}

function FiguresDialog({ board, widgetId, onClose, onSave }: { board: Board; widgetId: string; onClose: () => void; onSave: (figs: FigureId[]) => void }) {
  const w = findWidget(board, widgetId)?.widget;
  const [picked, setPicked] = useState<FigureId[]>(() => (w?.config?.figures || []) as FigureId[]);
  if (!w) return null;
  const toggle = (id: FigureId, on: boolean) => setPicked(p => (on ? FIGURES.map(f => f.id).filter(x => x === id || p.includes(x)) : p.filter(x => x !== id)));
  return (
    <Dialog open onClose={onClose} title="Choose figures" description={`Which numbers “${widgetTitle(w)}” shows, each against the period before.`}
      footer={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton><PrimaryButton disabled={picked.length === 0} onClick={() => { onSave(picked); onClose(); }}>Show {picked.length} figure{picked.length === 1 ? "" : "s"}</PrimaryButton></>}>
      <div className="rp-wb-figpick">
        {FIGURES.map(f => <Checkbox key={f.id} label={f.label} checked={picked.includes(f.id)} onChange={e => toggle(f.id, e.target.checked)} />)}
      </div>
    </Dialog>
  );
}
