// Copying stock counts from the old shop (Settings › General › Inventory sync). Pure; adminApi.syncInventoryFromLegacy
// reads the old records and the catalog, asks this for the plan, then writes each book in its own transaction.
//
// Rules: a count must be a whole number of 0 or more (a missing, negative, fractional or unreadable record is
// reported, never turned into 0); a book matches on its exact web address or its saved old-shop name — never on
// part of a title; a name that matches two books, or a book that matches two names, is left alone and reported;
// books sold in editions are skipped (their edition counts are what shoppers buy, the sync only knows one number).

export interface LegacyRecord { data?: unknown }

export interface LegacyStockRead { stockMap: Record<string, number>; invalid: { key: string; reason: string }[] }

/** "296" and 296 are counts; anything else is reported. */
export function readLegacyStock(raw: Record<string, LegacyRecord | null | undefined>): LegacyStockRead {
  const stockMap: Record<string, number> = {};
  const invalid: { key: string; reason: string }[] = [];
  for (const [key, record] of Object.entries(raw || {})) {
    let parsed: any;
    try {
      parsed = typeof record?.data === "string" ? JSON.parse(record.data) : record?.data;
    } catch {
      invalid.push({ key, reason: "unreadable record" });
      continue;
    }
    const value = parsed && typeof parsed === "object" ? parsed.stock : undefined;
    const n = typeof value === "string" && /^\s*\d+\s*$/.test(value) ? Number(value) : value;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
      invalid.push({ key, reason: value === undefined ? "no stock count" : "stock is not a whole number of 0 or more" });
      continue;
    }
    stockMap[key] = n;
  }
  return { stockMap, invalid };
}

export interface LegacyMatch { bookId: string; title: string; slug: string; legacyKey: string; stock: number }
export interface LegacySkip { bookId: string; title: string; reason: string }

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

export function planLegacySync(stockMap: Record<string, number>, books: any[]): { matches: LegacyMatch[]; skipped: LegacySkip[]; unmatched: number } {
  const keys = Object.keys(stockMap);
  const keyOf = new Map<string, string[]>();
  for (const k of keys) keyOf.set(norm(k), [...(keyOf.get(norm(k)) || []), k]);
  const candidates = new Map<string, any[]>();
  const found: { book: any; key: string }[] = [];
  const skipped: LegacySkip[] = [];
  let unmatched = 0;
  for (const book of books) {
    const own = [norm(book.legacyInventoryKey), norm(book.slug)].filter(Boolean);
    let key: string | undefined;
    for (const name of own) { const hit = keyOf.get(name); if (hit?.length) { key = hit[0]; break; } }
    if (key === undefined) { unmatched++; continue; }
    found.push({ book, key });
    candidates.set(key, [...(candidates.get(key) || []), book]);
  }
  const matches: LegacyMatch[] = [];
  for (const { book, key } of found) {
    const title = book.title || "Untitled";
    if ((candidates.get(key) || []).length > 1) { skipped.push({ bookId: book.id, title, reason: `shares the old-shop name “${key}” with another book` }); continue; }
    if (Array.isArray(book.variants) && book.variants.length) { skipped.push({ bookId: book.id, title, reason: "sold in editions — set each edition's stock in Inventory" }); continue; }
    matches.push({ bookId: book.id, title, slug: book.slug || "", legacyKey: key, stock: stockMap[key] });
  }
  return { matches, skipped, unmatched };
}
