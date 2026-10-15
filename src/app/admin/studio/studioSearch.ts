// Pure, UI-free "Find anything" index for the Studio. It lists every Style control, every piece of
// shopper-facing text, the Menus panels, each page, the sections on each page and the main actions,
// and ranks them against what a (non-developer) shop owner types — "price colour", "footer words",
// "phone", "publish". Studio turns a chosen result into navigation (see StudioEditor `goToResult`).

import type { Section } from "./studioModel";
import { regionFieldDevice } from "../../features/site/storefrontRegions";
import { SHORTCUTS, type ShortcutAction } from "./shortcuts";

export type StudioTab = "sections" | "style" | "text" | "menus" | "pages" | "media" | "themes";
export type StudioActionId =
  | "save" | "publish" | "discard" | "history" | "schedule" | "check" | "preview-tab" | "undo" | "redo"
  | "device-desktop" | "device-tablet" | "device-mobile" | "mode-toggle" | "autofit-page" | "add-section" | "fill-page-seo"
  | "workbench-health" | "workbench-changes" | "workbench-setup" | "brand-kit" | "site-health" | "ai-draft";

export type SearchTarget =
  | { type: "style"; groupId: string; key?: string }
  | { type: "copy"; group: string; key?: string }
  | { type: "tab"; tab: StudioTab }
  | { type: "menus"; panel: string }
  | { type: "template"; id: string }
  | { type: "section"; templateId: string; sectionId: string }
  | { type: "page"; slug: string }
  | { type: "action"; id: StudioActionId }
  | { type: "element"; key: string }
  | { type: "book"; slug: string }
  | { type: "context"; id: ContextCommandId };

/** Commands about what is selected right now (offered first in Find anything). */
export type ContextCommandId =
  | "section-duplicate" | "section-delete" | "section-up" | "section-down" | "section-hide" | "section-show"
  | "section-copy" | "section-copy-style" | "section-paste-style" | "section-move-page" | "section-save"
  | "block-add" | "block-copy" | "block-paste"
  | "element-theme" | "element-close";

export type SearchKind = "action" | "page" | "section" | "style" | "text" | "menu" | "area" | "element" | "book";
export type SearchEntry = {
  id: string;
  kind: SearchKind;
  title: string;
  /** Where it lives, in the words used on screen: "Style › Product page". */
  where: string;
  /** Extra words that should find this entry but aren't shown. */
  keywords: string;
  target: SearchTarget;
  /** Keyboard shortcut shown beside the result ("Ctrl/⌘ S"). */
  keys?: string;
};

export const KIND_LABEL: Record<SearchKind, string> = {
  action: "Action", page: "Page", section: "Section", style: "Style", text: "Text", menu: "Menu", area: "Area",
  element: "Part", book: "Book",
};

type StyleGroupLike = { id: string; title: string; hint?: string; fields: { key: string; label: string }[] };
type CopyGroupLike = { group: string; fields: { key: string; label: string; default?: string; hint?: string }[] };
type TemplateLike = { id: string; label: string; pageSlug?: string };

export type IndexInput = {
  styleGroups: StyleGroupLike[];
  copySchema: CopyGroupLike[];
  templates: TemplateLike[];
  pages: { slug?: string; title?: string; status?: string }[];
  /** Sections per template id; the global (header/footer) stack is under "__global". */
  sectionsByTemplate: Record<string, Section[]>;
  sectionLabel: (type: string) => string;
  /** Built-in parts of the page being previewed (from the preview's structure scan). */
  elements?: { key: string; label: string; where: string; target?: string }[];
  /** Books, to open their product page in the preview. */
  books?: { slug?: string; title?: string; author?: string }[];
};

/** "pdpCardBg" → "pdp card bg", "Colour" → "color": the form both index and query are compared in. */
export function normalizeSearchText(text: string): string {
  return String(text || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._:/›·|-]+/g, " ")
    .toLowerCase()
    .replace(/colour/g, "color")
    .replace(/centre/g, "center")
    .replace(/[^a-z0-9£$€% ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Owner-friendly alternates: any word on the left also matches the words on the right.
const SYNONYMS: Record<string, string[]> = {
  phone: ["mobile"], mobile: ["phone"], bg: ["background"], background: ["bg"],
  heading: ["title"], headline: ["title"], font: ["typeface", "typography"], typeface: ["font"],
  words: ["text", "label", "copy"], wording: ["text", "label", "copy"], text: ["words", "label"],
  cart: ["bag", "basket"], bag: ["cart"], basket: ["cart"], buy: ["add to bag", "cta"],
  save: ["draft"], live: ["publish"], undo: ["revert"], menu: ["nav", "navigation"], nav: ["menu"],
  link: ["links"], links: ["link"], image: ["photo", "picture"], photo: ["image"], picture: ["image"],
  pic: ["image"], shipping: ["delivery"], delivery: ["shipping"], search: ["find"], button: ["buttons", "cta"],
};

const staticEntry = (id: string, kind: SearchKind, title: string, where: string, keywords: string, target: SearchTarget, keys?: string): SearchEntry =>
  ({ id, kind, title, where, keywords: normalizeSearchText(keywords), target, ...(keys ? { keys } : {}) });

// The shortcut a command shares with the keyboard handler (shortcuts.ts is the one table of keys).
const keysFor = (action?: ShortcutAction) => action ? SHORTCUTS.find(s => s.action === action)?.keys.split("  ·  ")[0] : undefined;
const ACTION_KEYS: Partial<Record<StudioActionId, ShortcutAction>> = {
  save: "save", undo: "undo", redo: "redo", "device-desktop": "desktop", "device-tablet": "tablet", "device-mobile": "mobile", "mode-toggle": "toggleMode",
  "add-section": "addSection", "workbench-changes": "workbench",
};

const ACTIONS: { id: StudioActionId; title: string; keywords: string }[] = [
  { id: "save", title: "Save draft", keywords: "keep store changes ctrl s" },
  { id: "publish", title: "Publish to the live shop", keywords: "go live release push shoppers" },
  { id: "discard", title: "Discard draft", keywords: "throw away reset revert to live" },
  { id: "history", title: "Version history", keywords: "restore previous older versions checkpoint save compare differences pin undo published" },
  { id: "schedule", title: "Schedule publishing or a campaign", keywords: "schedule later timer date time campaign sale seasonal switch back automatically launch" },
  { id: "check", title: "Studio Health (check before publishing)", keywords: "review accessibility problems warnings contrast alt text tap targets broken links speed seo pre-publish check" },
  { id: "preview-tab", title: "Preview in new tab", keywords: "full screen window open" },
  { id: "undo", title: "Undo", keywords: "step back ctrl z" },
  { id: "redo", title: "Redo", keywords: "step forward" },
  { id: "device-desktop", title: "Desktop preview", keywords: "computer wide screen size" },
  { id: "device-tablet", title: "Tablet preview", keywords: "ipad medium size" },
  { id: "device-mobile", title: "Phone preview", keywords: "mobile small screen size" },
  { id: "mode-toggle", title: "Switch Edit / Browse mode", keywords: "click links navigate storefront" },
  { id: "autofit-page", title: "Auto-fit this page for phones", keywords: "responsive mobile layout generate stack small screen" },
  { id: "add-section", title: "Add a section", keywords: "new block library insert hero banner" },
  { id: "ai-draft", title: "Draft a section with AI", keywords: "ai gemini write generate draft section words copy assistant magic" },
  { id: "workbench-changes", title: "Show this session's changes (undo history)", keywords: "workbench history steps go back undo several timeline what did i change edits list" },
  { id: "workbench-setup", title: "Setup checklist (get the shop ready)", keywords: "workbench launch onboarding getting started to do progress logo fonts colours share image" },
  { id: "brand-kit", title: "Brand kit (logo, colours, type and Home page in one go)", keywords: "brand kit wizard setup logo palette colours personality fonts starter home page onboarding" },
  { id: "site-health", title: "Check every page (Studio Health for the whole shop)", keywords: "site wide all pages health audit speed scan every route whole shop crawl check everything problems" },
  { id: "workbench-health", title: "Open Studio Health in the Workbench", keywords: "workbench docked panel accessibility check problems" },
  { id: "fill-page-seo", title: "Fill in missing search listings (pages)", keywords: "seo auto fill autofill meta description search title google listing pages blank" },
];

const TABS: { tab: StudioTab; title: string; keywords: string }[] = [
  { tab: "sections", title: "Page layout", keywords: "page structure sections blocks homepage outline header footer announcement pop-overs shared global" },
  { tab: "style", title: "Style", keywords: "colors fonts spacing look design theme" },
  { tab: "text", title: "Text & labels", keywords: "words wording copy messages" },
  { tab: "menus", title: "Menus", keywords: "navigation header footer categories links" },
  { tab: "pages", title: "Pages", keywords: "about journal custom page content" },
  { tab: "media", title: "Media library", keywords: "images pictures photos uploads files alt text description srcset replace delete unused" },
  { tab: "themes", title: "Themes", keywords: "my themes saved themes presets theme library looks share preview link private download import duplicate publish" },
];

const MENU_PANELS: { panel: string; title: string; keywords: string }[] = [
  { panel: "menus:categories", title: "Shop categories", keywords: "category bar sits under sub drop-down publications books zines" },
  { panel: "menus:header-order", title: "Header order (pages & categories)", keywords: "reorder navigation top bar" },
  { panel: "menus:links", title: "Header & footer links", keywords: "menu items mega menu social" },
];

/** Every searchable thing. Cheap enough to rebuild when the design changes (a few hundred rows). */
export function buildStudioIndex(input: IndexInput): SearchEntry[] {
  const out: SearchEntry[] = [];

  for (const a of ACTIONS) out.push(staticEntry(`action:${a.id}`, "action", a.title, "Studio", a.keywords, { type: "action", id: a.id }, keysFor(ACTION_KEYS[a.id])));
  for (const t of TABS) out.push(staticEntry(`tab:${t.tab}`, "area", t.title, "Studio", t.keywords, { type: "tab", tab: t.tab }, keysFor(`go:${t.tab}` as ShortcutAction)));
  for (const m of MENU_PANELS) out.push(staticEntry(m.panel, "menu", m.title, "Menus", m.keywords, { type: "menus", panel: m.panel }));

  for (const t of input.templates) {
    out.push(staticEntry(`template:${t.id}`, "page", t.label, "Pages you can design", `edit sections ${t.pageSlug || ""}`, { type: "template", id: t.id }));
  }
  const seenSlug = new Set<string>();
  for (const p of input.pages) {
    if (!p.slug || seenSlug.has(p.slug)) continue;
    seenSlug.add(p.slug);
    out.push(staticEntry(`page:${p.slug}`, "page", p.title || p.slug, `Pages › ${p.status === "published" ? "Published" : "Draft"}`, `write edit content custom page ${p.slug}`, { type: "page", slug: p.slug }));
  }

  for (const el of input.elements || []) {
    out.push(staticEntry(`element:${el.key}`, "element", el.label, el.where, `part of the page ${el.target || ""}`, { type: "element", key: el.key }));
  }
  const seenBook = new Set<string>();
  for (const b of input.books || []) {
    if (!b.slug || seenBook.has(b.slug)) continue;
    seenBook.add(b.slug);
    out.push(staticEntry(`book:${b.slug}`, "book", b.title || b.slug, "Book pages", `product page ${b.author || ""} ${b.slug}`, { type: "book", slug: b.slug }));
  }

  const nameOf = (id: string) => id === "__global" ? "Header / footer sections" : input.templates.find(t => t.id === id)?.label || id;
  for (const [templateId, list] of Object.entries(input.sectionsByTemplate)) {
    (list || []).forEach((s, i) => {
      const label = input.sectionLabel(s.type);
      const st = s.settings || {};
      const snippet = [st.title, st.heading, st.headline, st.text].find(v => typeof v === "string" && v.trim());
      out.push(staticEntry(`section:${s.id}`, "section", snippet ? `${label} — ${String(snippet).slice(0, 48)}` : label,
        `${nameOf(templateId)} › section ${i + 1}${s.visible === false ? " (hidden)" : ""}`, `${label} ${s.type}`, { type: "section", templateId, sectionId: s.id }));
    });
  }

  for (const g of input.styleGroups) {
    out.push(staticEntry(`style-group:${g.id}`, "style", g.title, "Style", `${g.hint || ""} all settings group`, { type: "style", groupId: g.id }));
    for (const f of g.fields) {
      // An element setting exists once per screen size; index it once (the desktop field) and let
      // "tablet"/"phone" match it — the element's controls follow the previewed size anyway.
      const region = f.key.startsWith("regions.");
      if (region && regionFieldDevice(f.key) !== "desktop") continue;
      out.push(staticEntry(`style:${g.id}:${f.key}`, "style", f.label, `Style › ${g.title}`, `${f.key} ${g.title}${region ? " tablet phone mobile" : ""}`, { type: "style", groupId: g.id, key: f.key }));
    }
  }

  for (const g of input.copySchema) {
    out.push(staticEntry(`copy-group:${g.group}`, "text", g.group, "Text & labels", "words wording group", { type: "copy", group: g.group }));
    for (const f of g.fields) {
      out.push(staticEntry(`copy:${f.key}`, "text", f.label, `Text & labels › ${g.group}`, `${f.key} ${f.default || ""} ${f.hint || ""}`, { type: "copy", group: g.group, key: f.key }));
    }
  }
  return out;
}

const KIND_ORDER: Record<SearchKind, number> = { action: 0, area: 1, element: 2, page: 3, section: 4, book: 5, menu: 6, style: 7, text: 8 };

const expand = (token: string): string[] => [token, ...(SYNONYMS[token] || []).map(normalizeSearchText)];

/** Score one query token against one entry (0 = no match). Title beats location beats hidden keywords. */
function tokenScore(entry: { t: string; w: string; k: string }, token: string): number {
  let best = 0;
  for (const alt of expand(token)) {
    const words = alt.split(" ");
    const hit = (hay: string) => words.every(w => hay.includes(w));
    if (hit(entry.t)) {
      const startsWord = entry.t.split(" ").some(w => w.startsWith(words[0]));
      best = Math.max(best, startsWord ? 4 : 3);
    } else if (hit(entry.w)) best = Math.max(best, 2);
    else if (hit(entry.k)) best = Math.max(best, 1);
  }
  return best;
}

export type SearchOptions = {
  limit?: number;
  /** Commands about the current selection (`contextCommands`): offered first. */
  context?: SearchEntry[];
  /** Ids of recently opened results, newest first. */
  recent?: string[];
};

const isCommand = (e: SearchEntry) => e.kind === "action" || e.kind === "area" || e.target.type === "context";

function rank(entries: SearchEntry[], q: string, boost: (e: SearchEntry) => number): SearchEntry[] {
  const tokens = q.split(" ");
  const scored: { e: SearchEntry; score: number }[] = [];
  for (const e of entries) {
    const prepared = { t: normalizeSearchText(e.title), w: normalizeSearchText(e.where), k: e.keywords };
    let score = 0, ok = true;
    for (const token of tokens) {
      const s = tokenScore(prepared, token);
      if (!s) { ok = false; break; }
      score += s;
    }
    if (!ok) continue;
    if (prepared.t === q) score += 12;
    else if (prepared.t.startsWith(q)) score += 6;
    else if (prepared.t.includes(q)) score += 3;
    scored.push({ e, score: score + boost(e) });
  }
  scored.sort((a, b) => b.score - a.score || KIND_ORDER[a.e.kind] - KIND_ORDER[b.e.kind] || a.e.title.localeCompare(b.e.title));
  return scored.map(s => s.e);
}

export type PaletteGroup = { title: string; entries: SearchEntry[] };

/**
 * What Find anything shows, in titled groups. Before typing: commands for the selection, recent
 * results, then shortcuts. A query starting with ">" searches commands only. Otherwise every typed
 * word must match; selection commands and recent results get a small lift.
 */
export function paletteGroups(index: SearchEntry[], query: string, { limit = 24, context = [], recent = [] }: SearchOptions = {}): PaletteGroup[] {
  const commandsOnly = query.trimStart().startsWith(">");
  const q = normalizeSearchText(commandsOnly ? query.trimStart().slice(1) : query);
  const byId = new Map(index.map(e => [e.id, e]));
  const recentEntries = recent.map(id => byId.get(id)).filter((e): e is SearchEntry => Boolean(e));
  if (!q) {
    const groups: PaletteGroup[] = [];
    if (context.length) groups.push({ title: "For what you selected", entries: context });
    if (commandsOnly) {
      groups.push({ title: "Commands", entries: index.filter(e => isCommand(e)) });
    } else {
      if (recentEntries.length) groups.push({ title: "Recent", entries: recentEntries.slice(0, 5) });
      const shown = new Set(groups.flatMap(g => g.entries.map(e => e.id)));
      groups.push({ title: "Shortcuts", entries: index.filter(e => (e.kind === "action" || e.kind === "area" || e.kind === "page") && !shown.has(e.id)) });
    }
    return trim(groups, limit);
  }
  const pool = commandsOnly ? [...context, ...index.filter(isCommand)] : [...context, ...index];
  const recentSet = new Set(recent);
  const ranked = rank(pool, q, e => (e.target.type === "context" ? 3 : 0) + (recentSet.has(e.id) ? 2 : 0));
  const title = commandsOnly ? "Commands" : "Results";
  return trim([{ title: ranked.length > limit ? `${title} · best ${limit} of ${ranked.length}, type more words to narrow` : title, entries: ranked }], limit);
}

function trim(groups: PaletteGroup[], limit: number): PaletteGroup[] {
  let left = limit;
  const out: PaletteGroup[] = [];
  for (const g of groups) {
    if (left <= 0) break;
    const entries = g.entries.slice(0, left);
    if (entries.length) { out.push({ ...g, entries }); left -= entries.length; }
  }
  return out;
}

/**
 * Ranks the index for a query (a flat list; see `paletteGroups` for the grouped palette). Every
 * typed word must match somewhere; titles that start with the query rank first, then more title
 * hits, then the area. An empty query returns the shortcuts worth showing before anyone types.
 */
export function searchStudio(index: SearchEntry[], query: string, { limit = 24 }: SearchOptions = {}): SearchEntry[] {
  return paletteGroups(index, query, { limit }).flatMap(g => g.entries);
}

/** Selection-aware commands: what can be done to the selected section or page part right now. */
export function contextCommands(ctx: {
  section?: { id: string; label: string; visible: boolean; first: boolean; last: boolean };
  element?: { label: string; hasTheme: boolean };
  canPasteStyle?: boolean;
  /** Block library 3.0: the selected section takes blocks / a block is selected / the copied block fits here. */
  blocks?: { takesBlocks: boolean; blockLabel?: string; canPaste: boolean };
}): SearchEntry[] {
  const out: SearchEntry[] = [];
  const cmd = (id: ContextCommandId, title: string, where: string, keywords: string, keys?: ShortcutAction) =>
    out.push(staticEntry(`context:${id}`, "action", title, where, keywords, { type: "context", id }, keysFor(keys)));
  if (ctx.section) {
    const s = ctx.section, where = `Selected section › ${s.label}`;
    cmd("section-duplicate", "Duplicate this section", where, "copy clone again", "duplicate");
    if (!s.first) cmd("section-up", "Move this section up", where, "reorder higher earlier", "moveUp");
    if (!s.last) cmd("section-down", "Move this section down", where, "reorder lower later", "moveDown");
    if (s.visible) cmd("section-hide", "Hide this section", where, "invisible turn off");
    else cmd("section-show", "Show this section", where, "visible turn on unhide");
    cmd("section-copy", "Copy this section", where, "clipboard paste later another page");
    cmd("section-copy-style", "Copy this section's style", where, "look colours fonts spacing");
    if (ctx.canPasteStyle) cmd("section-paste-style", "Paste style onto this section", where, "apply copied look");
    cmd("section-move-page", "Move this section to another page", where, "transfer relocate");
    cmd("section-save", "Save this section for reuse", where, "preset library saved sections");
    cmd("section-delete", "Delete this section", where, "remove trash", "delete");
    if (ctx.blocks?.takesBlocks) {
      cmd("block-add", "Add a block to this section", where, "block picker new insert content");
      if (ctx.blocks.blockLabel) cmd("block-copy", `Copy the selected block (${ctx.blocks.blockLabel})`, where, "clipboard block duplicate another section");
      if (ctx.blocks.canPaste) cmd("block-paste", "Paste the copied block here", where, "clipboard block insert");
    }
  }
  if (ctx.element) {
    const where = `Selected part › ${ctx.element.label}`;
    if (ctx.element.hasTheme) cmd("element-theme", `Open ${ctx.element.label} in Theme settings`, where, "all style settings category");
    cmd("element-close", `Close ${ctx.element.label}`, where, "deselect done", "deselect");
  }
  return out;
}

/** Remember a picked result: newest first, no repeats, at most `max`. */
export function pushRecent(list: string[], id: string, max = 8): string[] {
  return [id, ...list.filter(x => x !== id)].slice(0, max);
}

/** The screen size a query names ("button phone padding" → mobile), if any. */
export function searchedDevice(query: string): "mobile" | "tablet" | "desktop" | null {
  const words = normalizeSearchText(query).split(" ");
  if (words.some(w => w === "phone" || w === "mobile" || w === "phones")) return "mobile";
  if (words.some(w => w === "tablet" || w === "ipad" || w === "tablets")) return "tablet";
  if (words.some(w => w === "desktop" || w === "computer")) return "desktop";
  return null;
}
