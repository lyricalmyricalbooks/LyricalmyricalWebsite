// The Overview as a widget board (design B4, 18 October 2026). Pure: what widgets exist, which topic band each
// belongs to, the starting layouts, and every edit the board editor makes. The React side is OverviewBoard.tsx;
// the figures themselves still come from AnalyticsDashboard and the Overview* panels.
import { CHART_METRICS, type ChartMetric } from "./overviewSeries";

export type BandId = "today" | "sales" | "titles" | "traffic" | "search" | "customers" | "stock";
export type WidgetSize = "s" | "m" | "l" | "xl";
export type WidgetHeight = "auto" | "short" | "tall";
export type Density = "comfortable" | "compact";

/** Topic bands, top to bottom by default. A widget always sits in its own topic's band. */
export const BANDS: Array<{ id: BandId; title: string; blurb: string }> = [
  { id: "today", title: "Today", blurb: "Live — what needs you now, not tied to the period" },
  { id: "sales", title: "Sales & money", blurb: "Revenue, orders, what customers paid and how it ships" },
  { id: "titles", title: "Titles", blurb: "Every book side by side: copies, revenue, interest and profit" },
  { id: "traffic", title: "Traffic & marketing", blurb: "How people find the shop and where they drop off" },
  { id: "search", title: "Search & site health", blurb: "What people search for, Google results and page speed" },
  { id: "customers", title: "Customers", blurb: "Who buys, who comes back, carts left behind and reviews" },
  { id: "stock", title: "Stock", blurb: "What to reprint, what is waiting, what is gathering dust" },
];
const BAND_IDS = BANDS.map(b => b.id);

export const SIZES: Array<{ id: WidgetSize; label: string; name: string; span: number }> = [
  { id: "s", label: "S", name: "Small (a third)", span: 4 },
  { id: "m", label: "M", name: "Medium (half)", span: 6 },
  { id: "l", label: "L", name: "Large (two thirds)", span: 8 },
  { id: "xl", label: "XL", name: "Full width", span: 12 },
];
export const HEIGHTS: Array<{ id: WidgetHeight; label: string }> = [
  { id: "auto", label: "Fit the content" },
  { id: "short", label: "Short (scrolls)" },
  { id: "tall", label: "Tall (scrolls)" },
];

/** The figures a "Key figures" widget can show, in this order. */
export const FIGURES = [
  { id: "revenue", label: "Net revenue" },
  { id: "orders", label: "Orders" },
  { id: "units", label: "Books sold" },
  { id: "aov", label: "Average order" },
  { id: "visitors", label: "Visitors" },
  { id: "conversion", label: "Visitors → sale" },
  { id: "cartStep", label: "Bag → checkout" },
  { id: "profit", label: "Gross profit" },
  { id: "returning", label: "Returning readers" },
  { id: "refunds", label: "Refunds & codes" },
  { id: "shipping", label: "Shipping charged" },
  { id: "discounts", label: "Discount rate" },
] as const;
export type FigureId = (typeof FIGURES)[number]["id"];
const FIGURE_IDS = FIGURES.map(f => f.id) as string[];
export const DEFAULT_FIGURES: FigureId[] = ["revenue", "orders", "aov", "visitors", "conversion", "cartStep", "profit", "returning"];

export type ChartGrain = "auto" | "day" | "week" | "month";
export type WidgetConfig = { metric?: ChartMetric; grain?: ChartGrain; compare?: boolean; figures?: FigureId[] };

export type WidgetType =
  | "needs" | "changes" | "newest" | "readiness"
  | "story" | "chart" | "figures" | "best" | "money" | "formats" | "countries" | "categories" | "weekdays" | "hours" | "fulfilment" | "codes"
  | "titles" | "viewed"
  | "gaKpis" | "channels" | "gaSources" | "landing" | "gaPages" | "gaCountries" | "gaDevices" | "funnel" | "checkout" | "sources" | "campaigns" | "landingSales" | "devices"
  | "searches" | "missed" | "google" | "googleQueries" | "googlePages" | "speed" | "counter"
  | "custKpis" | "retention" | "top" | "carts" | "reminders" | "newsletter" | "reviews"
  | "stockKpis" | "reprint" | "wanted" | "backInStock" | "slow" | "low";

export type WidgetMeta = {
  type: WidgetType; band: BandId; title: string; blurb: string; size: WidgetSize;
  /** Can sit on the board more than once (each copy with its own settings). */ multi?: boolean;
  /** Needs Google Analytics connected to show anything. */ google?: boolean;
  config?: WidgetConfig;
};

export const WIDGETS: WidgetMeta[] = [
  { type: "needs", band: "today", title: "Needs you", blurb: "Orders to ship, requests, reprints, reviews and messages waiting for you", size: "m" },
  { type: "changes", band: "today", title: "What changed", blurb: "The biggest moves against the period before", size: "m" },
  { type: "newest", band: "today", title: "Newest orders", blurb: "The latest real sales and their status", size: "m" },
  { type: "readiness", band: "today", title: "Ready to sell?", blurb: "Launch checks still open (hidden once all pass)", size: "m" },

  { type: "story", band: "sales", title: "Headline", blurb: "The period in one sentence, with this month's pace", size: "m" },
  { type: "chart", band: "sales", title: "Trend chart", blurb: "Revenue, orders, books, average order, visitors or conversion over time — add as many as you like", size: "l", multi: true, config: { metric: "revenue", grain: "auto", compare: true } },
  { type: "figures", band: "sales", title: "Key figures", blurb: "Pick the numbers you watch, each against the period before", size: "xl", multi: true, config: { figures: DEFAULT_FIGURES } },
  { type: "best", band: "sales", title: "Best sellers", blurb: "Top titles by revenue, with units against the period before", size: "m" },
  { type: "money", band: "sales", title: "Where the money goes", blurb: "Books, discounts, shipping, tax, gift cards and refunds", size: "m" },
  { type: "formats", band: "sales", title: "Format mix", blurb: "Print against digital, by format", size: "s" },
  { type: "countries", band: "sales", title: "Where readers are", blurb: "Top destinations by revenue", size: "s" },
  { type: "categories", band: "sales", title: "Categories", blurb: "Sales and visits per shop category", size: "s" },
  { type: "weekdays", band: "sales", title: "Busiest days", blurb: "Orders by day of the week", size: "s" },
  { type: "hours", band: "sales", title: "Busiest hours", blurb: "Orders by weekday and hour — when to post or launch", size: "l" },
  { type: "fulfilment", band: "sales", title: "Fulfilment & payments", blurb: "How fast orders ship and how customers pay", size: "m" },
  { type: "codes", band: "sales", title: "Discount codes", blurb: "Codes used, what they brought in and gave away", size: "m" },

  { type: "titles", band: "titles", title: "Every title", blurb: "Sortable, searchable table of every title with CSV download", size: "xl" },
  { type: "viewed", band: "titles", title: "Most viewed books", blurb: "Product-page views beside copies sold", size: "m" },

  { type: "gaKpis", band: "traffic", title: "Google Analytics at a glance", blurb: "On the site now, visitors, sessions, engagement", size: "xl", google: true },
  { type: "channels", band: "traffic", title: "How people find you", blurb: "Search, social, email, links or typed in (Google Analytics)", size: "m", google: true },
  { type: "gaSources", band: "traffic", title: "Exact sources", blurb: "Each site, search engine or campaign (Google Analytics)", size: "m", google: true },
  { type: "landing", band: "traffic", title: "Landing pages", blurb: "The first page people saw (Google Analytics)", size: "m", google: true },
  { type: "gaPages", band: "traffic", title: "Most viewed pages", blurb: "Page views in this period (Google Analytics)", size: "m", google: true },
  { type: "gaCountries", band: "traffic", title: "Where visitors are", blurb: "Visitors by country (Google Analytics)", size: "s", google: true },
  { type: "gaDevices", band: "traffic", title: "Visitor devices", blurb: "Phones, computers and tablets (Google Analytics)", size: "s", google: true },
  { type: "funnel", band: "traffic", title: "Shopping funnel", blurb: "Book views → bag → checkout → purchase", size: "m" },
  { type: "checkout", band: "traffic", title: "Where checkout loses people", blurb: "Each checkout step and where shoppers stop", size: "m" },
  { type: "sources", band: "traffic", title: "Sources that sell", blurb: "Visits per source beside the orders it brought", size: "l" },
  { type: "campaigns", band: "traffic", title: "Campaigns and links that sell", blurb: "Tagged links and campaigns with orders and new customers", size: "l" },
  { type: "landingSales", band: "traffic", title: "Pages that start sales", blurb: "Where buyers first landed", size: "m" },
  { type: "devices", band: "traffic", title: "Devices (shop counter)", blurb: "What shoppers browse on, from the shop's own counter", size: "s" },

  { type: "searches", band: "search", title: "What people search for", blurb: "Searches on the shop that found books", size: "s" },
  { type: "missed", band: "search", title: "Searches that found nothing", blurb: "Books or topics shoppers want that the shop doesn't show", size: "s" },
  { type: "google", band: "search", title: "Found on Google", blurb: "Clicks, times seen, click rate and position (Search Console)", size: "m" },
  { type: "googleQueries", band: "search", title: "What people searched on Google", blurb: "Google searches that showed the shop", size: "m" },
  { type: "googlePages", band: "search", title: "Pages Google showed", blurb: "Shop pages in Google results", size: "m" },
  { type: "speed", band: "search", title: "Page speed for real shoppers", blurb: "Loading, responding and steadiness on phones and computers", size: "m" },
  { type: "counter", band: "search", title: "The shop's own counter", blurb: "Since when traffic is counted, and resetting it", size: "m" },

  { type: "custKpis", band: "customers", title: "Customer figures", blurb: "Returning readers, repeat rate, lifetime value, subscribers", size: "xl" },
  { type: "retention", band: "customers", title: "Do customers come back?", blurb: "Repeat purchases by first-order month", size: "l" },
  { type: "top", band: "customers", title: "Top customers", blurb: "By total spend, all time", size: "m" },
  { type: "carts", band: "customers", title: "Abandoned carts", blurb: "Carts left with an email, and how many came back", size: "s" },
  { type: "reminders", band: "customers", title: "Did the reminder emails work?", blurb: "Reminders sent and who bought after one", size: "s" },
  { type: "newsletter", band: "customers", title: "Newsletter sign-ups by week", blurb: "Confirmed and waiting sign-ups, last 8 weeks", size: "m" },
  { type: "reviews", band: "customers", title: "Reader reviews", blurb: "Average rating and reviews waiting", size: "s" },

  { type: "stockKpis", band: "stock", title: "Stock figures", blurb: "Shelf value, print titles, reprints and readers waiting", size: "xl" },
  { type: "reprint", band: "stock", title: "Reprint watch", blurb: "Selling fast, under 30 days of stock", size: "m" },
  { type: "wanted", band: "stock", title: "Wanted but can't be bought", blurb: "Sold-out or coming-soon books people looked for", size: "m" },
  { type: "backInStock", band: "stock", title: "Back-in-stock demand", blurb: "Readers waiting to be emailed", size: "m" },
  { type: "slow", band: "stock", title: "Slow-moving stock", blurb: "In stock with no recent sale", size: "m" },
  { type: "low", band: "stock", title: "Running low", blurb: "Five copies or fewer", size: "m" },
];
const META = new Map(WIDGETS.map(w => [w.type, w]));
export const widgetMeta = (type: WidgetType) => META.get(type)!;
export const isWidgetType = (v: unknown): v is WidgetType => typeof v === "string" && META.has(v as WidgetType);

export type BoardWidget = { id: string; type: WidgetType; size: WidgetSize; height: WidgetHeight; collapsed?: boolean; title?: string; config?: WidgetConfig };
export type BoardBand = { id: BandId; collapsed?: boolean; hidden?: boolean; widgets: BoardWidget[] };
export type Board = { id: string; name: string; template: TemplateId; density: Density; bands: BoardBand[] };
export type BoardStore = { v: 1; activeId: string; boards: Board[]; updatedAt: number };

type Spec = WidgetType | [WidgetType, WidgetSize?, WidgetConfig?];
export type TemplateId = "desk" | "everything" | "money" | "marketing" | "stock" | "launch";
export const TEMPLATES: Array<{ id: TemplateId; name: string; blurb: string; order?: BandId[]; widgets: Spec[] }> = [
  {
    id: "desk", name: "Daily desk", blurb: "What needs you, the main figures and one widget per topic",
    widgets: ["needs", "changes", "newest", "readiness", ["chart", "l"], ["story", "s"], "figures", "best", "money", ["titles", "xl"],
      ["sources", "l"], ["funnel", "s"], "checkout", "speed", "missed", "top", "carts", "reprint", "low"],
  },
  { id: "everything", name: "Everything", blurb: "Every analytics widget there is, grouped by topic", widgets: WIDGETS.map(w => w.type) },
  {
    id: "money", name: "Money", blurb: "Revenue, average order, what customers paid, codes and payments",
    order: ["sales", "titles", "customers", "today", "traffic", "search", "stock"],
    widgets: [["chart", "l", { metric: "revenue" }], ["story", "s"], ["chart", "m", { metric: "aov" }], ["chart", "m", { metric: "orders" }],
      ["figures", "xl", { figures: ["revenue", "orders", "units", "aov", "profit", "refunds", "shipping", "discounts"] }],
      "money", "fulfilment", "codes", "best", "countries", "formats", "weekdays", "titles", ["top", "m"], "newest"],
  },
  {
    id: "marketing", name: "Marketing", blurb: "Visitors, sources, campaigns, the funnel and Google",
    order: ["traffic", "search", "sales", "titles", "customers", "today", "stock"],
    widgets: [["chart", "m", { metric: "visitors" }], ["chart", "m", { metric: "conversion" }], "gaKpis", "sources", ["funnel", "s"], "campaigns", ["landingSales", "s"],
      "checkout", "channels", "landing", "google", "googleQueries", "searches", "missed", "speed", "viewed", "newsletter", "reminders"],
  },
  {
    id: "stock", name: "Stock", blurb: "Reprints, low stock, what people wait for and what isn't moving",
    order: ["stock", "titles", "sales", "today", "traffic", "search", "customers"],
    widgets: ["stockKpis", "reprint", "low", "wanted", "backInStock", "slow", "titles", ["chart", "l", { metric: "units" }], ["best", "s"]],
  },
  {
    id: "launch", name: "Launch week", blurb: "A new book going out: today's sales, sources, checkout and stock",
    widgets: ["needs", "readiness", "newest", ["chart", "l", { metric: "orders", grain: "day" }], ["story", "s"], "figures", "best", "viewed",
      "sources", "campaigns", "checkout", "missed", "speed", "reprint", "low", "backInStock"],
  },
];
export const DEFAULT_TEMPLATE: TemplateId = "desk";

let seq = 0;
/** Ids only need to be unique within one board; the time part keeps copies made on two devices apart. */
export const widgetId = () => `w${Date.now().toString(36)}${(seq++).toString(36)}`;

const sizeOk = (v: unknown): v is WidgetSize => v === "s" || v === "m" || v === "l" || v === "xl";
const heightOk = (v: unknown): v is WidgetHeight => v === "auto" || v === "short" || v === "tall";

/** A new widget of `type` with its catalog defaults. */
export function makeWidget(type: WidgetType, size?: WidgetSize, config?: WidgetConfig): BoardWidget {
  const meta = widgetMeta(type);
  const base = meta.config ? { ...meta.config, ...(config || {}) } : config;
  return { id: widgetId(), type, size: size || meta.size, height: "auto", ...(base ? { config: { ...base } } : {}) };
}

export function templateBoard(template: TemplateId, name?: string): Board {
  const t = TEMPLATES.find(x => x.id === template) || TEMPLATES[0];
  const order = t.order || BAND_IDS;
  const bands: BoardBand[] = order.map(id => ({ id, widgets: [] }));
  t.widgets.forEach(spec => {
    const [type, size, config] = Array.isArray(spec) ? spec : [spec];
    bands.find(b => b.id === widgetMeta(type).band)!.widgets.push(makeWidget(type, size, config));
  });
  return { id: `b${widgetId()}`, name: name || t.name, template: t.id, density: "comfortable", bands };
}

export function defaultStore(now = Date.now()): BoardStore {
  const board = templateBoard(DEFAULT_TEMPLATE);
  return { v: 1, activeId: board.id, boards: [board], updatedAt: now };
}

function cleanConfig(type: WidgetType, raw: any): WidgetConfig | undefined {
  const meta = widgetMeta(type);
  if (!meta.config) return undefined;
  const out: WidgetConfig = { ...meta.config };
  if (type === "chart") {
    if (CHART_METRICS.some(m => m.id === raw?.metric)) out.metric = raw.metric;
    if (["auto", "day", "week", "month"].includes(raw?.grain)) out.grain = raw.grain;
    if (typeof raw?.compare === "boolean") out.compare = raw.compare;
  }
  if (type === "figures" && Array.isArray(raw?.figures)) {
    const picked = FIGURE_IDS.filter(id => raw.figures.includes(id)) as FigureId[];
    if (picked.length) out.figures = picked;
  }
  return out;
}

/** Anything read back from storage, made safe: known widgets only, each in its own band, every band present once. */
export function normalizeBoard(raw: any, fallbackName = "My board"): Board {
  const bands: BoardBand[] = [];
  const seen = new Set<string>();
  const ids = new Set<string>();
  const rawBands: any[] = Array.isArray(raw?.bands) ? raw.bands : [];
  rawBands.forEach(b => {
    if (!BAND_IDS.includes(b?.id) || seen.has(b.id)) return;
    seen.add(b.id);
    bands.push({ id: b.id, ...(b.collapsed ? { collapsed: true } : {}), ...(b.hidden ? { hidden: true } : {}), widgets: [] });
  });
  BAND_IDS.forEach(id => { if (!seen.has(id)) bands.push({ id, widgets: [] }); });
  const byId = new Map(bands.map(b => [b.id, b]));
  rawBands.forEach(b => (Array.isArray(b?.widgets) ? b.widgets : []).forEach((w: any) => {
    if (!isWidgetType(w?.type)) return;
    const meta = widgetMeta(w.type);
    const band = byId.get(meta.band)!;
    if (!meta.multi && band.widgets.some(x => x.type === w.type)) return;
    let id = typeof w.id === "string" && w.id ? w.id.slice(0, 40) : widgetId();
    if (ids.has(id)) id = widgetId();
    ids.add(id);
    const title = typeof w.title === "string" && w.title.trim() ? w.title.trim().slice(0, 60) : undefined;
    const config = cleanConfig(w.type, w.config);
    band.widgets.push({
      id, type: w.type, size: sizeOk(w.size) ? w.size : meta.size, height: heightOk(w.height) ? w.height : "auto",
      ...(w.collapsed ? { collapsed: true } : {}), ...(title ? { title } : {}), ...(config ? { config } : {}),
    });
  }));
  const template = TEMPLATES.some(t => t.id === raw?.template) ? raw.template : DEFAULT_TEMPLATE;
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id.slice(0, 40) : `b${widgetId()}`,
    name: typeof raw?.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 40) : fallbackName,
    template, density: raw?.density === "compact" ? "compact" : "comfortable", bands,
  };
}

export const MAX_BOARDS = 12;

export function normalizeStore(raw: any): BoardStore {
  if (!raw || !Array.isArray(raw.boards) || raw.boards.length === 0) return defaultStore(Number(raw?.updatedAt) || 0);
  const boards: Board[] = [];
  raw.boards.slice(0, MAX_BOARDS).forEach((b: any) => {
    const board = normalizeBoard(b);
    if (boards.some(x => x.id === board.id)) board.id = `b${widgetId()}`;
    boards.push(board);
  });
  const activeId = boards.some(b => b.id === raw.activeId) ? raw.activeId : boards[0].id;
  return { v: 1, activeId, boards, updatedAt: Number(raw.updatedAt) || 0 };
}

export const activeBoard = (s: BoardStore) => s.boards.find(b => b.id === s.activeId) || s.boards[0];

// ── Edits on one board. Each returns a new board and never mutates its input. ──

const mapBands = (b: Board, fn: (band: BoardBand) => BoardBand): Board => ({ ...b, bands: b.bands.map(fn) });
export const findWidget = (b: Board, wid: string) => {
  for (const band of b.bands) { const w = band.widgets.find(x => x.id === wid); if (w) return { band, widget: w }; }
  return null;
};
export const countOf = (b: Board, type: WidgetType) => b.bands.reduce((n, band) => n + band.widgets.filter(w => w.type === type).length, 0);
export const canAdd = (b: Board, type: WidgetType) => !!widgetMeta(type).multi || countOf(b, type) === 0;

export function addWidget(b: Board, type: WidgetType, config?: WidgetConfig): { board: Board; id: string | null } {
  if (!canAdd(b, type)) return { board: b, id: null };
  const w = makeWidget(type, undefined, config);
  const band = widgetMeta(type).band;
  return { board: mapBands(b, x => (x.id === band ? { ...x, hidden: false, collapsed: false, widgets: [...x.widgets, w] } : x)), id: w.id };
}

export const removeWidget = (b: Board, wid: string): Board => mapBands(b, x => ({ ...x, widgets: x.widgets.filter(w => w.id !== wid) }));

export const updateWidget = (b: Board, wid: string, patch: Partial<Omit<BoardWidget, "id" | "type">>): Board =>
  mapBands(b, x => (x.widgets.some(w => w.id === wid) ? { ...x, widgets: x.widgets.map(w => (w.id === wid ? { ...w, ...patch } : w)) } : x));

export function setWidgetConfig(b: Board, wid: string, patch: WidgetConfig): Board {
  const found = findWidget(b, wid);
  if (!found) return b;
  return updateWidget(b, wid, { config: cleanConfig(found.widget.type, { ...(found.widget.config || {}), ...patch }) });
}

/** Rename a widget; an empty name goes back to the catalog title. */
export function renameWidget(b: Board, wid: string, title: string): Board {
  const t = title.trim().slice(0, 60);
  return mapBands(b, x => ({ ...x, widgets: x.widgets.map(w => (w.id !== wid ? w : t ? { ...w, title: t } : (({ title: _t, ...rest }) => rest)(w))) }));
}

export function duplicateWidget(b: Board, wid: string): { board: Board; id: string | null } {
  const found = findWidget(b, wid);
  if (!found || !widgetMeta(found.widget.type).multi) return { board: b, id: null };
  const copy: BoardWidget = { ...found.widget, id: widgetId(), collapsed: false, ...(found.widget.config ? { config: { ...found.widget.config } } : {}) };
  return {
    board: mapBands(b, x => {
      if (x.id !== found.band.id) return x;
      const i = x.widgets.findIndex(w => w.id === wid);
      return { ...x, widgets: [...x.widgets.slice(0, i + 1), copy, ...x.widgets.slice(i + 1)] };
    }),
    id: copy.id,
  };
}

/** Move a widget one place earlier (-1) or later (+1) inside its band. */
export function moveWidget(b: Board, wid: string, delta: number): Board {
  return mapBands(b, x => {
    const i = x.widgets.findIndex(w => w.id === wid);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= x.widgets.length) return x;
    const next = [...x.widgets];
    [next[i], next[j]] = [next[j], next[i]];
    return { ...x, widgets: next };
  });
}

/** Drag and drop: put `wid` where `targetId` is (before it), or at the end of its band when `targetId` is null. Same band only. */
export function moveWidgetTo(b: Board, wid: string, targetId: string | null): Board {
  const found = findWidget(b, wid);
  if (!found || wid === targetId) return b;
  if (targetId && findWidget(b, targetId)?.band.id !== found.band.id) return b;
  return mapBands(b, x => {
    if (x.id !== found.band.id) return x;
    const rest = x.widgets.filter(w => w.id !== wid);
    const at = targetId ? rest.findIndex(w => w.id === targetId) : rest.length;
    return { ...x, widgets: [...rest.slice(0, at), found.widget, ...rest.slice(at)] };
  });
}

export function moveBand(b: Board, bandId: BandId, delta: number): Board {
  const i = b.bands.findIndex(x => x.id === bandId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= b.bands.length) return b;
  const bands = [...b.bands];
  [bands[i], bands[j]] = [bands[j], bands[i]];
  return { ...b, bands };
}

export const updateBand = (b: Board, bandId: BandId, patch: Partial<Pick<BoardBand, "collapsed" | "hidden">>): Board =>
  mapBands(b, x => (x.id === bandId ? { ...x, ...patch } : x));

/** Fold or open every band and every widget at once. */
export const collapseEverything = (b: Board, collapsed: boolean): Board =>
  mapBands(b, x => ({ ...x, collapsed, widgets: x.widgets.map(w => ({ ...w, collapsed })) }));

/** Fold or open every widget in one band (the band itself stays open). */
export const collapseBandWidgets = (b: Board, bandId: BandId, collapsed: boolean): Board =>
  mapBands(b, x => (x.id === bandId ? { ...x, collapsed: false, widgets: x.widgets.map(w => ({ ...w, collapsed })) } : x));

/** Bands that show on the board (not hidden and holding at least one widget, unless editing). */
export const visibleBands = (b: Board, editing: boolean) => b.bands.filter(x => !x.hidden && (editing || x.widgets.length > 0));

export const widgetTitle = (w: BoardWidget) => {
  if (w.title) return w.title;
  if (w.type === "chart") {
    const m = CHART_METRICS.find(x => x.id === w.config?.metric) || CHART_METRICS[0];
    return `${m.label} chart`;
  }
  return widgetMeta(w.type).title;
};

/** The add-widget tray: catalog entries matching a search, grouped by band in band order. */
export function searchCatalog(query: string): Array<{ band: (typeof BANDS)[number]; widgets: WidgetMeta[] }> {
  const q = query.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const hit = (w: WidgetMeta) => {
    if (!words.length) return true;
    const band = BANDS.find(x => x.id === w.band)!;
    const hay = `${w.title} ${w.blurb} ${band.title}`.toLowerCase();
    return words.every(word => hay.includes(word));
  };
  return BANDS.map(band => ({ band, widgets: WIDGETS.filter(w => w.band === band.id && hit(w)) })).filter(g => g.widgets.length > 0);
}

// ── Edits on the store (several named boards, one shown). ──

const touch = (s: BoardStore, patch: Partial<BoardStore>, now: number): BoardStore => ({ ...s, ...patch, updatedAt: now });

export const replaceBoard = (s: BoardStore, board: Board, now = Date.now()): BoardStore =>
  touch(s, { boards: s.boards.map(b => (b.id === board.id ? board : b)) }, now);

export const selectBoard = (s: BoardStore, id: string, now = Date.now()): BoardStore =>
  (s.boards.some(b => b.id === id) ? touch(s, { activeId: id }, now) : s);

export function addBoard(s: BoardStore, template: TemplateId, name?: string, now = Date.now()): BoardStore {
  if (s.boards.length >= MAX_BOARDS) return s;
  const board = templateBoard(template, uniqueName(s, name || TEMPLATES.find(t => t.id === template)?.name || "My board"));
  return touch(s, { boards: [...s.boards, board], activeId: board.id }, now);
}

/** A copy of the board on screen, under a new name, then shown. */
export function copyBoard(s: BoardStore, name?: string, now = Date.now()): BoardStore {
  if (s.boards.length >= MAX_BOARDS) return s;
  const src = activeBoard(s);
  const board = normalizeBoard({ ...JSON.parse(JSON.stringify(src)), id: `b${widgetId()}` });
  board.name = uniqueName(s, name || `${src.name} copy`);
  board.bands.forEach(band => band.widgets.forEach(w => { w.id = widgetId(); }));
  return touch(s, { boards: [...s.boards, board], activeId: board.id }, now);
}

export function renameBoard(s: BoardStore, id: string, name: string, now = Date.now()): BoardStore {
  const n = name.trim().slice(0, 40);
  if (!n) return s;
  return touch(s, { boards: s.boards.map(b => (b.id === id ? { ...b, name: n } : b)) }, now);
}

/** The last board can't be deleted. */
export function deleteBoard(s: BoardStore, id: string, now = Date.now()): BoardStore {
  if (s.boards.length <= 1 || !s.boards.some(b => b.id === id)) return s;
  const boards = s.boards.filter(b => b.id !== id);
  return touch(s, { boards, activeId: s.activeId === id ? boards[0].id : s.activeId }, now);
}

/** Put a board back to the template it started from (keeps its name and density). */
export function resetBoard(s: BoardStore, id: string, now = Date.now()): BoardStore {
  const b = s.boards.find(x => x.id === id);
  if (!b) return s;
  const fresh = templateBoard(b.template, b.name);
  return replaceBoard(s, { ...fresh, id: b.id, density: b.density }, now);
}

function uniqueName(s: BoardStore, base: string) {
  const names = new Set(s.boards.map(b => b.name.toLowerCase()));
  const clean = base.trim().slice(0, 36) || "My board";
  if (!names.has(clean.toLowerCase())) return clean;
  for (let i = 2; ; i++) if (!names.has(`${clean} ${i}`.toLowerCase())) return `${clean} ${i}`;
}

/** Which of two stored copies to keep (local browser copy vs the account copy): the newer one. */
export const newerStore = (a: BoardStore | null, b: BoardStore | null) => (!a ? b : !b ? a : b.updatedAt > a.updatedAt ? b : a);
