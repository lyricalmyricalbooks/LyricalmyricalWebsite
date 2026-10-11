// Inventory › Inventory app link: pure helpers for the panel and for the stock guards
// (docs/INVENTORY_LINK.md). Links live in admin-read `systemStatus/inventoryLink.links`:
// { [websiteBookId]: { "_" | variantId: inventoryBookId } }.
import { isBundle, isGiftCardProduct } from "../features/site/promotions";

export type InventoryLinks = Record<string, Record<string, string>>;

export interface InventoryAppBook {
  id: string; title: string; author: string; isbn: string; currency: string;
  maxPrint: number | null; onHand: number | null; feedAt: string | null;
}

export interface LinkableEdition {
  key: string; bookId: string; variantId: string | null; title: string; edition: string;
  isbn: string; stock: number; tracked: boolean; archived: boolean;
}

export type Hold = "missing" | "no-feed" | "not-derived" | "untracked" | "untracked-mixed" | "now-has-editions" | "big-change" | null;

export interface StockRow {
  bookId: string; variantId: string | null; inventoryBookId: string; title: string; edition: string;
  from: number | null; to: number | null; hold: Hold; appAhead?: boolean; turnsOnTracking?: boolean;
  appOnHand: number | null; feedAt: string | null; webCopies: number | null; webTotal: number;
}

const DIGITAL_RE = /e-?book|epub|pdf|audiobook|digital/i;
const whole = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));

export const editionKey = (bookId: string, variantId: string | null) => `${bookId}|${variantId || ""}`;

/** The inventory app book a website book/edition is linked to, or null. */
export function linkedTo(links: InventoryLinks | null | undefined, bookId: string, variantId: string | null): string | null {
  const id = links?.[bookId]?.[variantId || "_"];
  return typeof id === "string" && id ? id : null;
}

/** Is this book (or one of its editions, when variantId is omitted) counted by the inventory app? */
export function isStockLinked(links: InventoryLinks | null | undefined, bookId: string, variantId?: string | null): boolean {
  const entry = links?.[bookId];
  if (!entry) return false;
  if (variantId === undefined) return Object.values(entry).some((v) => typeof v === "string" && !!v);
  return !!linkedTo(links, bookId, variantId);
}

const isDigital = (book: any, variant: any) => (variant
  ? variant.digital === true || (variant.format ? DIGITAL_RE.test(String(variant.format)) : book.digital === true || DIGITAL_RE.test(String(book.format || "")))
  : book.digital === true || DIGITAL_RE.test(String(book.format || "")));

/** Every printed website book/edition that can be linked (no e-books, box sets or gift cards). */
export function linkableEditions(books: any[]): LinkableEdition[] {
  const out: LinkableEdition[] = [];
  for (const book of books || []) {
    if (!book?.id || isGiftCardProduct(book) || isBundle(book)) continue;
    const variants = Array.isArray(book.variants) ? book.variants.filter((v: any) => v && v.id) : [];
    const base = { bookId: book.id, title: String(book.title || "Untitled"), tracked: book.trackInventory === true, archived: book.status === "archived" };
    if (variants.length) {
      for (const v of variants) {
        if (isDigital(book, v)) continue;
        out.push({ ...base, key: editionKey(book.id, v.id), variantId: v.id, edition: String(v.name || v.format || "Edition"),
          isbn: String(v.isbn || book.isbn || ""), stock: whole(v.stockLevel !== undefined ? v.stockLevel : v.stock) });
      }
    } else if (!isDigital(book, null)) {
      out.push({ ...base, key: editionKey(book.id, null), variantId: null, edition: "", isbn: String(book.isbn || ""), stock: whole(book.stockLevel) });
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title) || a.edition.localeCompare(b.edition));
}

const isbnDigits = (v: unknown) => String(v || "").replace(/[^0-9Xx]/g, "").toUpperCase();
const norm = (v: unknown) => String(v || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Suggested inventory book per unlinked edition: the same ISBN (10+ digits), else exactly the same
 * title ("Title" for a book without editions, "Title Edition" otherwise). Only a single, unused match
 * is suggested — never a guess between two.
 */
export function suggestLinks(editions: LinkableEdition[], appBooks: InventoryAppBook[], links: InventoryLinks): Record<string, string> {
  const used = new Set(Object.values(links || {}).flatMap((e) => Object.values(e || {})));
  const byIsbn = new Map<string, InventoryAppBook[]>();
  const byTitle = new Map<string, InventoryAppBook[]>();
  for (const b of appBooks || []) {
    const isbn = isbnDigits(b.isbn);
    if (isbn.length >= 10) byIsbn.set(isbn, [...(byIsbn.get(isbn) || []), b]);
    const t = norm(b.title);
    if (t) byTitle.set(t, [...(byTitle.get(t) || []), b]);
  }
  const out: Record<string, string> = {};
  const taken = new Set<string>();
  const pick = (list: InventoryAppBook[] | undefined) => {
    const free = (list || []).filter((b) => !used.has(b.id) && !taken.has(b.id));
    return list && list.length === 1 && free.length === 1 ? free[0].id : null;
  };
  const printedPerBook = new Map<string, number>();
  editions.forEach((e) => printedPerBook.set(e.bookId, (printedPerBook.get(e.bookId) || 0) + 1));
  for (const e of editions) {
    if (linkedTo(links, e.bookId, e.variantId)) continue;
    const isbn = isbnDigits(e.isbn);
    // A book whose only printed edition is this one may carry just the title in the inventory app.
    const onlyPrinted = printedPerBook.get(e.bookId) === 1;
    const id = (isbn.length >= 10 ? pick(byIsbn.get(isbn)) : null)
      || (e.edition ? pick(byTitle.get(norm(`${e.title} ${e.edition}`))) : null)
      || (!e.edition || onlyPrinted ? pick(byTitle.get(norm(e.title))) : null);
    if (id) { out[e.key] = id; taken.add(id); }
  }
  return out;
}

/** The links map to save from a per-edition choice (blank = not linked). */
export function linksFromChoices(editions: LinkableEdition[], choices: Record<string, string>): InventoryLinks {
  const out: InventoryLinks = {};
  for (const e of editions) {
    const id = String(choices[e.key] || "").trim();
    if (!id) continue;
    out[e.bookId] = { ...(out[e.bookId] || {}), [e.variantId || "_"]: id };
  }
  return out;
}

/** Plain words for why a book's stock wasn't (or won't be) changed automatically. */
export function holdWords(row: Pick<StockRow, "hold" | "from" | "to">, { inPreview = false } = {}): string {
  if (inPreview && row.hold === "big-change") return `A big change (${row.from} → ${row.to}). Check it's right before you apply; automatic updates leave changes this big for you.`;
  switch (row.hold) {
    case "missing": return "This book or edition is no longer on the website.";
    case "no-feed": return "The inventory app hasn't shared a count for this book yet. Open the inventory app once.";
    case "not-derived": return "This book has no print run in the inventory app, so its count can't be trusted. Add the print run there.";
    case "untracked": return "Stock counting is off for this book on the website. Applying the preview turns it on.";
    case "big-change": return `A big change (${row.from} → ${row.to}). It waits for you to apply it from the preview.`;
    case "untracked-mixed": return "Stock counting is off for this book, and turning it on would also limit its other editions (e-books, or editions not matched here) to their own counts. Match every printed edition, or turn on Track inventory in the book editor once those editions have counts.";
    case "now-has-editions": return "This book was matched as a whole but is now sold in editions. Match each printed edition instead, then save.";
    default: return "";
  }
}

export type LinkStep = "connect" | "link" | "sales" | "stock" | "running";

/** Which setup step the owner is on. */
export function linkStep(state: any): LinkStep {
  if (state?.connection?.ok !== true) return "connect";
  if (!Object.keys(state?.links || {}).length) return "link";
  if (!state?.startDay || state?.backfill?.done !== true) return "sales";
  if (!state?.firstApplyAt) return "stock";
  return "running";
}

/** Minutes/hours/days since an ISO time, in words ("5 minutes ago"). */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  const t = Date.parse(String(iso || ""));
  if (!Number.isFinite(t)) return "never";
  const minutes = Math.max(0, Math.round((now - t) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** The Google Cloud page where the owner grants the website access to the inventory app. */
export const IAM_URL = "https://console.cloud.google.com/iam-admin/iam?project=lyricalmyrical-37c46";
