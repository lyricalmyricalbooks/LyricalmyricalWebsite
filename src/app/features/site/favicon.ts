import { layerDesign } from "./designModel";

/** The tab icon chosen in Studio › Style › Favicon (the shop's "All pages" value, else the catalog page's). */
export function faviconFor(design: any): string {
  const url = layerDesign(design || {}, design?.storefront)?.faviconUrl;
  return typeof url === "string" ? url.trim() : "";
}

/**
 * Puts the shop's favicon on the current document. Every storefront page calls this (through
 * useSiteData, and Checkout), so a page opened directly — e.g. Track order from an email link —
 * shows the icon too, not only the home page.
 */
export function applyFavicon(design: any, doc: Document | undefined = typeof document === "undefined" ? undefined : document) {
  const url = faviconFor(design);
  if (!doc || !url) return;
  let link = doc.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
  if (!link) {
    link = doc.createElement("link");
    link.rel = "icon";
    doc.head.appendChild(link);
  }
  if (link.getAttribute("href") !== url) link.setAttribute("href", url);
}
