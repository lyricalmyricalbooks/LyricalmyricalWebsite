import { designNumber } from "./designNumber";

// Shop grid "Show more books" (Shopify-style paging). Studio › Style › Shop page heading & filters ›
// `catalogPageSize`: 0 (the default) shows every book, as before.
export const MAX_CATALOG_PAGE_SIZE = 96;

export function catalogPageSize(design: any): number {
  const n = Math.floor(designNumber(design, "catalogPageSize", 0));
  return n > 0 ? Math.min(n, MAX_CATALOG_PAGE_SIZE) : 0;
}

/** How many books to draw: everything when paging is off, else the shown count (at least one page). */
export function visibleCount(total: number, pageSize: number, shown: number): number {
  if (pageSize <= 0) return total;
  return Math.min(total, Math.max(pageSize, shown));
}

/** The next count after pressing Show more. */
export function nextShown(total: number, pageSize: number, shown: number): number {
  return Math.min(total, visibleCount(total, pageSize, shown) + pageSize);
}
