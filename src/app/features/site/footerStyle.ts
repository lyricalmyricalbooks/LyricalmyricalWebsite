import { DEVICE_MEDIA } from "./breakpoints";

// Studio › Style › Footer & social links → CSS for the one storefront footer (StoreFooter.tsx).
// Spacing always has a value (the defaults are the footer's own look); colours are emitted only
// when set, so an untouched footer keeps the theme's token colours.

const num = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Number(value);
  return value !== "" && value != null && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
const colour = (value: unknown) => typeof value === "string" && value.trim() && !/[;{}<>]/.test(value) ? value.trim() : "";

export const FOOTER_SCOPE = "[data-fm-footer]";

export type FooterLinksAlign = "end" | "start" | "spread";
export function footerLinksAlign(d: any): FooterLinksAlign {
  return d?.footerLinksAlign === "start" || d?.footerLinksAlign === "spread" ? d.footerLinksAlign : "end";
}

export type FooterBrandAlign = "center" | "start";
export function footerBrandAlign(d: any): FooterBrandAlign {
  return d?.footerBrandAlign === "start" ? "start" : "center";
}

// The look picked in October 2026 (design "E3"): accent line on top, accent group headings, the brand
// centred in its own area with a thin line beside it, and square social buttons. Each one is its own
// Studio control; the defaults below are that look.
const RULE = "rgba(var(--fg-rgb, 255, 255, 255), 0.2)";

export function footerStyleCss(d: any = {}): string {
  const s = FOOTER_SCOPE;
  const padY = num(d.footerPaddingY, 56, 16, 160);
  const padYPhone = num(d.footerPaddingYMobile, 40, 16, 120);
  const colGap = num(d.footerColumnGap, 64, 16, 200);
  const linkGap = num(d.footerLinkGap, 12, 4, 32);
  const size = num(d.footerTextSize, 12, 10, 18);
  let css = `${s} .fm-footer-main{padding-top:${padY}px;padding-bottom:${padY}px;}`
    + `@media${DEVICE_MEDIA.mobile}{${s} .fm-footer-main{padding-top:${padYPhone}px;padding-bottom:${padYPhone}px;}}`
    + `${s} .fm-footer-groups{column-gap:${colGap}px;}`
    + `${s} .fm-footer-list>*+*{margin-top:${linkGap}px;}`
    + `${s} .fm-footer-text{font-size:${size}px !important;}`;
  const text = colour(d.footerTextColor);
  const heading = colour(d.footerHeadingColor);
  const hover = colour(d.footerLinkHoverColor);
  const divider = colour(d.footerDividerColor);
  if (text) css += `${s} .fm-footer-text,${s} .fm-footer-text a,${s} .fm-footer-icon{color:${text} !important;}`;
  if (heading) css += `${s} .fm-footer-heading{color:${heading} !important;}`;
  if (hover) css += `${s} a:hover,${s} a:focus-visible{color:${hover} !important;}`;
  if (divider) css += `${s} .fm-footer-rule{border-color:${divider} !important;}`;
  if (d.showFooterDividers === false) css += `${s} .fm-footer-rule{border-top-width:0 !important;}`;
  const accent = colour(d.footerAccentColor) || "var(--accent, currentColor)";
  const rule = divider || RULE;
  if (d.showFooterAccentLine !== false) {
    css += `${s}{border-top:${num(d.footerAccentLineWidth, 3, 1, 12)}px solid ${accent} !important;}`;
  }
  if (d.footerGroupHeadingsAccent !== false && !heading) css += `${s} .fm-footer-groups .fm-footer-heading{color:${accent} !important;}`;
  if (footerBrandAlign(d) === "center") {
    css += `@media (min-width:768px){${s} .fm-footer-brand{max-width:none;justify-self:stretch;align-self:stretch;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;}`
      + `${s} .fm-footer-brand>*+*{margin-top:16px;}${s} .fm-footer-brand img{margin-inline:auto;}}`;
  }
  if (d.showFooterBrandDivider !== false) {
    css += `@media (min-width:768px){${s} .fm-footer-brand{border-right:1px solid ${rule};padding-right:${num(d.footerColumnGap, 64, 16, 200)}px;}}`;
  }
  if (d.footerSocialBoxes !== false) {
    css += `${s} .fm-footer-icon-box{width:40px;height:40px;display:inline-flex;align-items:center;justify-content:center;border:1px solid ${rule};}`;
  }
  return css;
}
