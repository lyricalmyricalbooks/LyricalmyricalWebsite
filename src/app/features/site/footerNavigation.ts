import { getCopy } from "./storeCopy";
import { DEFAULT_SOCIAL } from "./constants";
import { type MenuItem } from "./storeMenu";
import { childCategories, normalizeCategories, parentOf } from "./categoryMembership.mjs";

export type FooterGroup = "explore" | "connect";
export function footerGroup(item: MenuItem): FooterGroup {
  return item.footerGroup ?? (/submission|open[-\s]?call|contact|instagram|mailto:|\/track/i.test(`${item.value || ""} ${item.label}`) ? "connect" : "explore");
}

/** A published page linked from the footer: every page in the header menu, plus "footer only" pages
 *  (Studio › Pages › Where the link shows, `showInFooter`). */
export const pageInFooter = (p: any) => !!p && p.status === "published" && !!(p.showInNav || p.showInFooter);

/** Build editable menu records without changing the published page collection. */
export function automaticFooterItems(settings: any, pages: any[]): MenuItem[] {
  const d = settings?.design || {};
  const visible = (pages || []).filter(pageInFooter);
  const items: MenuItem[] = [
    { id: "footer-shop", label: getCopy(d, "footerLinkShop"), type: "home", footerGroup: "explore" },
    { id: "footer-track", label: getCopy(d, "footerLinkTrack"), type: "url", value: "/track", footerGroup: "connect" },
    ...visible.map(p => ({ id: `footer-page-${p.id}`, label: p.title, type: "page" as const, value: p.slug })),
  ];
  const instagram = (d.social ?? DEFAULT_SOCIAL).instagram;
  if (d.showSocialInFooter !== false && instagram) items.push({ id: "footer-instagram", label: getCopy(d, "footerLinkInstagram"), type: "url", value: instagram, footerGroup: "connect" });
  // A contact page already supplies the contact destination; do not repeat it.
  if (!visible.some(p => /^(contact|contact-us)$/i.test(p.slug))) items.push({ id: "footer-contact", label: getCopy(d, "footerLinkContact"), type: "url", value: `mailto:${settings?.info?.email || "lyricalmyricalbooks@gmail.com"}`, footerGroup: "connect" });
  return items;
}

export function groupedFooterItems(items: MenuItem[]) {
  const groups: Record<FooterGroup, MenuItem[]> = { explore: [], connect: [] };
  for (const item of items) {
    if (item.hidden) continue;
    groups[footerGroup(item)].push(item);
  }
  return groups;
}

/** The footer's Collections group (Style › Footer & social links › Show Collections link group, on unless switched off):
 *  every shop category shown in the menu, each sub-category right after its parent, as one flat list (same rhythm as
 *  the other groups), so every page links to every collection. */
export function footerCollectionItems(design: any): MenuItem[] {
  if (design?.showFooterCollections === false) return [];
  const cats = design?.categories;
  const shown = (c: any) => c?.name && c.showInNav !== false;
  const item = (c: any): MenuItem => ({ id: `footer-collection-${c.id}`, label: c.name, type: "collection", value: c.name });
  return normalizeCategories(Array.isArray(cats) ? cats : [])
    .filter((c: any) => shown(c) && !parentOf(c, cats))
    .flatMap((c: any) => [item(c), ...childCategories(c, cats).filter(shown).map(item)]);
}
