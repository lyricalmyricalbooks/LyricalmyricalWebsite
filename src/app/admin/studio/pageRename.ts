// When a custom page's address changes (Studio › Pages › URL slug), links to the old address would quietly break:
// menu links of type "page" store the slug, and shoppers' bookmarks / search results use /page/<old>.
// Pure helpers: Studio rewrites the draft's menus and adds a URL redirect from the old address.
import { redirectsAfterMove, type Redirect } from "../../features/site/redirects";

type MenuItem = { type?: string; value?: string; children?: MenuItem[]; [k: string]: any };

function renameItems(items: MenuItem[] | undefined, from: string, to: string): MenuItem[] | undefined {
  if (!Array.isArray(items)) return items;
  let changed = false;
  const next = items.map(item => {
    let out = item;
    if (item?.type === "page" && item.value === from) out = { ...out, value: to };
    const kids = renameItems(item?.children, from, to);
    if (kids !== item?.children) out = { ...out, children: kids };
    if (out !== item) changed = true;
    return out;
  });
  return changed ? next : items;
}

/** The menus with every "page" link to `from` pointing at `to`; the same object when nothing links to it. */
export function renamePageInMenus<T extends Record<string, any> | undefined>(menus: T, from: string, to: string): T {
  if (!menus || !from || !to || from === to) return menus;
  let changed = false;
  const next: Record<string, any> = {};
  for (const [key, items] of Object.entries(menus)) {
    const renamed = renameItems(items as MenuItem[], from, to);
    if (renamed !== items) changed = true;
    next[key] = renamed;
  }
  return (changed ? next : menus) as T;
}

/** How many menu links point at a page slug (for the confirmation message). */
export function menuLinksTo(menus: Record<string, any> | undefined, slug: string): number {
  const count = (items: MenuItem[] | undefined): number => (Array.isArray(items) ? items : [])
    .reduce((n, item) => n + (item?.type === "page" && item.value === slug ? 1 : 0) + count(item?.children), 0);
  return Object.values(menus || {}).reduce((n: number, items) => n + count(items as MenuItem[]), 0);
}

/** The redirect list after a page moved from /page/<from> to /page/<to> (see `redirectsAfterMove`). */
export function redirectsAfterRename(list: Redirect[], from: string, to: string): Redirect[] | null {
  if (!from || !to || from === to) return null;
  return redirectsAfterMove(list, `/page/${from}`, `/page/${to}`);
}
