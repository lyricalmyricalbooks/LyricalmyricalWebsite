import { type CSSProperties, type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { Heart, Search, ShoppingCart, User as UserIcon } from "lucide-react";
import { useCart } from "../../CartContext";
import { CurrencySelector, useCurrency } from "../../CurrencyContext";
import { LogoMark } from "../../components/LogoMark";
import { StoreMenu } from "../../components/StoreMenu";
import { ThemeToggle } from "../../components/theme/ThemeToggle";
import { liveWishlistCount, useWishlist } from "../../lib/wishlist";
import { accountsEnabled } from "./customerAccounts";
import { layerDesign } from "./designModel";
import { contentMaxWidth, navLineProps, navLinkStyle, ownNavLinkStyle, useNavBelow, useNavFit } from "./headerNav";
import { PHONE_MAX } from "./breakpoints";
import { isLiveBook } from "./liveBook";
import { MobileStorefrontNav } from "./MobileStorefrontNav";
import { NavDropdown, type NavDropdownEntry } from "./NavDropdown";
import { buildNavItems, childCategories, parentOf, referenceNavCategories, splitNavigation, usesReferenceHeader, type NavItem } from "./navItems";
import { SearchOverlay } from "./SearchOverlay";
import { SecondaryStorefrontNav } from "./SecondaryStorefrontNav";
import { getPublishedBooks } from "./selectors";
import { getCopy } from "./storeCopy";
import { useStudioOverlay } from "./studioOverlay";
import { activeAnnouncements } from "./sectionGroups";
import { GroupSections } from "../../components/sectionRender";
import { PopupSections } from "./PopupSections";
import type { Book, Page } from "./types";

/*
 * The one storefront header (Studio 2.0 · 2.1). Every public page renders it — checkout keeps its own
 * minimal header. Two modes share one implementation (announcement bar, category bar, drop-downs,
 * icons, phone menu, publisher row, search pop-over):
 *   - "shop" (MainSite: home, catalog, collections): category links pick a category in place, the logo
 *     returns Home, and the catalog's header options apply (masthead layout, logo alignment, sticker pills,
 *     transparent header, scrolling announcement, wishlist count, light/dark toggle).
 *   - "page" (product, custom pages, wishlist, account, tracking, 404): category links go to
 *     /collections/<slug> and the logo links home.
 * Every element id, class and Studio hook (data-studio-target / -label / -copy / -style-text,
 * data-section, data-hdr-fixed) is the one each surface rendered before the merge;
 * storeChrome.parity.test.tsx guards that.
 */

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// ── Sticker-pill navigation (navStyle: "stickers", shop mode) ────────────────────────────────────────
// Asymmetric radius, slight per-pill rotation, hover straighten + scale and a cycling active palette.
const STICKER_ROTATIONS = [-2, 1.5, 2, -1, 1, -1.5];
const STICKER_ACTIVE_COLORS = [
  { bg: "var(--accent, #e8402a)", text: "var(--on-accent, #ffffff)" },
  { bg: "var(--success, #34d399)", text: "var(--on-success, #04150f)" },
  { bg: "var(--warning, #f5b942)", text: "var(--on-accent, #2b1a05)" },
  { bg: "var(--danger, #fb7185)", text: "var(--on-accent, #2b0810)" },
];
const STICKER_PILL_CSS =
  ".fm-sticker-pill{transition:all .2s ease}.fm-sticker-pill:hover{transform:rotate(0deg) scale(1.08)!important;opacity:1!important}";

function stickerPillStyle(design: any, index: number, active = false): CSSProperties {
  const rotate = design?.navPillRotate === false ? 0 : STICKER_ROTATIONS[index % STICKER_ROTATIONS.length];
  const activeColors = design?.navPillActivePalette === false
    ? STICKER_ACTIVE_COLORS[0]
    : STICKER_ACTIVE_COLORS[index % STICKER_ACTIVE_COLORS.length];
  return {
    borderRadius: design?.navPillRadius || "14px 4px 14px 4px",
    transform: `rotate(${rotate}deg)`,
    padding: "0.5rem 1.05rem",
    fontWeight: 700,
    ...(active ? { backgroundColor: activeColors.bg, color: activeColors.text, opacity: 1 } : {}),
  };
}

/** What the shop (MainSite) passes: its active canvas and the in-page category selection. */
export type ShopHeaderContext = {
  /** Tokens of the active canvas (`resolveMainDesign`). */
  surface: any;
  /** Home canvas tokens — its header-link switches apply while Home is showing. */
  hero: any;
  logoDesign: any;
  logoPosition: string;
  /** The shop's category list (objects), the selected one and how to select another. */
  categories: any[];
  activeCategory: any;
  onPickCategory: (category: any) => void;
  /** Logo / masthead click: back to Home. */
  onHome: () => void;
  showCatalog: boolean;
  /** Fallback announcement (Settings › announcements) and site name (masthead fallback). */
  announcement?: string;
  siteName?: string;
};

type Target = NavDropdownEntry & { active: boolean };

/** One category-bar link: a route (page mode, custom pages) or an in-page category pick (shop mode). */
function NavEntry({ target, style, className }: { target: Target; style: CSSProperties; className: string }) {
  return target.to != null ? (
    <Link to={target.to} aria-current={target.active ? "page" : undefined} style={style} className={className}>{target.label}</Link>
  ) : (
    <button onClick={target.onSelect} aria-current={target.active ? "true" : undefined} style={style} className={className}>{target.label}</button>
  );
}

/** The desktop category bar: categories, drop-downs for sub-categories, and in-menu pages. */
function CategoryBar({ navRef, items, design, copyDesign, color, line, stickers, pageTarget, categoryTarget, childTarget }: {
  navRef: RefObject<HTMLElement | null>;
  items: NavItem[];
  design: any;
  copyDesign: any;
  color: string;
  line: { className: string; style: CSSProperties };
  stickers: boolean;
  pageTarget: (item: NavItem & { kind: "page" }) => Target;
  categoryTarget: (item: NavItem & { kind: "category" }) => Target;
  childTarget: (child: any) => Target;
}) {
  const linkClass = `transition-all hover:!opacity-100 hover-text-accent ${stickers ? "fm-sticker-pill" : ""}`;
  return (
    <nav
      ref={navRef}
      aria-label={getCopy(copyDesign, "ariaMainNavigation")}
      data-studio-target="menus:header-order|menus:categories|style:navlinks"
      data-studio-label="Category bar"
      className={`hidden shrink-0 items-center md:flex ${line.className} ${stickers ? "gap-2" : ""}`}
      style={stickers ? { ["--nav-fit" as any]: (line.style as any)["--nav-fit"] } : line.style}
    >
      {items.map((item, index) => {
        if (item.kind === "page") {
          const target = pageTarget(item);
          return <NavEntry key={item.key} target={target} className={linkClass}
            style={{ ...navLinkStyle(design, target.active, color), ...(stickers ? stickerPillStyle(design, index) : {}) }} />;
        }
        const own = categoryTarget(item);
        const subs = item.children || [];
        // Sub-categories (Studio › Menus › Shop categories › "Sits under") → a drop-down,
        // or their own links when Style › Navigation links › "no drop-down" is on.
        if (subs.length > 0 && design?.navFlatSubcategories) {
          return [own, ...subs.map(childTarget)].map((target) => (
            <NavEntry key={target.key} target={target} className={linkClass}
              style={{ ...navLinkStyle(design, target.active, color), ...(stickers ? stickerPillStyle(design, index, target.active) : {}) }} />
          ));
        }
        if (subs.length > 0) {
          const entries = subs.map(childTarget);
          const branchActive = own.active || entries.some((entry) => entry.active);
          return (
            <NavDropdown
              key={item.key}
              design={design}
              copyDesign={copyDesign}
              label={item.label}
              linkStyle={{ ...navLinkStyle(design, branchActive, color), ...(stickers ? stickerPillStyle(design, index, branchActive) : {}) }}
              className={linkClass}
              all={{ ...own, key: `${item.key}:all` }}
              entries={entries}
            />
          );
        }
        return <NavEntry key={item.key} target={own} className={linkClass}
          style={{ ...navLinkStyle(design, own.active, color), ...(stickers ? stickerPillStyle(design, index, own.active) : {}) }} />;
      })}
    </nav>
  );
}

/** One announcement message: plain text, or a link when the message has one. */
function AnnouncementMessage({ text, link, editable, className }: { text: string; link?: string; editable?: boolean; className?: string }) {
  const edit = editable ? { "data-studio-style-text": "announcementText", "data-studio-edit-value": text } : {};
  if (!link) return <span {...edit} className={className}>{text}</span>;
  if (/^(https?:|mailto:)/i.test(link)) return <a href={link} {...edit} className={`${className || ""} underline-offset-4 hover:underline`}>{text}</a>;
  return <Link to={link} {...edit} className={`${className || ""} underline-offset-4 hover:underline`}>{text}</Link>;
}

/** Cycles through several messages (Style › Header & announcement bar › Seconds each message shows); pauses on hover/focus. */
function useRotation(count: number, seconds: number) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => { setIndex(0); }, [count]);
  useEffect(() => {
    if (count < 2 || paused) return;
    const timer = window.setInterval(() => setIndex(i => (i + 1) % count), Math.max(2, Math.min(20, seconds)) * 1000);
    return () => window.clearInterval(timer);
  }, [count, seconds, paused]);
  const pause = { onMouseEnter: () => setPaused(true), onMouseLeave: () => setPaused(false), onFocus: () => setPaused(true), onBlur: () => setPaused(false) };
  return { index: count ? index % count : 0, pause };
}

/**
 * The promo strip above the header (Style › Header & announcement bar). Its messages come from
 * Announcement messages (several, each with an optional link and show-from / show-until days) or, when
 * that list is empty, the single Announcement text — `fallback` is Settings › announcements.
 */
function AnnouncementBar({ design, show, fallback, shop }: { design: any; show: boolean; fallback?: string; shop: boolean }) {
  const messages = show ? activeAnnouncements({ ...design, announcementText: design?.announcementText ?? fallback }) : [];
  const single = !Array.isArray(design?.announcements) || !design.announcements.length;
  const { index, pause } = useRotation(messages.length, Number(design?.announcementRotateSeconds ?? 5));
  if (!messages.length) return null;
  const current = messages[index];
  if (!shop) {
    return (
      <div
        data-studio-target="style:header"
        data-studio-label="Announcement bar"
        className="fm-announce px-6 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.3em]"
        style={{ backgroundColor: design.announcementBg || "var(--accent)", color: design.announcementColor || "var(--on-accent)" }}
        {...pause}
      >
        <AnnouncementMessage key={index} text={current.text} link={current.link} editable={single} />
      </div>
    );
  }
  const colors = { backgroundColor: design?.announcementBg || "#e8402a", color: design?.announcementColor || "#100f0d" };
  if (design?.announcementScrolling) {
    return (
      <div data-section="announcements" data-studio-target="style:header" data-studio-label="Announcement bar" className="fm-announce overflow-hidden py-2.5 sticky top-0 z-[60]" style={colors}>
        <div
          className="flex w-max animate-marquee font-bold uppercase"
          style={{
            ["--marquee-duration" as any]: `${Math.max(5, Math.min(120, design?.announcementSpeed ?? 24))}s`,
            fontSize: design?.announcementFontSize ?? 10,
            fontWeight: design?.announcementWeight ?? 700,
            letterSpacing: `${design?.announcementTracking ?? 0.3}em`,
          }}
        >
          {[0, 1].map((copy) => single ? (
            // One message: the ticker's original markup (both copies carry the inline-edit value).
            <span key={copy} aria-hidden={copy === 1} data-studio-style-text={copy === 0 ? "announcementText" : undefined} data-studio-edit-value={current.text} className="px-8 whitespace-nowrap">
              {Array.from({ length: 4 }).map(() => current.text).join("        ")}
            </span>
          ) : (
            <span key={copy} aria-hidden={copy === 1} className="px-8 whitespace-nowrap">
              {Array.from({ length: 2 }).flatMap((_, round) => messages.map((m, i) => (
                <AnnouncementMessage key={`${round}-${i}`} text={m.text} link={copy === 0 ? m.link : undefined} className="px-8" />
              )))}
            </span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div data-section="announcements" data-studio-target="style:header" data-studio-label="Announcement bar" className="fm-announce text-center py-2.5 px-6 text-[10px] tracking-[0.3em] font-bold uppercase sticky top-0 z-[60]" style={colors} {...pause}>
      <AnnouncementMessage key={index} text={current.text} link={current.link} editable={single} />
    </div>
  );
}

/**
 * Search, wishlist, account, currency, admin link and the bag button (each has its own hide switch).
 * `flags` holds the hide switches (page mode reads them from the layered storefront design, shop mode
 * from the site design); `copyDesign` holds Text & labels and the customer-accounts switch.
 */
function HeaderActions({ flags, copyDesign, color, shop, onSearch, wishlistCount, showAdmin, cartButton }: {
  flags: any;
  copyDesign: any;
  color: string;
  shop: boolean;
  onSearch: () => void;
  wishlistCount: number;
  showAdmin: boolean;
  cartButton: ReactNode;
}) {
  const tint = shop ? { color } : undefined;
  const hoverBg = shop ? " hover:bg-white/5" : "";
  return (
    <>
      {!flags?.hideHeaderSearch && (
        <button onClick={onSearch} aria-label={getCopy(copyDesign, "ariaSearch")} style={tint} className={`flex min-h-11 min-w-11 items-center justify-center rounded-full opacity-80 transition-all hover:opacity-100${hoverBg}`}>
          <Search size={14} />
        </button>
      )}
      {!flags?.hideHeaderWishlist && (
        <Link to="/wishlist" aria-label={getCopy(copyDesign, "ariaWishlist")} style={tint} className={`${shop ? "relative " : ""}hidden h-9 w-9 items-center justify-center rounded-full opacity-50 transition-all hover:opacity-100 sm:flex${hoverBg}`}>
          <Heart size={14} />
          {shop && wishlistCount > 0 && (
            <span className="absolute -top-1 -right-1 text-[8px] font-bold text-white rounded-full px-1.5 py-0.5" style={{ backgroundColor: "var(--accent)" }}>
              {wishlistCount}
            </span>
          )}
        </Link>
      )}
      {!flags?.hideHeaderAccount && accountsEnabled(copyDesign) && (
        <Link to="/account" aria-label={getCopy(copyDesign, "ariaAccount")} style={tint} className={shop
          ? "flex items-center justify-center min-w-11 min-h-11 rounded-full hover:bg-white/5 transition-all opacity-80 hover:opacity-100"
          : "hidden h-9 w-9 items-center justify-center rounded-full opacity-50 transition-all hover:opacity-100 sm:flex"}>
          <UserIcon size={14} />
        </Link>
      )}
      {(!flags?.hideCurrencySelector || (shop && !flags?.hideThemeToggle)) && (
        <div className="hidden items-center justify-center gap-2 sm:flex">
          {!flags?.hideCurrencySelector && <CurrencySelector label={getCopy(copyDesign, "currencyLabel")} ariaLabel={getCopy(copyDesign, "ariaCurrency")} />}
          {shop && !flags?.hideThemeToggle && <ThemeToggle label={getCopy(copyDesign, "ariaThemeToggle")} />}
        </div>
      )}
      {showAdmin && (
        <Link to="/admin" style={tint} className="mr-2 hidden items-center gap-1.5 whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.2em] opacity-30 transition-all hover:opacity-100 sm:flex">
          <span data-studio-copy="navAdmin">{getCopy(copyDesign, "navAdmin")}</span>
        </Link>
      )}
      {cartButton}
    </>
  );
}

/** The header everywhere except checkout. Without `shop` it is the standalone-page header. */
export function StoreHeader({ design, pages, books, shop }: { design: any; pages: Page[]; books: Book[]; shop?: ShopHeaderContext }) {
  const [searchOpen, setSearchOpen] = useState(false);
  useStudioOverlay("search", setSearchOpen);
  const shopMode = !!shop;
  // Ctrl/⌘+K opens search on the shop pages.
  useEffect(() => {
    if (!shopMode) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shopMode]);
  const openSearch = () => setSearchOpen(true);
  const searchBooks = useMemo(() => (shopMode ? getPublishedBooks(books) : books), [shopMode, books]);
  return (
    <>
      {shop
        ? <ShopHeader design={design} pages={pages} books={books} shop={shop} onSearch={openSearch} />
        : <PageHeader design={design} pages={pages} onSearch={openSearch} />}
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} books={searchBooks} design={shop ? shop.surface : design} />
      {/* Section groups shown on every page: under the header, and the pop-up (Studio › Page layout). */}
      <GroupSections design={design} group="headerSections" books={searchBooks} />
      <PopupSections design={design} books={searchBooks} />
    </>
  );
}

/** Product, custom-page, wishlist, account, tracking and 404 header: routed category links. */
function PageHeader({ design, pages, onSearch }: { design: any; pages: Page[]; onSearch: () => void }) {
  const location = useLocation();
  const { cartCount, setIsCartOpen } = useCart();
  const storefront = layerDesign(design, design?.storefront);
  const categories = storefront.categories || design?.categories || [];
  const navItems = useMemo(
    () => buildNavItems(categories, pages, storefront.navOrder),
    [categories, pages, storefront.navOrder],
  );
  const headerColor = storefront.headerColor || storefront.textColor || "var(--text)";
  const headerBg = storefront.headerBg || storefront.backgroundColor || "var(--background)";
  const maxWidth = contentMaxWidth(storefront);
  const showAdmin = !storefront.hideAdminLink && (storefront.headerLinks?.showSys ?? true);

  const rowRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const navBelow = useNavBelow(storefront, rowRef, navRef);
  const navFit = useNavFit(storefront, navRef, navBelow);
  const line = navLineProps(storefront, navBelow, navFit);
  const routed = (to: string, label: string, key: string): Target => ({ key, label, to, active: location.pathname.endsWith(to) });
  const navBar = (
    <CategoryBar
      navRef={navRef}
      items={splitNavigation(navItems, storefront).primary}
      design={storefront}
      copyDesign={design}
      color={headerColor}
      line={line}
      stickers={false}
      pageTarget={(item) => routed(`/page/${item.page.slug}`, item.label, item.key)}
      categoryTarget={(item) => routed(`/collections/${slugify(item.label)}`, item.label, item.key)}
      childTarget={(k) => routed(`/collections/${slugify(k.name)}`, k.name, `cat:${k.id}`)}
    />
  );

  return (
    <>
      <AnnouncementBar design={storefront} show={storefront.showAnnouncement ?? false} shop={false} />
      <header
        data-section="navigation"
        data-studio-target="style:header|menus:header-order|copy:Header"
        data-studio-label="Header"
        className={`${storefront.stickyHeader ?? true ? "sticky top-0" : "relative"} z-50`}
        style={{ backgroundColor: headerBg, color: headerColor }}
      >
        <div ref={rowRef} className="fm-hdr-row mx-auto flex flex-nowrap items-center justify-between gap-4 px-6 py-4" style={{ maxWidth, color: headerColor }}>
          <div className="flex min-w-0 flex-1 items-center gap-8 md:gap-12">
            <Link to="/" data-hdr-fixed className="flex shrink-0 items-center" aria-label={getCopy(design, "logoAlt")}>
              <span data-studio-target="style:logo" data-studio-label="Logo"><LogoMark design={storefront} /></span>
            </Link>
            {!navBelow && navBar}
          </div>
          <div data-hdr-fixed className="flex shrink-0 flex-nowrap items-center justify-end gap-2 sm:gap-6 md:gap-8" data-studio-target="style:header|copy:Header" data-studio-label="Header icons & cart">
            {storefront.menus?.header?.length > 0 && <div className="mr-2"><StoreMenu items={storefront.menus.header} design={storefront} /></div>}
            <HeaderActions
              flags={storefront}
              copyDesign={design}
              color={headerColor}
              shop={false}
              onSearch={onSearch}
              wishlistCount={0}
              showAdmin={showAdmin}
              cartButton={!storefront.hideCartButton && (
                <button
                  onClick={() => setIsCartOpen(true)}
                  aria-label={getCopy(design, "ariaCart")}
                  className="fm-hdr-cart store-btn-primary group flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-2 transition-all hover:scale-[1.02]"
                  style={{ backgroundColor: storefront.buttonColor || "var(--accent)", color: storefront.buttonTextColor || "var(--on-accent)" }}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">{storefront.cartLabel || getCopy(design, "cartLabel")}</span>
                  {cartCount > 0 && (
                    <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: storefront.buttonTextColor || "var(--on-accent)", color: storefront.buttonColor || "var(--accent)" }}>{cartCount}</span>
                  )}
                </button>
              )}
            />
          </div>
        </div>
        {navBelow && (
          <div style={{ color: headerColor }}>
            <div className="mx-auto px-6" style={{ maxWidth }}>{navBar}</div>
          </div>
        )}
        <MobileStorefrontNav design={design} pages={pages} onSearch={onSearch} />
        <SecondaryStorefrontNav design={design} pages={pages} />
      </header>
    </>
  );
}

/** Home / catalog / collection header (MainSite): in-page category selection and the catalog's options. */
function ShopHeader({ design, pages, books, shop, onSearch }: { design: any; pages: Page[]; books: Book[]; shop: ShopHeaderContext; onSearch: () => void }) {
  const { cartCount, cartTotal, setIsCartOpen } = useCart();
  const { formatPrice } = useCurrency();
  const { ids: wishedIds } = useWishlist();
  const wishlistCount = liveWishlistCount(wishedIds, books, isLiveBook);
  const location = useLocation();
  const sf = shop.surface;
  const { categories, activeCategory, onPickCategory: pick, onHome, showCatalog } = shop;

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Categories and in-menu pages share one header bar; Studio › Menus › Header bar order sets the sequence.
  const navOrder = design?.navOrder || sf?.navOrder;
  const navItems = useMemo(() => buildNavItems(categories, pages || [], navOrder), [categories, pages, navOrder]);
  const headerRowRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const navBelow = useNavBelow(sf, headerRowRef, navRef);
  const navFit = useNavFit(sf, navRef, navBelow);
  const line = navLineProps(sf, navBelow, navFit);

  const isHeaderTransparent = sf?.transparentHeader && !scrolled;
  const headerLinks = (showCatalog ? sf?.headerLinks : shop.hero?.headerLinks) || {};
  const showBag = !design?.hideCartButton && (headerLinks.showBag ?? true);
  const showSys = !design?.hideAdminLink && (headerLinks.showSys ?? true);
  const storefrontBg = sf?.backgroundColor || "#000000";
  const storefrontText = sf?.textColor || "#ffffff";
  const storefrontAccent = sf?.primaryColor || "#e8402a";
  const buttonBg = sf?.buttonColor || storefrontAccent;
  const buttonText = sf?.buttonTextColor || "#100f0d";
  const maxWidth = contentMaxWidth(sf);
  // Default legacy storefronts into the "reference" masthead layout unless the catalog is "modern".
  const isReferenceCatalog = usesReferenceHeader(sf);
  const headerRuleWidth = Math.max(0, Math.min(8, sf?.catalogHeaderRuleWidth ?? (isReferenceCatalog ? 4 : 1)));
  const headerMaxWidth = Math.max(900, Math.min(1800, sf?.catalogHeaderWidth ?? maxWidth));
  const mastheadDesktop = Math.max(28, Math.min(96, sf?.catalogMastheadDesktop ?? 58));
  const mastheadMobile = Math.max(24, Math.min(72, sf?.catalogMastheadMobile ?? 38));
  // Catalog layout › "Nav spacing (desktop)" first, then Navigation links › "Space between links" (the inspector's Layout tab).
  const navGapDesktop = Math.max(4, Math.min(80, sf?.catalogNavGapDesktop ?? sf?.navGap ?? 40));
  const navGapMobile = Math.max(8, Math.min(48, sf?.catalogNavGapMobile ?? 18));
  const cartPlacement = sf?.catalogCartPlacement || "top-right";
  // Logo & wordmark › "Text logo" and "Logo / wordmark color" reach the Reference masthead too.
  const mastheadText = sf?.catalogMastheadText ?? (sf?.logoText || shop.siteName || getCopy(design, "siteName"));
  const buttonRadius = Math.max(0, Math.min(999, sf?.buttonRadius ?? 999));
  const buttonStyle = sf?.buttonStyle || "solid";
  const buttonUppercase = sf?.buttonUppercase ?? true;
  const buttonShadow = sf?.buttonShadow ?? true;
  const bagLabel = sf?.cartLabel || getCopy(design, "cartLabel");
  const stickers = sf?.navStyle === "stickers";
  const showAnnouncement = sf?.showAnnouncement ?? !isReferenceCatalog;
  const announcementShown = showAnnouncement && activeAnnouncements({ ...sf, announcementText: sf?.announcementText ?? shop.announcement }).length > 0;

  const headerTextColor = isHeaderTransparent ? storefrontText : (sf?.headerColor || storefrontText);
  const headerBgColor = isHeaderTransparent ? "transparent" : (sf?.headerBg || `${storefrontBg}${(sf?.headerStyle || "minimal") === "full" ? "f5" : "b3"}`);
  const headerBorderColor = isHeaderTransparent ? "transparent" : (sf?.headerColor ? `${sf.headerColor}1a` : `${storefrontText}1a`);
  const activeName = typeof activeCategory === "string" ? activeCategory : activeCategory?.name;

  const navBar = (
    <CategoryBar
      navRef={navRef}
      items={splitNavigation(navItems, sf).primary}
      design={sf}
      copyDesign={design}
      color={headerTextColor}
      line={line}
      stickers={stickers}
      pageTarget={(item) => ({ key: item.key, label: item.label, to: `/page/${item.page.slug}`, active: location.pathname.endsWith(`/page/${item.page.slug}`) })}
      categoryTarget={(item) => ({ key: item.key, label: item.label, active: activeName === item.label, onSelect: () => pick(item.category) })}
      childTarget={(k) => ({ key: `cat:${k.id}`, label: k.name, active: activeName === k.name, onSelect: () => pick(categories.find((c: any) => c.id === k.id) || k) })}
    />
  );
  const logo = (
    <button onClick={onHome} style={{ color: headerTextColor }} data-hdr-fixed className="shrink-0 text-xs tracking-[0.3em] font-semibold hover:opacity-80 transition-opacity flex items-center">
      <span data-studio-target="style:logo" data-studio-label="Logo"><LogoMark design={shop.logoDesign} /></span>
    </button>
  );
  const cartAmount = cartTotal > 0 ? formatPrice(cartTotal) : formatPrice(Number(sf?.catalogCartTotalPlaceholder ?? 0));

  return (
    <>
      {stickers && <style>{STICKER_PILL_CSS}</style>}
      <AnnouncementBar design={sf} show={showAnnouncement} fallback={shop.announcement} shop />
      <header
        data-section="navigation"
        data-studio-target="style:header|menus:header-order|copy:Header" data-studio-label="Header"
        className={`${sf?.stickyHeader ?? true ? "sticky" : "relative"} ${announcementShown ? "top-10" : "top-0"} z-50 transition-all duration-500 ${isHeaderTransparent ? "border-transparent" : isReferenceCatalog ? "" : "backdrop-blur-xl border-b"}`}
        style={{ backgroundColor: headerBgColor, borderColor: headerBorderColor }}
      >
        {isReferenceCatalog ? (
          <div className="mx-auto px-6 py-6" style={{ maxWidth: headerMaxWidth, color: headerTextColor }}>
            {mastheadDesktop < mastheadMobile && <style>{`.fm-ref-masthead{font-size:${mastheadMobile}px}@media(min-width:${PHONE_MAX + 1}px){.fm-ref-masthead{font-size:${mastheadDesktop}px}}`}</style>}
            {/* Wraps so a long masthead never pushes the bag off a phone screen; the bag then sits on its own line. */}
            <div className={`flex flex-wrap items-start gap-x-6 gap-y-3 ${shop.logoPosition === "right" ? "flex-row-reverse justify-between" : shop.logoPosition === "center" ? "justify-center relative" : "justify-between"}`}>
              <button
                onClick={onHome}
                className={`fm-ref-masthead font-black tracking-tight leading-none hover:opacity-80 transition-opacity ${shop.logoPosition === "right" ? "text-right" : shop.logoPosition === "center" ? "text-center" : "text-left"}`}
                style={{ color: sf?.logoColor || headerTextColor, textTransform: sf?.brandTransform || "none", fontSize: mastheadDesktop < mastheadMobile ? undefined : `clamp(${mastheadMobile}px, 5vw, ${mastheadDesktop}px)` }}
              >
                <span data-studio-target="style:catalogLayout|style:logo" data-studio-label="Masthead" data-studio-style-text="catalogMastheadText">{mastheadText}</span>
              </button>
              {showBag && cartPlacement === "top-right" && (
                <button
                  onClick={() => setIsCartOpen(true)}
                  aria-label={getCopy(design, "ariaCart")}
                  className={`flex shrink-0 items-center gap-2 pt-1 text-lg md:text-2xl font-black leading-none whitespace-nowrap hover:opacity-70 transition-opacity ${shop.logoPosition === "center" ? "absolute right-0 top-0" : shop.logoPosition === "right" ? "" : "ml-auto"}`}
                  style={{ color: headerTextColor }}
                >
                  <ShoppingCart size={28} strokeWidth={2.4} />
                  <span>{cartCount}</span>
                  <span aria-hidden="true" className="font-light">|</span>
                  <span>{cartAmount}</span>
                </button>
              )}
            </div>
            <div className="mt-6" style={{ borderTop: `${headerRuleWidth}px solid ${sf?.borderColor || headerBorderColor || "#B1B1AA"}` }} />
            <div data-studio-target="menus:header-order|menus:categories|style:navlinks" data-studio-label="Category bar" className="py-5 flex flex-wrap items-center text-base font-black" style={{ columnGap: navGapDesktop, rowGap: navGapMobile }}>
              {referenceNavCategories(categories, sf).map((cat: any, index: number) => {
                const catName = typeof cat === "string" ? cat : cat.name;
                const isActive = activeName === catName;
                const subs = childCategories(cat, categories).filter((k: any) => k.showInNav !== false);
                if (subs.length > 0) {
                  const branchActive = isActive || subs.some((k: any) => k.name === activeName);
                  return (
                    <NavDropdown
                      key={catName}
                      design={sf}
                      copyDesign={design}
                      studioTarget={false}
                      label={catName}
                      linkStyle={{ color: headerTextColor, fontSize: "inherit", fontWeight: "inherit", opacity: branchActive ? 1 : 0.7, ...ownNavLinkStyle(sf, branchActive), ...(stickers ? stickerPillStyle(sf, index, branchActive) : {}) }}
                      className={`hover:!opacity-100${stickers ? " fm-sticker-pill" : ""}`}
                      all={{ key: `${catName}:all`, label: catName, active: isActive, onSelect: () => pick(cat) }}
                      entries={subs.map((k: any) => ({ key: `cat:${k.id}`, label: k.name, active: activeName === k.name, onSelect: () => pick(categories.find((c: any) => c.id === k.id) || k) }))}
                    />
                  );
                }
                return (
                  <button key={catName} onClick={() => pick(cat)} className={`${isActive ? "opacity-100" : "opacity-70 hover:opacity-100"}${stickers ? " fm-sticker-pill" : ""}`}
                    style={{ ...ownNavLinkStyle(sf, isActive), ...(stickers ? stickerPillStyle(sf, index, isActive) : {}) }}>
                    {catName}
                  </button>
                );
              })}
              {splitNavigation(navItems, sf).primary.filter(item => item.kind === "page").map((item: any) => item.page).map((page: any) => (
                <Link key={page.id} to={`/page/${page.slug}`} className="hover:opacity-70 transition-opacity" style={ownNavLinkStyle(sf, location.pathname.endsWith(`/page/${page.slug}`))}>{page.title}</Link>
              ))}
              {/* Navigation › Header menu: the same links the Modern and page headers show. */}
              {sf?.menus?.header?.length > 0 && <StoreMenu items={sf.menus.header} design={sf} />}
              {!design?.hideHeaderSearch && <button onClick={onSearch} className="hover:opacity-70 transition-opacity"><span data-studio-copy="navSearch">{getCopy(design, "navSearch")}</span></button>}
              {showSys && (
                <Link to="/admin" className="hover:opacity-70 transition-opacity opacity-40"><span data-studio-copy="navAdmin">{getCopy(design, "navAdmin")}</span></Link>
              )}
              {showBag && cartPlacement === "nav-end" && (
                <button onClick={() => setIsCartOpen(true)} aria-label={getCopy(design, "ariaCart")} className="hover:opacity-70 transition-opacity">
                  {cartCount} | {cartAmount}
                </button>
              )}
            </div>
            <div style={{ borderTop: `${headerRuleWidth}px solid ${sf?.borderColor || headerBorderColor || "#B1B1AA"}` }} />
          </div>
        ) : (
          <div ref={headerRowRef} className="fm-hdr-row mx-auto px-6 py-4 flex flex-nowrap items-center justify-between gap-4" style={{ maxWidth }}>
            <div className={`flex min-w-0 items-center gap-8 md:gap-12 flex-1 ${shop.logoPosition === "center" ? "" : "flex-initial"}`}>
              {shop.logoPosition === "left" && logo}
              {!navBelow && navBar}
            </div>
            {shop.logoPosition === "center" && <div className="flex-1 flex justify-center">{logo}</div>}
            <div data-hdr-fixed data-studio-target="style:header|copy:Header" data-studio-label="Header icons & cart" className={`flex shrink-0 flex-nowrap gap-2 sm:gap-6 md:gap-8 items-center flex-1 justify-end ${shop.logoPosition === "right" ? "flex-initial" : ""}`}>
              {shop.logoPosition === "right" && logo}
              {sf?.menus?.header?.length > 0 && (
                <div className="mr-2" style={{ color: headerTextColor }}><StoreMenu items={sf.menus.header} design={sf} /></div>
              )}
              <HeaderActions
                flags={design}
                copyDesign={design}
                color={headerTextColor}
                shop
                onSearch={onSearch}
                wishlistCount={wishlistCount}
                showAdmin={showSys}
                cartButton={showBag && (
                  <button
                    onClick={() => setIsCartOpen(true)}
                    aria-label={getCopy(design, "ariaCart")}
                    className={`fm-hdr-cart group flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-2 transition-all hover:scale-[1.02] store-btn-primary ${buttonShadow ? "shadow-lg" : ""} ${stickers ? "fm-sticker-pill" : ""}`}
                    style={{
                      backgroundColor: buttonStyle === "solid" ? buttonBg : "transparent",
                      color: buttonStyle === "solid" ? buttonText : buttonBg,
                      border: buttonStyle !== "solid" ? `1px solid ${buttonBg}` : "none",
                      borderRadius: buttonRadius,
                      ...(stickers ? { borderRadius: sf?.navPillRadius || "14px 4px 14px 4px", transform: "rotate(2deg)" } : {}),
                    }}
                  >
                    <span className={`text-[10px] tracking-[0.2em] font-semibold ${buttonUppercase ? "uppercase" : ""}`}>{bagLabel}</span>
                    {cartCount > 0 && (
                      <span
                        style={{
                          backgroundColor: buttonStyle === "solid" ? buttonText : buttonBg,
                          color: buttonStyle === "solid" ? buttonBg : buttonText,
                        }}
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full transition-colors"
                      >
                        {cartCount}
                      </span>
                    )}
                  </button>
                )}
              />
            </div>
          </div>
        )}
        {!isReferenceCatalog && navBelow && (
          <div className="border-t" style={{ borderColor: headerBorderColor }}>
            <div className="mx-auto px-6" style={{ maxWidth }}>{navBar}</div>
          </div>
        )}
        <MobileStorefrontNav design={design} pages={pages || []} onSearch={onSearch} showThemeToggle={!design?.hideThemeToggle} />
        <SecondaryStorefrontNav design={design} pages={pages || []} />
      </header>
    </>
  );
}
