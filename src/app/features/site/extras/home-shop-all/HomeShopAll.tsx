import { Link } from "react-router";
import { getCopy } from "../../storeCopy";
import { regionProps } from "../../storefrontRegions";
import { ALL_BOOKS_PATH } from "../../collectionPath";

/** Style › Show or hide whole features › “Shop all books” link (on unless switched off). */
export const homeShopAllOn = (design: any) => design?.showHomeShopAll !== false;

/**
 * One quiet link under the home page sections to every book in the shop, so each book is two clicks from home
 * (and crawlers reach the whole catalogue from the home page) even when the sections feature only a few.
 */
export function HomeShopAll({ design }: { design: any }) {
  const words = String(getCopy(design, "homeShopAll") ?? "").trim();
  if (!homeShopAllOn(design) || !words) return null;
  const region = regionProps("homeShopAll");
  return (
    <div {...region} data-studio-target={`${region["data-studio-target"]}|style:elements`}
      className="fm-home-shop-all flex justify-center px-6 py-14 md:py-20">
      <Link to={ALL_BOOKS_PATH} className="text-[11px] font-bold uppercase tracking-[0.2em] underline underline-offset-4 decoration-1 hover:decoration-2">
        <span data-studio-copy="homeShopAll">{words}</span>
      </Link>
    </div>
  );
}
