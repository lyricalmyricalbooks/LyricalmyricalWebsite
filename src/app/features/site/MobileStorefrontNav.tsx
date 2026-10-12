import { useEffect, useRef } from "react";
import { accountsEnabled } from "./customerAccounts";
import { Link } from "react-router";
import { CurrencySelector } from "../../CurrencyContext";
import { splitNavigation, buildNavItems } from "./navItems";
import { getCopy } from "./storeCopy";
import { ThemeToggle } from "../../components/theme/ThemeToggle";

export function MobileStorefrontNav({ design, pages, onSearch, showThemeToggle = false }: { design: any; pages: any[]; onSearch: () => void; showThemeToggle?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  // A tap or click outside the open menu closes it (like the category drop-downs).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);
  const d = { ...design, ...design?.storefront };
  const close = () => { if (ref.current) ref.current.open = false; };
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  if (d.showMobileNavigation === false) return null;
  const groups = splitNavigation(buildNavItems(d.categories || [], pages, d.navOrder), d);
  const linkClass = "block min-h-11 px-6 py-3 hover:opacity-70";
  return <details ref={ref} className="md:hidden" data-studio-target="style:header|menus:categories|copy:Header" data-studio-label="Mobile navigation"
    onKeyDown={e => { if (e.key === "Escape") { close(); ref.current?.querySelector("summary")?.focus(); } }}>
    <summary className="min-h-11 cursor-pointer px-6 py-3 font-semibold">{getCopy(design, "navMenu")}</summary>
    <nav aria-label={getCopy(design, "ariaMainNavigation")} className="border-t border-current/20 pb-4">
      {groups.primary.map(item => <div key={item.key}>
        <Link className={linkClass} onClick={close} to={item.kind === "page" ? `/page/${item.page.slug}` : `/collections/${slug(item.label)}`}>{item.label}</Link>
        {item.kind === "category" && item.children.filter(c => c.showInNav !== false).map(c => <Link key={c.id} className={`${linkClass} pl-10`} onClick={close} to={`/collections/${slug(c.name)}`}>{c.name}</Link>)}
      </div>)}
      {d.showSecondaryNavigation !== false && groups.secondary.length > 0 && <div role="group" aria-label={getCopy(design, "secondaryNavigationAria")} className="border-t border-current/20" data-studio-target="menus:header-order|style:header|copy:Header" data-studio-label="Publisher navigation">
        {groups.secondary.map(item => item.kind === "page" && <Link key={item.key} className={linkClass} onClick={close} to={`/page/${item.page.slug}`}>{item.label}</Link>)}
      </div>}
      {!d.hideHeaderSearch && <button className={linkClass} onClick={() => { close(); onSearch(); }}>{getCopy(design, "navSearch")}</button>}
      {!d.hideHeaderWishlist && <Link className={linkClass} onClick={close} to="/wishlist">{getCopy(design, "ariaWishlist")}</Link>}
      {!d.hideHeaderAccount && accountsEnabled(design) && <Link className={linkClass} onClick={close} to="/account">{getCopy(design, "ariaAccount")}</Link>}
      {!d.hideCurrencySelector && <div className="px-6 py-3"><CurrencySelector label={getCopy(design, "currencyLabel")} ariaLabel={getCopy(design, "ariaCurrency")} /></div>}
      {showThemeToggle && <div className="px-6 py-3"><ThemeToggle label={getCopy(design, "ariaThemeToggle")} /></div>}
    </nav>
  </details>;
}
