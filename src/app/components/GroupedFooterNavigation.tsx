import { FooterMenu } from "./StoreMenu";
import { getCopy } from "../features/site/storeCopy";
import { automaticFooterItems, footerCollectionItems, groupedFooterItems } from "../features/site/footerNavigation";

export function GroupedFooterNavigation({ settings, pages }: { settings: any; pages: any[] }) {
  const d = settings?.design || {};
  const custom = d.menus?.footer?.length > 0;
  const groups = { collections: footerCollectionItems(d), ...groupedFooterItems(custom ? d.menus.footer : automaticFooterItems(settings, pages)) };
  const copyKeys: Record<string, string> = custom ? {} : { "footer-shop": "footerLinkShop", "footer-track": "footerLinkTrack", "footer-instagram": "footerLinkInstagram", "footer-contact": "footerLinkContact" };
  const heading = { collections: "footerCollectionsHeading", explore: "footerExploreHeading", connect: "footerConnectHeading" } as const;
  return <>
    {(["collections", "explore", "connect"] as const).map(group => {
      // Collections are already left out when switched off (footerCollectionItems).
      const visible = group === "explore" ? d.showFooterExplore !== false : group === "connect" ? d.showFooterConnect !== false : true;
      const copyKey = heading[group];
      if (!visible || !groups[group].length) return null;
      return <nav key={group} aria-label={getCopy(d, copyKey)} className="min-w-0 sm:min-w-[10rem] grid grid-rows-subgrid row-span-2 content-start"
        data-studio-target={group === "collections" ? "menus:categories|copy:Footer|style:footer" : "menus:footer|copy:Footer|style:footer"} data-studio-label={group === "collections" ? "Footer collections" : "Footer navigation groups"}>
        <p className="fm-footer-heading text-white/55 text-[9px] uppercase tracking-[0.3em] mb-5"><span data-studio-copy={copyKey}>{getCopy(d, copyKey)}</span></p>
        <div className="fm-footer-list break-words"><FooterMenu items={groups[group]} copyKeys={group === "collections" ? {} : copyKeys} /></div>
      </nav>;
    })}
  </>;
}
