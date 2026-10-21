// What the search drawer shows besides the book list (concept A "Catalogue index", 21 October 2026):
// matching artists and shop categories while typing, "New in the shop" and category counts before
// typing, the stock word on each result, and which letters to mark as matched. Pure, so the drawer
// and its tests agree.
import { bookInCategory, normalizeCategories, parentOf } from "./categoryMembership.mjs";
import { bookDateMs } from "./merchandising";
import { normalizeSearch } from "./bookSearch";
import { bookCreators } from "../../lib/bookSeo";
import { comingSoonActive } from "./comingSoon";
import { preorderActive } from "./preorder";
import { bookInStock } from "./CatalogControls";

type Book = any;

/** The credit line under a result title: the editor's "Author / contributors" box, else the legacy author. */
export const creditLine = (book: Book): string => String(book?.subtitle || book?.authorName || "").trim();

/** Every query word matches the text (accents and case ignored), like the book matcher. */
function matchesAll(text: string, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return false;
  const hay = normalizeSearch(text);
  return q.split(" ").every(t => hay.includes(t));
}

export type ArtistMatch = { name: string; count: number };

/** People credited on live books whose name matches, most books first, then A–Z. */
export function matchingArtists(books: Book[], query: string, limit = 6): ArtistMatch[] {
  const counts = new Map<string, ArtistMatch>();
  for (const book of books || []) {
    for (const name of bookCreators(book)) {
      const key = normalizeSearch(name);
      if (!key) continue;
      const seen = counts.get(key);
      if (seen) seen.count += 1;
      else counts.set(key, { name, count: 1 });
    }
  }
  return [...counts.values()]
    .filter(a => matchesAll(a.name, query))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export type CategoryCount = { category: any; name: string; count: number; child: boolean };

/** Shop categories shoppers can see (Studio › Menus › Shop categories), parents before their children, with book counts. */
export function visibleCategoryCounts(categories: any[], books: Book[]): CategoryCount[] {
  const all = normalizeCategories(categories || []);
  const visible = all.filter((c: any) => c.showInNav !== false && c.name && c.name !== "PUBLICATIONS");
  const out: CategoryCount[] = [];
  const add = (c: any) => out.push({
    category: c,
    name: c.name,
    count: (books || []).filter(b => bookInCategory(b, c, all)).length,
    child: !!parentOf(c, all),
  });
  for (const c of visible) {
    if (parentOf(c, all)) continue;
    add(c);
    for (const k of visible) if (parentOf(k, all) === c.id) add(k);
  }
  // Sub-categories whose parent is hidden still show.
  for (const c of visible) if (!out.some(o => o.category.id === c.id)) add(c);
  return out;
}

/** Categories whose name matches the query. */
export function matchingCategories(categories: any[], books: Book[], query: string, limit = 6): CategoryCount[] {
  return visibleCategoryCounts(categories, books).filter(c => matchesAll(c.name, query)).slice(0, limit);
}

/** The newest live books (publication date, then release date, then when added). */
export function newestBooks(books: Book[], limit = 4): Book[] {
  return (books || [])
    .map((book, index) => ({ book, index, at: bookDateMs(book) }))
    .sort((a, b) => b.at - a.at || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map(x => x.book);
}

export type StockState = "soon" | "preorder" | "out" | "low" | "in";

/** The stock word on a result row, the same order the product page decides it in. */
export function stockState(book: Book, lowAt = 5): { state: StockState; count: number } {
  if (comingSoonActive(book)) return { state: "soon", count: 0 };
  if (preorderActive(book)) return { state: "preorder", count: 0 };
  if (!bookInStock(book)) return { state: "out", count: 0 };
  const level = Number(book?.stockLevel);
  const tracked = book?.trackInventory === true && !(Array.isArray(book?.variants) && book.variants.length);
  if (tracked && Number.isFinite(level) && level > 0 && level !== 999 && lowAt > 0 && level <= lowAt) return { state: "low", count: level };
  return { state: "in", count: 0 };
}

export type MarkPart = { text: string; mark: boolean };

const fold = (ch: string) => {
  const f = ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return f.length === 1 ? f : ch.toLowerCase().slice(0, 1) || ch;
};

/** Splits text into plain and matched parts: every place a query word appears (accents and case ignored). */
export function markMatches(text: string, query: string): MarkPart[] {
  const source = String(text ?? "");
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  if (!source || !words.length) return source ? [{ text: source, mark: false }] : [];
  const chars = [...source];
  const folded = chars.map(fold).join("");
  const marked = new Array(chars.length).fill(false);
  for (const word of words) {
    let at = folded.indexOf(word);
    while (at !== -1) {
      for (let i = at; i < at + word.length; i++) marked[i] = true;
      at = folded.indexOf(word, at + word.length);
    }
  }
  const parts: MarkPart[] = [];
  chars.forEach((ch, i) => {
    const last = parts[parts.length - 1];
    if (last && last.mark === marked[i]) last.text += ch;
    else parts.push({ text: ch, mark: marked[i] });
  });
  return parts;
}
