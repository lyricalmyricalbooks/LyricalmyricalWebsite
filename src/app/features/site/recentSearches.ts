import { cleanSearchTerm } from "../../lib/analyticsKeys";

const KEY = "fm_recent_searches_v1";
export const MAX_RECENT_SEARCHES = 5;

/** The new list after a search: newest first, no repeats (any capitalisation), personal-looking terms dropped. */
export function addRecentSearch(list: string[], raw: string, max = MAX_RECENT_SEARCHES): string[] {
  const term = cleanSearchTerm(raw);
  if (!term) return list;
  return [term, ...list.filter(t => t.toLowerCase() !== term)].slice(0, max);
}

export function readRecentSearches(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    // Valid JSON that isn't a list of words must not break the search box.
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string").slice(0, MAX_RECENT_SEARCHES) : [];
  } catch {
    return [];
  }
}

export function writeRecentSearches(list: string[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_RECENT_SEARCHES)));
    else localStorage.removeItem(KEY);
  } catch {}
}
