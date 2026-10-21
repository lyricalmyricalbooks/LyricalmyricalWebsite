import type { ReactNode } from "react";
import { Link } from "react-router";
import { Mail, Music2 } from "lucide-react";
import { Facebook, Instagram, Twitter } from "./socialIcons";
import { POLICY_KEYS, policySlug, policyTitle } from "./policyPages";
import { DEFAULT_SOCIAL } from "./constants";
import { contentMaxWidth } from "./headerNav";
import { getCopy, shopCopyFallback } from "./storeCopy";
import { resolveFooterBadges } from "./paymentBadges";
import { regionProps } from "./storefrontRegions";
import { GroupedFooterNavigation } from "../../components/GroupedFooterNavigation";
import { FooterMenu } from "../../components/StoreMenu";
import { wordmarkSecondaryStyle } from "../../components/LogoMark";
import { footerLinksAlign, footerStyleCss } from "./footerStyle";
import { pageInFooter } from "./footerNavigation";
import { elementScheme } from "./colorSchemes";

// ──────────────────────────────
// Payment gateway icons for footer
// ──────────────────────────────
const PAYMENT_ICONS: Record<string, ReactNode> = {
  visa: (
    <svg className="h-3 w-auto" viewBox="0 0 24 15" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M10.166 14.281l2.42-13.562h3.873l-2.42 13.562h-3.873zm11.393-13.064c-.754-.298-1.922-.619-3.376-.619-3.702 0-6.31 1.944-6.329 4.743-.03 2.062 1.868 3.208 3.292 3.896 1.458.706 1.95 1.155 1.942 1.785-.015.965-1.171 1.408-2.253 1.408-1.503 0-2.31-.225-3.535-.76l-.497-.238-.529 3.256c.883.402 2.512.75 4.205.766 3.935 0 6.5-1.922 6.539-4.896.02-1.618-.975-2.853-3.116-3.87-.225-.112-.45-.224-.652-.328-1.178-.568-1.579-.955-1.571-1.53.015-.515.586-1.042 1.86-1.042 1.053-.016 1.815.223 2.408.47l.285.126.547-3.336zM7.568 1.22H3.771c-.883 0-1.545.26-1.936 1.183l-5.416 11.878h4.067l.808-2.215h4.975l.471 2.215h3.585L7.568 1.22zm-2.463 7.82l1.545-4.237.887 4.237H5.105zm18.802-8.32H20.73c-.63 0-1.109.356-1.343.916l-6.427 12.665h4.067l.812-2.25h4.975l.471 2.25h3.582L23.907.72z" />
    </svg>
  ),
  mastercard: (
    <svg className="h-4 w-auto" viewBox="0 0 24 15" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7.5" cy="7.5" r="7.5" opacity="0.8" />
      <circle cx="16.5" cy="7.5" r="7.5" opacity="0.6" />
    </svg>
  ),
  amex: (
    <svg className="h-4 w-auto" viewBox="0 0 24 15" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <text x="4" y="11" fontSize="7" fontWeight="bold" fontFamily="sans-serif">AX</text>
    </svg>
  ),
  paypal: (
    <svg className="h-3 w-auto" viewBox="0 0 24 15" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.825 3.328a2.535 2.535 0 00-.518-.088 6.002 6.002 0 00-1.157-.1c-1.464 0-2.88.225-4.148.653-.518.175-.852.483-1.037.954l-1.87 8.358h-3.41l2.584-11.53c.18-.8 1.054-1.282 1.867-1.282h4.5c.95 0 1.764.218 2.378.647.614.43 1.002.99 1.134 1.637.133.648-.052 1.306-.554 1.936a4.52 4.52 0 01-1.769 1.418z" />
      <path d="M12.922 7.078c.185-.47.52-.779 1.037-.954 1.268-.428 2.684-.653 4.148-.653a6.002 6.002 0 011.157.1c.175.022.35.05.518.088.75.163 1.258.625 1.488 1.32.228.694.137 1.467-.282 2.215-.49 1.026-1.4 1.844-2.585 2.32a5.556 5.556 0 01-2.115.42H13.67l-.946 4.168h-3.41L11.055 7.15l1.867-.072z" />
    </svg>
  ),
  applepay: (
    <svg className="h-3 w-auto" viewBox="0 0 24 15" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M16.59 7.07c0-1.74 1.41-2.73 1.48-2.78-.81-1.18-2.07-1.34-2.52-1.38-1.07-.11-2.09.63-2.63.63-.54 0-1.38-.62-2.27-.6-1.17.02-2.26.68-2.86 1.73-1.22 2.11-.31 5.23.87 6.93.58.83 1.26 1.76 2.16 1.73.87-.03 1.2-.56 2.26-.56 1.05 0 1.35.56 2.26.54.93-.02 1.52-.84 2.1-1.68.67-.97.94-1.92.96-1.97-.02-.01-1.85-.71-1.87-2.82zM14.73 1.77c.48-.58.8-1.38.71-2.18-.69.03-1.53.46-2.02 1.03-.42.48-.79 1.3-.7 2.08.77.06 1.53-.35 2.01-.93z" />
    </svg>
  ),
  googlepay: (
    <svg className="h-3 w-auto" viewBox="0 0 24 15" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <text x="3" y="11" fontSize="7" fontWeight="bold" fontFamily="sans-serif">GPay</text>
    </svg>
  ),
  afterpay: (
    <svg className="h-3 w-auto" viewBox="0 0 24 15" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <text x="2" y="10" fontSize="5" fontWeight="bold" fontFamily="sans-serif">afterpay</text>
    </svg>
  ),
  klarna: (
    <svg className="h-3 w-auto" viewBox="0 0 24 15" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <text x="2" y="10" fontSize="6" fontWeight="bold" fontFamily="sans-serif">Kl.</text>
    </svg>
  ),
};

// ──────────────────────────────
// The one storefront footer (Studio 2.0 · 2.1): home, catalog, collections, product, custom pages,
// wishlist, account, tracking and 404. Checkout keeps its own short policy row.
// ──────────────────────────────
export function StoreFooter({ settings, pages }: { settings: any; pages: any[] }) {
  const navPages = (pages || []).filter(pageInFooter);
  const rawDesign = settings?.design || {};
  // Never configured → the house default; cleared on purpose in Studio → hidden.
  const social = settings?.design?.social ?? DEFAULT_SOCIAL;
  const instagramUrl: string = social.instagram || "";
  // Theme settings › Footer & social links › Facebook / X / TikTok: shown beside Instagram once filled in.
  const otherSocial = ([
    ["facebook", Facebook, "footerLinkFacebook", "footerFacebookAria"],
    ["twitter", Twitter, "footerLinkTwitter", "footerTwitterAria"],
    ["tiktok", Music2, "footerLinkTiktok", "footerTiktokAria"],
  ] as const).map(([key, Icon, linkKey, ariaKey]) => ({ key, Icon, linkKey, ariaKey, url: String(social?.[key] || "").trim() }))
    .filter((s) => /^https?:\/\//i.test(s.url));
  const d = rawDesign;
  const grouped = d.footerNavigationLayout !== "columns";
  const policyKeys = POLICY_KEYS.filter(k => (settings?.policies as any)?.[k]?.trim());
  const fourCol = d?.footerLayout === "4col";
  // "Multi-column footer" off → the columns stack into one.
  const multiColumn = d?.footerColumns !== false;
  const headingFontFamily = d?.headingFont ? `'${d.headingFont}', serif` : undefined;
  // Typography › Logo wordmark font, like the header's logo (LogoMark); empty = the heading font.
  const wordmarkFontFamily = (d?.wordmarkFont || d?.headingFont) ? `'${d.wordmarkFont || d.headingFont}', serif` : undefined;
  // Footer logo picture: "image" (instead of the name) or "both" (above it); empty = the name only, as before.
  const footerLogoMode: string = d.footerLogo === "image" || d.footerLogo === "both" ? d.footerLogo : "";
  const footerLogoSrc: string = footerLogoMode ? String(d.footerLogoUrl || d.logoUrl || "").trim() : "";
  const footerLogoWidth = Math.min(320, Math.max(40, Number(d.footerLogoWidth) || 120));
  const linksAlign = footerLinksAlign(d);
  const groupedGrid = linksAlign === "spread" ? "md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
    : linksAlign === "start" ? "md:grid-cols-[auto_minmax(0,1fr)]" : "md:grid-cols-[minmax(0,1fr)_auto]";
  const groupsLayout = linksAlign === "spread" ? "grid grid-cols-2"
    : `grid grid-cols-2 sm:flex sm:flex-wrap ${linksAlign === "start" ? "md:justify-self-start" : "md:justify-self-end"}`;
  const email = settings?.info?.email || "lyricalmyricalbooks@gmail.com";
  const footerAbout: string = String((settings?.design?.copy?.footerAbout != null ? getCopy(settings?.design, "footerAbout") : shopCopyFallback(settings, "footerAbout") || getCopy(settings?.design, "footerAbout")) ?? "");
  const footerLocation: string = String(getCopy(d, "footerLocation") ?? "");
  const badges = d?.showPaymentBadges !== false ? resolveFooterBadges(d, settings) : [];
  return (
    <footer {...regionProps("footerPanel")} data-fm-footer=""
      data-studio-target="style:footer|style:catalogElements|copy:Footer" data-studio-label="Footer"
      className="border-t-2 border-white/30 bg-black/40"
      style={elementScheme(d, "footer") ? { backgroundColor: "var(--bg-color)", color: "var(--text-color)" } : d?.footerBg ? { backgroundColor: d.footerBg } : undefined}
    >
      <style>{footerStyleCss(d)}</style>
      {/* One padded column: the top band, legal row and bottom bar share the same left/right edge, and the
          divider lines start and end exactly where the text does. */}
      <div style={{ maxWidth: contentMaxWidth(d) }} className="mx-auto px-6">
      <div className={`fm-footer-main fm-footer-text grid grid-cols-1 ${!multiColumn ? "" : grouped ? groupedGrid : fourCol ? "md:grid-cols-4" : "md:grid-cols-3"} gap-10 md:gap-x-16 text-[11px] text-white/70`}>
        {/* Col 1: Brand */}
        <div {...regionProps("footerBrand")} className="fm-footer-brand space-y-4 min-w-0 max-w-sm" data-studio-target="copy:Footer|style:logo|style:catalogElements" data-studio-label="Footer brand">
          {/* Style › Footer › Footer logo: a picture instead of (or above) the shop name; blank picture = the header logo */}
          {footerLogoSrc && (
            <img
              loading="lazy"
              src={footerLogoSrc}
              alt={getCopy(d, "logoAlt")}
              decoding="async"
              className="block h-auto object-contain"
              style={{ width: footerLogoWidth, maxWidth: "100%" }}
            />
          )}
          {footerLogoSrc && footerLogoMode === "image" ? null : d?.wordmarkStyle === "two-part" ? (
            <p className="text-white text-xl" style={{ fontFamily: wordmarkFontFamily, fontWeight: d?.wordmarkWeight ?? 600, letterSpacing: "-0.01em" }}>
              <span data-studio-style-text="wordmarkPrimary">{d.wordmarkPrimary ?? "Lyricalmyrical"}</span> <span data-studio-style-text="wordmarkSecondary" style={wordmarkSecondaryStyle(d)}>{d.wordmarkSecondary ?? "Books"}</span>
            </p>
          ) : (
            <p className="text-white font-bold tracking-widest text-xs"><span data-studio-copy="footerWordmark">{getCopy(settings?.design, "footerWordmark")}</span></p>
          )}
          {/* A blank line is hidden (data-empty) so it can't push a centred logo off centre. */}
          <p className="leading-relaxed max-w-xs" data-empty={footerAbout.trim() ? undefined : ""}>
            <span data-studio-copy="footerAbout">{footerAbout}</span>
          </p>
          {grouped && d.showFooterLocation !== false && <p data-studio-target="copy:Footer|style:footer" data-studio-label="Footer location" data-empty={footerLocation.trim() ? undefined : ""}><span data-studio-copy="footerLocation">{footerLocation}</span></p>}
        </div>

        {grouped ? <div {...regionProps("footerLinks")} data-studio-target="menus:footer|copy:Footer|style:footer|style:catalogElements" data-studio-label="Footer link groups"
          className={`fm-footer-groups min-w-0 gap-y-0 sm:gap-y-10 ${groupsLayout}`}>
          <GroupedFooterNavigation settings={settings} pages={pages} />
        </div> : <>
        {/* Col 2: Navigation */}
        <div className="space-y-3" data-studio-target="menus:footer|copy:Footer|pages" data-studio-label="Footer links">
          <p className="fm-footer-heading text-white/55 text-[9px] uppercase tracking-[0.4em] mb-4"><span data-studio-copy="footerNavHeading">{getCopy(settings?.design, "footerNavHeading")}</span></p>
          {settings?.design?.menus?.footer?.length > 0 ? (
            <FooterMenu items={settings.design.menus.footer} />
          ) : (
            <>
              <Link to="/" className="block hover:text-white transition-colors"><span data-studio-copy="footerLinkShop">{getCopy(settings?.design, "footerLinkShop")}</span></Link>
              <Link to="/track" className="block hover:text-white transition-colors"><span data-studio-copy="footerLinkTrack">{getCopy(settings?.design, "footerLinkTrack")}</span></Link>
              {navPages.map(page => (
                <Link
                  key={page.id}
                  to={`/page/${page.slug}`}
                  className="block hover:text-white transition-colors"
                >
                  {page.title}
                </Link>
              ))}
              {d?.showSocialInFooter !== false && instagramUrl && <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="block hover:text-white transition-colors"><span data-studio-copy="footerLinkInstagram">{getCopy(settings?.design, "footerLinkInstagram")}</span></a>}
              {d?.showSocialInFooter !== false && otherSocial.map((s) => <a key={s.key} href={s.url} target="_blank" rel="noopener noreferrer" className="block hover:text-white transition-colors"><span data-studio-copy={s.linkKey}>{getCopy(settings?.design, s.linkKey)}</span></a>)}
              <a
                href={`mailto:${settings?.info?.email || "lyricalmyricalbooks@gmail.com"}`}
                className="block hover:text-white transition-colors"
              >
                <span data-studio-copy="footerLinkContact">{getCopy(settings?.design, "footerLinkContact")}</span>
              </a>
            </>
          )}
        </div>

        {/* Col 3: Policies / Info */}
        <div className="space-y-3" data-studio-target="copy:Footer|style:footer" data-studio-label="Footer legal & location">
          {d.showFooterLegalHeading !== false && <p className="fm-footer-heading text-white/55 text-[9px] uppercase tracking-[0.4em] mb-4"><span data-studio-copy="footerLegalHeading">{getCopy(settings?.design, "footerLegalHeading")}</span></p>}
          {POLICY_KEYS.filter((k) => (settings?.policies as any)?.[k]?.trim()).map((k) => (
            <p key={k}><Link to={`/page/${policySlug(k)}`} className="hover:text-white transition-colors">{policyTitle(settings?.design, k)}</Link></p>
          ))}
          {!fourCol && d.showFooterLocation !== false && <p className="mt-6"><span data-studio-copy="footerLocation">{getCopy(settings?.design, "footerLocation")}</span></p>}
        </div>

        {/* Col 4: Location (4-column layout only) */}
        {fourCol && d.showFooterLocation !== false && (
          <div className="space-y-3" data-studio-target="copy:Footer|style:footer" data-studio-label="Footer location">
            <p className="fm-footer-heading text-white/55 text-[9px] uppercase tracking-[0.4em] mb-4"><span data-studio-copy="footerLocationHeading">{getCopy(settings?.design, "footerLocationHeading")}</span></p>
            <p><span data-studio-copy="footerLocation">{getCopy(settings?.design, "footerLocation")}</span></p>
            <a
              href={`mailto:${settings?.info?.email || "lyricalmyricalbooks@gmail.com"}`}
              className="block hover:text-white transition-colors"
            >
              {settings?.info?.email || "lyricalmyricalbooks@gmail.com"}
            </a>
          </div>
        )}
        </>}
      </div>

      {/* No policies written yet → no lone "Legal" heading or empty ruled strip. */}
      {grouped && policyKeys.length > 0 && <div {...regionProps("footerLegal")} className="fm-footer-legal fm-footer-rule fm-footer-text fm-footer-bar border-t border-white/20 flex flex-wrap items-baseline gap-x-6 gap-y-3 text-[11px] text-white/70" data-studio-target="copy:Footer|style:footer|style:catalogElements" data-studio-label="Footer legal links">
        {d.showFooterLegalHeading !== false && <span className="fm-footer-heading text-[9px] uppercase tracking-[0.3em] text-white/55" data-studio-copy="footerLegalHeading">{getCopy(d, "footerLegalHeading")}</span>}
        {policyKeys.map(k => <Link key={k} to={"/page/" + policySlug(k)} className="hover:text-white transition-colors">{policyTitle(d, k)}</Link>)}
      </div>}

      {/* Bottom bar: copyright on the left; payment icons, social icons and the Admin link on the right. */}
      <div {...regionProps("footerBottom")} data-studio-target="copy:Footer|style:footer|style:catalogElements" data-studio-label="Footer bottom bar"
        className="fm-footer-rule fm-footer-bar border-t border-white/20 flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-[9px] tracking-widest text-white/55 uppercase">
          <span data-studio-copy="footerCopyright">{getCopy(settings?.design, "footerCopyright")}</span>
        </p>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {badges.length > 0 && (
            <div className="flex items-center gap-4 text-white/55 select-none" data-studio-target="style:paymentIcons|style:footer" data-studio-label="Payment icons">
              {badges.map((badgeId: string) => {
                const icon = PAYMENT_ICONS[badgeId];
                if (!icon) return null;
                return (
                  <div key={badgeId} className="opacity-30 hover:opacity-100 transition-opacity duration-300">
                    {icon}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2.5">
            {d.showSocialInFooter !== false && instagramUrl && (
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={getCopy(d, "footerInstagramAria")}
              className="fm-footer-icon fm-footer-icon-box text-white/55 hover:text-white transition-colors"
            >
              <Instagram size={14} aria-hidden="true" />
            </a>
            )}
            {d.showSocialInFooter !== false && otherSocial.map(({ key, Icon, ariaKey, url }) => (
              <a key={key} href={url} target="_blank" rel="noopener noreferrer" aria-label={getCopy(d, ariaKey)}
                className="fm-footer-icon fm-footer-icon-box text-white/55 hover:text-white transition-colors">
                <Icon size={14} aria-hidden="true" />
              </a>
            ))}
            <a
              href={`mailto:${email}`}
              aria-label={getCopy(d, "footerEmailAria")}
              className="fm-footer-icon fm-footer-icon-box text-white/55 hover:text-white transition-colors"
            >
              <Mail size={14} aria-hidden="true" />
            </a>
          </div>

          {/* Style › Footer & social links › Show “Admin” link; words in Text & labels › Footer. */}
          {d.showFooterAdminLink !== false && (
            <Link to="/admin" rel="nofollow" {...regionProps("footerAdmin")} data-studio-target="copy:Footer|style:footer|style:catalogElements" data-studio-label="Footer admin link"
              className="fm-footer-icon text-[9px] uppercase tracking-[0.3em] text-white/55 hover:text-white transition-colors">
              <span data-studio-copy="footerAdmin">{getCopy(d, "footerAdmin")}</span>
            </Link>
          )}
        </div>
      </div>
      </div>
    </footer>
  );
}
