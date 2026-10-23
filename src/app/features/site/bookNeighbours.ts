import { applyCatalogControls } from "./CatalogControls";
import { getFilteredItems, getPublishedBooks } from "./selectors";

export type BookNeighbours<T> = { prev?: T; next?: T };

/** Previous / next book links on book pages (Studio › Style › Book page · photos & layout › showPdpBookNav, off by
 *  default). Follows the shop grid's own starting order (Featured: Admin › Books › Shop order, then newest) and the
 *  "sold-out books last" switch, inside the book's shop category when it has one (the breadcrumb's), else the whole
 *  shop. No wrapping: the first book has no "previous", the last no "next". A book not in that list gets neither. */
export function bookNeighbours<T extends { id: string }>(
  book: T | undefined,
  books: T[] | undefined,
  opts: { category?: any; categories?: any[]; soldOutLast?: boolean; now?: string } = {},
): BookNeighbours<T> {
  if (!book || !Array.isArray(books)) return {};
  const pool = opts.category
    ? getFilteredItems(books as any, opts.category, opts.now || new Date().toISOString(), opts.categories || [])
    : getPublishedBooks(books as any);
  const list = applyCatalogControls(pool, "", "featured", false, [-Infinity, Infinity], [], false, opts.soldOutLast === true) as T[];
  const at = list.findIndex(b => b.id === book.id);
  if (at < 0) return {};
  return { prev: list[at - 1], next: list[at + 1] };
}

/** The address a book card links to (the product page resolves ids when a book has no slug). */
export function bookLinkSlug(book: any): string {
  return String(book?.slug || book?.id || "");
}
