/** The address of a shop category: `/collections/<slug>`, the same slug the header, sitemap and route use. */
export const collectionSlug = (name: string) => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
export const collectionPath = (name: string) => `/collections/${collectionSlug(name)}`;
/** Every book in the shop ("All" in the category chips). */
export const ALL_BOOKS_PATH = "/collections/all";

/** A plain left click that the page handles itself; modified clicks (new tab/window) follow the link. */
export const plainClick = (e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented?: boolean }) =>
  !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
