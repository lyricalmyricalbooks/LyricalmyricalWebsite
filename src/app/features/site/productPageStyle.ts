// The Riso "catalogue card" product page (BookDetail.tsx). Every value here comes from a
// Studio › Style › "Product page · buy card & details" control (the `pdp*` design keys); when a
// control is empty the rule falls back to a theme token, so the page always follows the palette.
// BookDetail opts elements in with these class names:
//   fm-pdp-crumb        breadcrumb row             fm-pdp-meta         small mono labels
//   fm-pdp-media        photo column (data-thumbs) fm-pdp-rail / -thumb thumbnail rail
//   fm-pdp-frame        framed main photo          fm-pdp-caption      "Fig. 1 · 1 of 3" bar
//   fm-pdp-card         the bordered buy card      fm-pdp-card-section one ruled row of the card
//   fm-pdp-tag          category tag               fm-pdp-title / -price title and price
//   fm-pdp-stock        stock line (dot + words)   fm-pdp-chip         format / edition choice
//   fm-pdp-qty          quantity stepper           fm-pdp-sq           square icon buttons
//   fm-pdp-tabs / -tab / -panel  details tabs     fm-pdp-record       catalogue-record specs

import { elementScheme } from "./colorSchemes";

const S = "[data-fm-store]";
const clean = (v: any) => String(v).replace(/[;{}<>]/g, "");
const font = (name: any) => `'${String(name).replace(/['"\\;{}<>]/g, "")}', sans-serif`;
const has = (v: any) => v !== undefined && v !== null && v !== "";

/** A number control, clamped; `fallback` when the control is empty or not a number. */
function num(d: any, key: string, fallback: number, min: number, max: number): number {
  const x = Number(d[key]);
  if (!has(d[key]) || !Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, x));
}
/** A colour control, or the theme token it falls back to. */
const color = (d: any, key: string, fallback: string) => (has(d[key]) ? clean(d[key]) : fallback);

/** Phone breakpoint shared with the card typography controls. */
const PHONE_MAX = 767;

function sizeRules(selector: string, desktop: number, phone: number, auto: string): string {
  const p = phone || desktop;
  let css = `${selector}{font-size:${desktop ? `${desktop}px` : auto};}`;
  if (p) css += `@media (max-width:${PHONE_MAX}px){${selector}{font-size:${p}px;}}`;
  return css;
}

export function productPageCss(design: any): string {
  const d = design || {};

  const outlineW = has(d.pdpCardBorderWidth) ? `${num(d, "pdpCardBorderWidth", 2, 0, 6)}px` : "var(--rp-outline-w, 2px)";
  const photoW = has(d.pdpPhotoBorderWidth) ? `${num(d, "pdpPhotoBorderWidth", 2, 0, 6)}px` : "var(--rp-outline-w, 2px)";
  const outline = "var(--rp-outline, rgb(var(--fg-rgb)))";
  // Theme settings › Colour schemes › Product page buy card: while the buy card follows a scheme, the
  // scheme's colours (tokens on .fm-pdp-card, from schemeCss) replace the card's own colour controls.
  const schemed = Boolean(elementScheme(d, "buyCard"));
  const cardTint = (key: string, fallback: string) => (schemed ? fallback : color(d, key, fallback));
  const cardBorder = cardTint("pdpCardBorderColor", outline);
  const photoBorder = color(d, "pdpPhotoBorderColor", outline);
  const divider = color(d, "pdpCardDividerColor", "rgba(var(--border-rgb), 0.45)");
  const cardDivider = cardTint("pdpCardDividerColor", "rgba(var(--border-rgb), 0.45)");
  const shadow = cardTint("pdpCardShadowColor", "var(--accent)");
  const offset = num(d, "pdpCardShadowOffset", 8, 0, 16);
  const pad = num(d, "pdpCardPadding", 24, 8, 48);
  const metaFont = font(has(d.pdpMetaFont) ? d.pdpMetaFont : "DM Mono");
  const metaSize = num(d, "pdpMetaSize", 11, 8, 16);
  const metaColor = color(d, "pdpMetaColor", "var(--muted)");
  const titleFont = has(d.pdpTitleFont) ? font(d.pdpTitleFont) : "var(--heading-font, inherit)";
  const priceFont = has(d.pdpPriceFont) ? font(d.pdpPriceFont) : "var(--heading-font, inherit)";
  const titleCase = d.pdpTitleCase === "uppercase" || d.pdpTitleCase === "none" ? `text-transform:${d.pdpTitleCase};` : "";
  const tabBg = color(d, "pdpTabActiveBg", "var(--active-bg)");
  const tabText = color(d, "pdpTabActiveText", "var(--active-fg)");
  const panelBorder = color(d, "pdpPanelBorderColor", outline);
  const descWidth = num(d, "pdpPanelTextWidth", 65, 0, 160);
  const thumbActive = color(d, "pdpThumbActiveColor", "var(--accent)");
  const stockDot = color(d, "pdpStockColor", "var(--success)");

  let css = "";
  css += `${S} .fm-pdp-desc{max-width:${descWidth ? `${descWidth}ch` : "none"};}`;
  css += `${S} .fm-pdp-meta{font-family:${metaFont};font-size:${metaSize}px;letter-spacing:.14em;text-transform:uppercase;color:${metaColor};}`;
  css += `${S} .fm-pdp-crumb{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:14px 0;border-bottom:1px solid ${divider};}`;
  css += `${S} .fm-pdp-crumb a{color:inherit;text-decoration:none;}`;
  css += `${S} .fm-pdp-crumb a:hover{color:var(--link-hover-color, var(--accent));}`;
  css += `${S} .fm-pdp-crumb [aria-current]{color:rgb(var(--fg-rgb));}`;

  // Photo column: thumbnail rail beside (side) or under (below) the framed photo.
  css += `${S} .fm-pdp-media{display:grid;gap:14px;align-items:start;grid-template-columns:minmax(0,1fr);}`;
  css += `${S} .fm-pdp-media[data-thumbs="side"]{grid-template-columns:76px minmax(0,1fr);}`;
  css += `${S} .fm-pdp-rail{display:flex;gap:10px;overflow-x:auto;padding-bottom:2px;}`;
  css += `${S} .fm-pdp-media[data-thumbs="side"] .fm-pdp-rail{flex-direction:column;max-height:min(80vh, 760px);overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;}`;
  css += `${S} .fm-pdp-media[data-thumbs="below"] .fm-pdp-rail{order:2;}`;
  css += `${S} .fm-pdp-thumb{flex:none;width:64px;padding:0;overflow:hidden;background:var(--surface);border:2px solid rgba(var(--border-rgb), 0.5);opacity:.72;transition:opacity 140ms,border-color 140ms;}`;
  css += `${S} .fm-pdp-media[data-thumbs="side"] .fm-pdp-thumb{width:100%;}`;
  css += `${S} .fm-pdp-thumb:hover{opacity:1;}`;
  css += `${S} .fm-pdp-thumb[aria-current="true"]{opacity:1;border-color:${thumbActive};}`;
  css += `${S} .fm-pdp-frame{border:${photoW} solid ${photoBorder};}`;
  css += `${S} .fm-pdp-caption{display:flex;justify-content:space-between;gap:12px;padding:9px 12px;border:${photoW} solid ${photoBorder};border-top:0;}`;

  // The buy card.
  css += `${S} .fm-pdp-card{width:100%;background:${cardTint("pdpCardBg", "var(--surface)")};border:${outlineW} solid ${cardBorder};box-shadow:${offset}px ${offset}px 0 ${shadow};border-radius:var(--rp-card-radius, 0);}`;
  css += `${S} .fm-pdp-card-section{display:flex;flex-direction:column;gap:16px;padding:${pad}px;border-top:1px solid ${cardDivider};}`;
  css += `${S} .fm-pdp-card-section:first-child{border-top:0;}`;
  css += `${S} .fm-pdp-tag{display:inline-flex;align-items:center;gap:8px;padding:7px 12px;font-size:10px;font-weight:900;letter-spacing:.3em;text-transform:uppercase;line-height:1;}`;
  css += `${S} .fm-pdp-tag[data-style="filled"]{background:var(--badge-bg-primary, var(--accent));color:var(--badge-text-primary, var(--on-accent));}`;
  css += `${S} .fm-pdp-tag[data-style="outline"]{border:2px solid currentColor;color:rgb(var(--fg-rgb));}`;
  css += `${S} .fm-pdp-title{margin:0;font-family:${titleFont};font-weight:400;line-height:.98;overflow-wrap:anywhere;text-wrap:balance;color:${cardTint("pdpTitleColor", "rgb(var(--fg-rgb))")};${titleCase}}`;
  css += sizeRules(`${S} .fm-pdp-title`, num(d, "pdpTitleSize", 0, 0, 120), num(d, "pdpTitleSizeMobile", 0, 0, 96), "var(--pdp-title-auto, clamp(34px, 4.6vw, 62px))");
  css += `${S} .fm-pdp-price{font-family:${priceFont};font-weight:400;line-height:1;letter-spacing:.01em;font-variant-numeric:tabular-nums;color:${cardTint("pdpPriceColor", "rgb(var(--fg-rgb))")};}`;
  css += sizeRules(`${S} .fm-pdp-price`, num(d, "pdpPriceSize", 0, 0, 96), num(d, "pdpPriceSizeMobile", 0, 0, 80), "clamp(34px, 5vw, 60px)");
  css += `${S} .fm-pdp-stock{display:inline-flex;align-items:center;gap:8px;}`;
  css += `${S} .fm-pdp-stock::before{content:"";width:10px;height:10px;flex:none;background:${stockDot};}`;
  css += `${S} .fm-pdp-stock[data-state="out"]::before{background:var(--danger);}`;

  // Format chips, quantity and the square wishlist/share buttons.
  css += `${S} .fm-pdp-select{width:100%;min-height:48px;padding:0 14px;background:var(--surface);color:rgb(var(--fg-rgb));border:2px solid rgba(var(--border-rgb), 0.6);font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;}`;
  css += `${S} .fm-pdp-select:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}`;
  css += `${S} .fm-pdp-select[aria-invalid="true"]{border-color:var(--danger);}`;
  css += `${S} .fm-pdp-select option{background:var(--surface);color:rgb(var(--fg-rgb));}`;
  css += `${S} .fm-pdp-chip{min-height:44px;padding:0 16px;background:transparent;border:2px solid rgba(var(--border-rgb), 0.6);font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);}`;
  css += `${S} .fm-pdp-chip:hover{border-color:rgb(var(--fg-rgb));color:rgb(var(--fg-rgb));}`;
  css += `${S} .fm-pdp-chip[aria-pressed="true"]{background:var(--active-bg);border-color:var(--active-bg);color:var(--active-fg);}`;
  css += `${S} .fm-pdp-chip[data-soldout="true"]{text-decoration:line-through;opacity:.55;}`;
  css += `${S} .fm-pdp-qty{display:inline-flex;align-items:stretch;height:52px;flex:none;border:2px solid ${outline};}`;
  css += `${S} .fm-pdp-qty button{width:44px;display:grid;place-items:center;background:transparent;}`;
  css += `${S} .fm-pdp-qty button:hover:not(:disabled){background:var(--surface-2);}`;
  css += `${S} .fm-pdp-qty button:disabled{opacity:.3;}`;
  css += `${S} .fm-pdp-qty output{min-width:40px;display:grid;place-items:center;font-family:${metaFont};font-size:15px;border-inline:1px solid ${cardDivider};}`;
  css += `${S} .fm-pdp-sq{width:52px;height:52px;flex:none;display:grid;place-items:center;background:transparent;border:2px solid rgba(var(--border-rgb), 0.6);color:rgb(var(--fg-rgb));}`;
  css += `${S} .fm-pdp-sq:hover{border-color:rgb(var(--fg-rgb));}`;

  // Details: tabs + bordered panel, catalogue-record specs.
  css += `${S} .fm-pdp-tabs [role="tablist"]{display:flex;flex-wrap:wrap;}`;
  css += `${S} .fm-pdp-tab{min-height:48px;padding:0 22px;margin-right:-2px;background:transparent;border:2px solid rgba(var(--border-rgb), 0.6);border-bottom:0;font-size:10px;font-weight:900;letter-spacing:.28em;text-transform:uppercase;color:var(--muted);}`;
  css += `${S} .fm-pdp-tab:hover{color:rgb(var(--fg-rgb));}`;
  css += `${S} .fm-pdp-tab[aria-selected="true"]{background:${tabBg};border-color:${tabBg};color:${tabText};}`;
  css += `${S} .fm-pdp-panel{border:${outlineW} solid ${panelBorder};padding:${pad}px;}`;
  css += `${S} .fm-pdp-record{display:grid;grid-template-columns:minmax(110px,190px) minmax(0,1fr);margin:0;}`;
  css += `${S} .fm-pdp-record dt,${S} .fm-pdp-record dd{margin:0;padding:11px 0;border-top:1px solid ${divider};}`;
  css += `${S} .fm-pdp-record dt{padding-right:12px;font-size:9px;font-weight:800;letter-spacing:.3em;text-transform:uppercase;line-height:1.6;color:var(--muted);}`;
  css += `${S} .fm-pdp-record dd{font-family:${metaFont};font-size:14px;line-height:1.5;color:rgb(var(--fg-rgb));}`;
  css += `${S} .fm-pdp-record dt:first-of-type,${S} .fm-pdp-record dd:first-of-type{border-top:0;}`;

  css += `@media (max-width:${PHONE_MAX}px){`
    + `${S} .fm-pdp-media[data-thumbs="side"]{grid-template-columns:minmax(0,1fr);}`
    + `${S} .fm-pdp-media[data-thumbs="side"] .fm-pdp-rail{flex-direction:row;max-height:none;overflow-x:auto;overflow-y:hidden;order:2;}`
    + `${S} .fm-pdp-media[data-thumbs="side"] .fm-pdp-thumb{width:64px;}`
    + `${S} .fm-pdp-card-section,${S} .fm-pdp-panel{padding:${Math.min(pad, 18)}px;}`
    + `${S} .fm-pdp-record{grid-template-columns:minmax(0,1fr);}`
    + `${S} .fm-pdp-record dd{border-top:0;padding-top:2px;}`
    + `}`;
  return css;
}

/** Google Fonts the product-page controls may ask for. */
export const productPageFontNames = (d: any): string[] =>
  [d?.pdpTitleFont, d?.pdpPriceFont, d?.pdpMetaFont].filter(Boolean).map(String);
