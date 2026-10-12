// How Studio presents its (very many) controls to a shop owner — a pure, UI-free map.
//
// Nothing here adds or removes a control: it only decides WHERE each existing Theme setting and
// Text & labels group appears (task-based headings, sub-sections inside big groups) and which values
// differ from the defaults ("changed" badges, "What I've changed", Reset to default). Every
// STYLE_GROUPS / COPY_SCHEMA group must sit under exactly one heading (settingsMap.test.ts), and any
// field not listed in a sub-section still shows under "More settings", so editing power is unchanged.

import { REGION_GROUPS } from "../../features/site/storefrontRegions";
import { readStyle, type StyleField, type StyleGroup } from "./styleSchema";

/** Studio-only categories that are not STYLE_GROUPS (they have bespoke panels in StudioEditor). */
export const EXTRA_STYLE_CATEGORIES: Record<string, { title: string; blurb: string }> = {
  themeLook: { title: "Theme presets & saved themes", blurb: "One-click looks, the Riso Noir style, and designs you've saved or downloaded." },
  paymentIcons: { title: "Payment icons", blurb: "Which card and wallet logos the footer shows." },
};

export type SettingsHeading = {
  id: string; title: string; blurb: string; groups: string[]; advanced?: boolean;
  /** Starts a band of headings ("Site-wide design", "Parts of your shop"). */
  band?: string;
};

const REGION_IDS = REGION_GROUPS.map((g) => g.id);

/**
 * Theme settings home. The site-wide design system first (one change restyles the whole shop),
 * then the parts of the shop (each also editable by clicking it on the page), then advanced tools.
 */
export const THEME_HEADINGS: SettingsHeading[] = [
  { id: "system", band: "Site-wide design", title: "", blurb: "Presets, brand, colours, fonts, buttons and spacing used on every page. One change restyles the whole shop.",
    groups: ["themeLook", "logo", "colors", "schemes", "type", "smallPrint", "buttons", "layout", "effects", "riso"] },
  { id: "chrome", band: "Parts of your shop", title: "Header, menu & footer", blurb: "The parts that repeat at the top and bottom of every page. Tip: click one in the preview to edit it there.",
    groups: ["header", "navlinks", "footer", "popup", "paymentIcons"] },
  { id: "shop", title: "Shop & book pages", blurb: "The book grid, book cards and each book's own page.",
    groups: ["products", "catalog", "labels", "productPage", "productCard", "catalogLayout"] },
  { id: "buy", title: "Bag, checkout & accounts", blurb: "Everything after a shopper presses Add to bag.",
    groups: ["cartDrawer", "checkout", "accounts"] },
  { id: "pages", title: "Pages & features", blurb: "Custom pages (About, Journal…) and switching whole features on or off.",
    groups: ["customPages", "elements"] },
  { id: "elements", band: "Advanced", title: "Fine-tune single elements", advanced: true,
    blurb: "Spacing, size, borders and visibility for one element at a time, per screen size. Quicker: click the element in the preview.",
    groups: REGION_IDS },
  { id: "code", title: "Custom code", advanced: true, blurb: "Your own CSS or scripts (public pages only).", groups: ["code"] },
];

/**
 * Where each part-of-the-shop category can be seen, for "Show on page": the page to open (none =
 * stay on the current page) and a pop-over to open first. Studio then selects the first part on that
 * page linked to the category, in the inspector.
 */
export const CATEGORY_PAGES: Record<string, { template?: string; overlay?: "cart" | "search" | "popup" }> = {
  header: {}, navlinks: {}, footer: {}, paymentIcons: {}, popup: { overlay: "popup" },
  products: { template: "storefront" }, catalog: { template: "storefront" }, labels: { template: "productPage" },
  catalogLayout: { template: "storefront" }, productPage: { template: "productPage" }, productCard: { template: "productPage" },
  cartDrawer: { overlay: "cart" }, checkout: { template: "cartPage" }, accounts: { template: "accountPage" },
  customPages: { template: "page" },
};

/** One plain-English line under each category name (falls back to the group's own hint). */
export const GROUP_BLURBS: Record<string, string> = {
  colors: "Page background, text, accent and status colours.",
  schemes: "Named colour sets for sections, book cards, the buy card and the bag, with contrast checks.",
  popup: "When the pop-up opens, how often, where and how wide. Its content is the Pop-up sections in Page layout.",
  type: "Heading, body and menu fonts, sizes and weights.",
  buttons: "Button style, colours and corners.",
  logo: "Logo image or text wordmark, and the picture shown when your shop is shared.",
  riso: "The printed-paper texture and ink effects of the Riso look.",
  effects: "Animations, hover effects and section spacing.",
  header: "Header layout and colours, the announcement bar, and which icons show.",
  navlinks: "Size, colour and spacing of menu links, and the drop-down menus.",
  footer: "Footer layout, social links and what the footer shows.",
  products: "Book cards in the shop grid: columns, photos, title, price and badges.",
  catalog: "The heading, category chips and search above the book grid.",
  labels: "Sale, sold-out and other little labels on books.",
  productPage: "Each book's page: photo layout, add-to-bag button and extras.",
  productCard: "The bordered buy box, breadcrumb and Description / Details tabs.",
  catalogLayout: "Masthead, cover cropping and nav spacing of the shop page.",
  cartDrawer: "The bag that slides in: size, colours, book rows and checkout button.",
  checkout: "Checkout colours, fonts, fields and what the order summary shows.",
  accounts: "Turn customer accounts on or off.",
  customPages: "One look for every custom page: title, text, width and the line under the title.",
  layout: "How wide your content is and the space around it.",
  smallPrint: "The tiny labels and captions everywhere, all at once.",
  elements: "Switch whole storefront features on or off.",
  code: "Your own CSS or scripts (public pages only).",
};

export const blurbFor = (group: StyleGroup | undefined, id: string): string =>
  EXTRA_STYLE_CATEGORIES[id]?.blurb ?? GROUP_BLURBS[id] ?? group?.hint ?? "";

/**
 * Sub-sections inside the bigger categories, so 20–45 controls read as a few short lists.
 * Keys not listed land in a final "More settings" sub-section — nothing can disappear.
 */
export const STYLE_SUBSECTIONS: Record<string, { title: string; keys: string[] }[]> = {
  schemes: [
    { title: "Parts of the shop that follow a scheme", keys: ["elementSchemes.cards", "elementSchemes.buyCard", "elementSchemes.cartDrawer"] },
  ],
  colors: [
    { title: "Main colours", keys: ["backgroundColor", "textColor", "primaryColor", "secondaryColor", "borderColor", "mutedTextColor"] },
    { title: "Panels, links & overlays", keys: ["surfaceColor", "surfaceRaisedColor", "overlayColor", "activeControlBg", "activeControlText", "linkColorHover"] },
    { title: "Status colours", keys: ["successColor", "warningColor", "dangerColor", "favoriteColor"] },
  ],
  type: [
    { title: "Fonts", keys: ["headingFont", "bodyFont", "navFont", "wordmarkFont", "font"] },
    { title: "Sizes & weights", keys: ["baseFontSize", "lineHeight", "headingWeight", "bodyWeight", "letterSpacing"] },
  ],
  logo: [
    { title: "Logo image", keys: ["logoUrl", "logoTint", "logoColor", "shareImageUrl"] },
    { title: "Text wordmark", keys: ["logoText", "wordmarkStyle", "wordmarkPrimary", "wordmarkSecondary", "wordmarkSecondaryMuted", "wordmarkSecondaryColor", "wordmarkSize", "wordmarkWeight"] },
  ],
  header: [
    { title: "Header layout", keys: ["headerStyle", "logoPosition", "logoHeight", "stickyHeader", "transparentHeader", "navStyle", "showMobileNavigation", "showSecondaryNavigation", "showStoreChromeOnUtilityPages"] },
    { title: "Header colours", keys: ["headerBg", "headerColor"] },
    { title: "Announcement bar", keys: ["showAnnouncement", "announcementText", "announcementBg", "announcementColor", "announcementScrolling", "announcementFontSize", "announcementWeight", "announcementTracking", "announcementSpeed", "announcementRotateSeconds"] },
    { title: "Icons & buttons in the header", keys: ["hideHeaderSearch", "hideHeaderWishlist", "hideHeaderAccount", "hideCurrencySelector", "hideThemeToggle", "hideAdminLink", "hideCartButton"] },
  ],
  navlinks: [
    { title: "Link look", keys: ["navLinkColor", "navLinkSize", "navLinkWeight", "navLinkSpacing", "navLinkTransform", "navLinkOpacity"] },
    { title: "Placement & fitting on one line", keys: ["navPlacement", "navGap", "navLineMode", "navFitMin"] },
    { title: "Drop-down menus", keys: ["navFlatSubcategories", "navDropdownHideAll", "navDropdownBg", "navDropdownTextColor", "navDropdownBorderColor", "navDropdownBorderWidth", "navDropdownTransform"] },
    { title: "Sticker pills", keys: ["navPillRadius", "navPillRotate", "navPillActivePalette"] },
  ],
  footer: [
    { title: "Footer layout", keys: ["footerNavigationLayout", "footerColumns", "footerLayout", "footerBg"] },
    { title: "What the footer shows", keys: ["showFooterExplore", "showFooterConnect", "showFooterLegalHeading", "showFooterLocation", "hideNewsletter", "hideRecentlyViewed", "showSocialInFooter", "showPaymentBadges", "showPoweredBy"] },
    { title: "Social links", keys: ["social.instagram", "social.twitter", "social.facebook", "social.tiktok"] },
  ],
  products: [
    { title: "Grid & columns", keys: ["productCardStyle", "productColumnsDesktop", "productColumnsMobile", "catalogGridGap", "productHoverEffect"] },
    { title: "Book photos", keys: ["imageAspectRatio", "photoOutline", "productBorderRadius", "placeholderImageUrl"] },
    { title: "Title & price", keys: ["productTitleColor", "cardTitleSize", "cardTitleSizeMobile", "cardTitleWeight", "cardTitleFont", "cardTitleTracking", "productPriceColor", "cardPriceSize", "cardPriceSizeMobile", "cardPriceWeight", "cardPriceFont", "cardPriceTagBg", "cardPriceOldColor", "catalogPriceStyle", "catalogCardRuleWidth", "showPriceOnHover"] },
    { title: "Sold-out badge", keys: ["showSoldOutBadge", "soldOutBadgeStyle", "soldOutBadgeBg", "soldOutBadgeText", "soldOutBadgeSize", "soldOutBadgePosition", "soldOutPhotoFade"] },
    { title: "Badges & stock", keys: ["badgeBgPrimary", "badgeTextPrimary", "badgeBgSecondary", "badgeTextSecondary", "lowInventoryColor", "lowStockCardThreshold", "showCollectionMeta"] },
    { title: "Card button & product-page extras", keys: ["productCTA", "showQtyStepper", "productDescriptionStyle"] },
  ],
  productPage: [
    { title: "Page layout", keys: ["productImageLayout", "productContentPosition", "productAlignment", "productDetailsLayout"] },
    { title: "Photos", keys: ["productImageMaxWidth", "productImageAspect", "productImageFrameMode", "productImageAspectLandscape", "productPhotoOutline", "productImageFit", "productImageShadow", "productImageHoverScale", "showZoom", "showAmbientGlow", "glowIntensity", "productImageGlowColor"] },
    { title: "Title & add-to-bag button", keys: ["productTitleSize", "productSubtitleWeight", "addToBagLabel", "productCtaWidth", "productCtaSize", "productCtaAnimation"] },
    { title: "Extras on the page", keys: ["showSpecs", "showPdpEditionDetails", "showSocialShare", "showBackInStock", "showBundleWidget", "productBundleLayout", "showRelatedProducts", "recentlyViewedCount", "lowStockProductThreshold"] },
  ],
  productCard: [
    { title: "Buy card box", keys: ["pdpCardBg", "pdpCardBorderColor", "pdpCardBorderWidth", "pdpCardShadowColor", "pdpCardShadowOffset", "pdpCardPadding", "pdpCardDividerColor"] },
    { title: "Title, price & stock", keys: ["pdpEditionPicker", "pdpStickyBar", "pdpStickyPhoneOnly", "pdpShowBuyNow", "pdpShowTag", "pdpTagStyle", "pdpTitleFont", "pdpTitleSize", "pdpTitleSizeMobile", "pdpTitleColor", "pdpTitleCase", "pdpPriceFont", "pdpPriceSize", "pdpPriceSizeMobile", "pdpPriceColor", "pdpShowStock", "pdpStockColor"] },
    { title: "Photo frame & thumbnails", keys: ["pdpThumbPosition", "pdpThumbWrap", "pdpThumbActiveColor", "pdpPhotoBorderColor", "pdpPhotoBorderWidth", "pdpShowCaption"] },
    { title: "Description / Details tabs", keys: ["pdpDetailsPlacement", "pdpSpecsStyle", "pdpTabActiveBg", "pdpTabActiveText", "pdpPanelBorderColor", "pdpPanelTextWidth"] },
    { title: "Breadcrumb & small labels", keys: ["pdpShowBackLink", "pdpShowBreadcrumb", "pdpMetaFont", "pdpMetaSize", "pdpMetaColor"] },
  ],
  catalogLayout: [
    { title: "Masthead", keys: ["catalogLayoutStyle", "catalogMastheadText", "brandTransform", "catalogMastheadDesktop", "catalogMastheadMobile", "catalogHeaderWidth", "catalogHeaderRuleWidth"] },
    { title: "Navigation & cart button", keys: ["catalogNavGapDesktop", "catalogNavGapMobile", "referenceCategoryLimit", "catalogCartPlacement", "catalogCartTotalPlaceholder"] },
    { title: "Book covers", keys: ["catalogTitleTransform", "catalogImageFit", "catalogImageFocalX", "catalogImageFocalY"] },
  ],
  cartDrawer: [
    { title: "Size & position", keys: ["cartDrawerSide", "cartDrawerWidth", "cartDrawerPadding"] },
    { title: "Colours & outline", keys: ["cartDrawerBg", "cartDrawerText", "cartDrawerMuted", "cartDrawerSurface", "cartDrawerBorder", "cartDrawerEdgeColor", "cartDrawerEdgeWidth", "cartDrawerShadowColor", "cartDrawerShadowOffset", "cartDrawerBackdropColor", "cartDrawerBackdropBlur"] },
    { title: "Heading & fonts", keys: ["cartDrawerTitleFont", "cartDrawerTitleSize", "cartDrawerTitleCase", "cartDrawerMetaFont", "cartDrawerMetaSize", "cartDrawerShowCount"] },
    { title: "Free-shipping bar", keys: ["showFreeShipBar", "cartDrawerProgressColor", "cartDrawerProgressTrack", "cartDrawerProgressHeight"] },
    { title: "Book rows", keys: ["cartDrawerShowItemNumbers", "cartDrawerThumbWidth", "cartDrawerThumbOutline", "cartDrawerGrayscaleThumbs", "cartDrawerItemTitleSize", "cartDrawerShowUnitPrice", "cartDrawerShowLineTotal", "cartDrawerShowPreorder", "cartDrawerShowLineOptions", "cartDrawerQtyStyle", "cartDrawerRemoveStyle"] },
    { title: "Suggestion card", keys: ["cartDrawerShowUpsell", "cartDrawerUpsellShadow"] },
    { title: "Total & checkout button", keys: ["cartDrawerShowSummary", "cartDrawerShowShippingPreview", "cartDrawerTotalSize", "showCartTrustBadges", "cartDrawerCheckoutBg", "cartDrawerCheckoutText", "cartDrawerCheckoutHeight", "cartDrawerCheckoutShadow", "cartDrawerShowCheckoutArrow", "cartDrawerShowDeliveryNote"] },
    { title: "Empty bag", keys: ["cartDrawerShowEmptyIcon", "cartDrawerShowEmptyButton", "cartDrawerEmptyLink"] },
  ],
  checkout: [
    { title: "What shoppers see", keys: ["showOrderNote", "hideCheckoutAddressUnit", "hideCheckoutPaymentTotal", "hideCheckoutExpressWallets", "hideAddressSuggestions", "checkoutPinnedCountries", "hideCountryFlags", "checkoutSummaryOpenOnPhones", "hidePayButtonTotal", "alwaysShowDiscountBox", "showCheckoutGiftCardBox", "showCheckoutAutoDiscountHint", "hideCheckoutFreeShipNudge", "hideCheckoutLowStock", "hideCheckoutPolicyLinks"] },
    { title: "Colours", keys: ["checkoutAccentColor", "checkoutBgColor"] },
    { title: "Fonts & form fields", keys: ["checkoutHeadingFont", "checkoutFont", "checkoutFieldFont", "checkoutFieldBg", "checkoutFieldText", "checkoutFieldBorder", "checkoutInputRadius"] },
    { title: "Card payment form", keys: ["stripeFormBg", "stripeFormPadding"] },
  ],
  customPages: [
    { title: "What custom pages show", keys: ["showPageFooter", "showNotFoundMessage", "showNotFoundBack", "pageShowEyebrow"] },
    { title: "Page title", keys: ["pageTitleSize", "pageTitleUppercase", "pageTitleColor", "pageTitleFont", "pageTitleSizePx", "pageTitleSizePxMobile", "pageTitleWeight", "pageTopSpacing"] },
    { title: "Text & column", keys: ["pageChromeStyle", "pageBodySize", "pageTextColor", "pageAlign", "pageWidth", "pageTextMeasure"] },
    { title: "Line under the title", keys: ["pageShowRule", "pageRuleColor", "pageRuleWidth", "pageRuleSpacing"] },
  ],
};

export const MORE_SETTINGS = "More settings";

/** A group's fields split into its sub-sections (unlisted fields → "More settings"); one section when unmapped. */
export function subsectionsFor(group: StyleGroup): { title: string; fields: StyleField[] }[] {
  const map = STYLE_SUBSECTIONS[group.id];
  if (!map) return [{ title: "", fields: group.fields }];
  const byKey = new Map(group.fields.map((f) => [f.key, f]));
  const used = new Set<string>();
  const out = map.map((s) => ({
    title: s.title,
    fields: s.keys.flatMap((k) => { const f = byKey.get(k); if (!f) return []; used.add(k); return [f]; }),
  })).filter((s) => s.fields.length);
  const rest = group.fields.filter((f) => !used.has(f.key));
  if (rest.length) out.push({ title: MORE_SETTINGS, fields: rest });
  return out;
}

// ── "Changed from default" ────────────────────────────────────────────────

const same = (a: any, b: any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The value Reset to default restores: the site's default design, else nothing (= storefront default). */
export const defaultFor = (field: StyleField, defaults: any) => readStyle(defaults, field.key);

/** True when the owner (or a theme preset) set this control to something other than its default. */
export function isChanged(field: StyleField, design: any, defaults: any): boolean {
  const value = readStyle(design, field.key);
  if (value === undefined || value === null) return false;
  const base = defaultFor(field, defaults) ?? field.defaultValue;
  if (value === "" && (base === undefined || base === null || base === "")) return false;
  return !same(value, base);
}

export function changedFields(group: StyleGroup, design: any, defaults: any): StyleField[] {
  return group.fields.filter((f) => isChanged(f, design, defaults));
}

/** Changed-field counts for every category, plus the total (for badges and "What I've changed"). */
export function changedCounts(groups: StyleGroup[], design: any, defaults: any): { byGroup: Record<string, number>; total: number } {
  const byGroup: Record<string, number> = {};
  let total = 0;
  for (const g of groups) {
    const n = changedFields(g, design, defaults).length;
    if (n) { byGroup[g.id] = n; total += n; }
  }
  return { byGroup, total };
}

// ── Text & labels ─────────────────────────────────────────────────────────

export const TEXT_HEADINGS: { id: string; title: string; groups: string[] }[] = [
  { id: "everywhere", title: "Across the whole shop", groups: ["Site & sharing", "Header", "Footer", "Newsletter", "Cookie banner", "Sections"] },
  { id: "shop", title: "Shop & book pages", groups: ["Catalog & empty states", "Collection & wishlist pages", "Search & filters", "Product page", "Reviews"] },
  { id: "buy", title: "Bag, checkout & accounts", groups: ["Cart", "Checkout", "Order tracking", "Customer account"] },
  { id: "special", title: "Special pages & messages", groups: ["Custom pages & 404", "Loading screen", "Under construction", "Maintenance page"] },
];

export const TEXT_BLURBS: Record<string, string> = {
  "Site & sharing": "Your shop name, default page title and description for search and sharing.",
  Header: "Menu words, the phone menu button and header labels.",
  Footer: "Footer headings, policy links and small print.",
  Newsletter: "The email sign-up box.",
  "Cookie banner": "The cookie consent message and its buttons.",
  Sections: "Fallback words used inside page sections.",
  "Catalog & empty states": "Shop heading and the message when nothing matches.",
  "Collection & wishlist pages": "Category pages and the saved-books page.",
  "Search & filters": "The search box, filter and sort words.",
  "Product page": "Add to bag, stock lines, tabs and other book-page words.",
  Reviews: "Review form, ratings and moderation messages.",
  Cart: "The bag: heading, totals, buttons and empty-bag message.",
  Checkout: "Every checkout step, field, error and the payment area.",
  "Order tracking": "The order-tracking page and its status messages.",
  "Customer account": "Sign-in, account pages and their messages.",
  "Custom pages & 404": "Missing-page message and custom-page helper words.",
  "Loading screen": "Words on the loading splash.",
  "Under construction": "The 'coming soon' page.",
  "Maintenance page": "The page shown while the shop is paused.",
};

/**
 * Sub-sections inside the long text groups. Each key goes to the first sub-section (in `order`)
 * whose pattern matches; keys no pattern matches land in "More words", so nothing can disappear.
 */
type TextSub = { title: string; match: RegExp; order?: number };
export const TEXT_SUBSECTIONS: Record<string, TextSub[]> = {
  Checkout: [
    { title: "Steps & headings", match: /^co(Brand|Return|Secure|Progress|Step|Contact$|Delivery$|Payment$|Summary|ShowSummary|HideSummary|ItemCount)/ },
    { title: "Contact & address fields", match: /^co(SignedIn|Google|Email|Name|Address|Country|City|State|Zip|Phone|Bill|EnterAddress)/ },
    { title: "Shipping, pickup & delivery", match: /^co(Ship|Fulfillment|Rates|ArrivesBy|FreeShip|Packed|Pickup|Carrier|Estimated|Free$|NoShipping|Preorder|TaxLater)/ },
    { title: "Payment & the Pay button", match: /^co(Payment|Card|Pay|PayPal|Paypal|PlaceOrder|Processing|Stripe|Trust|Guarantee|TestMode|NoPayment|PrivacyNote|Policy|OnlyLeft|Express|OrderNote|Rates)/ },
    { title: "Discount codes", match: /^co(HaveCode|Discount|Apply)/ },
    { title: "Gift cards, automatic offers & free gifts", match: /^co(GiftCard|Auto|FreeGift|Line)/ },
    { title: "After the order", match: /^co(Thanks|Account|Pending|Continue|OrderPlaced|OrderConfirmed|Finalizing|CheckEmail|OrderNumber|ConfirmationSent|Confirming|Success|TrackOrder)/ },
    { title: "Empty bag", match: /^coEmpty/ },
    { title: "Error messages", order: -1, match: /^co(Err|ServerRefused|TotalChanged|BelowMinimum|BagUpdated|Catalog|PaymentCanceled|PaymentNotFinished|DiscountInvalid|DiscountExpired|DiscountRejected|CheckoutFailed)|Error$|Failed$/ },
  ],
  "Order tracking": [
    { title: "Find your order", match: /^track(Eyebrow|Title|Subtitle|Order|Email|Submit|Loading|Link|Found|Back|Another|Created|Help)/ },
    { title: "Order status & timeline", match: /^track(Timeline|Step|InTransit|Shipment|Paid|Unpaid|Awaiting|Cancelled|Refunded|StillUnpaid|Recheck|Preorder)/ },
    { title: "Delivery & pickup", match: /^track(Fulfillment|Pickup|LocalDelivery|Collected|ReadyFor|OutFor|Logistics|Carrier|Shipping|ShipTo|Expected)/ },
    { title: "Items & totals", match: /^(track(Items|TotalPayable|Digital|Download|AddOn|GiftCard|FreeGift|BoxSet)|qtyLine|summary)/ },
    { title: "Cancel, return & privacy requests", match: /^track(Req|Return|Privacy)/ },
    { title: "Errors & email links", order: -1, match: /^track(Err|Error|Unsub)/ },
  ],
  "Customer account": [
    { title: "Signing in", match: /^account(Title|Subtitle|SignIn|Email|Magic|CheckInbox|Resend|UseDifferent|Or$|Google|ConfirmEmail|SignedIn|LinkSent|Off)/ },
    { title: "Account pages", match: /^account(Storefront|Portal|SignOut|Wishlist|Saved|Orders|Transacted|Shipping|BackToStore)/ },
    { title: "Saved address", match: /^account(Address|Field|Phone|Street|SaveAddress|Abort|Cancel$|Unconfigured)/ },
    { title: "Order history", match: /^(account(History|Items|AddOn|GiftCard|FreeGift|BoxSet|Dispatch|ShipTo|Logistics|Manage|Close|Delivered|Cancelled|Awaiting|Track|Unfulfilled|Shipped|Processing|Paid|Unpaid|Refunded|PartiallyRefunded|BookCount)|carrierLabel|trackingCodeLabel)/ },
    { title: "Downloads", match: /^account(Digital|Ebook|Download$)/ },
    { title: "Error messages", order: -1, match: /^account.*Error$/ },
  ],
  "Product page": [
    { title: "Photos & breadcrumb", match: /^(pdpCrumb|pdpBreadcrumb|pdpCaption|pdpPhotos|ariaGoToPhoto|ariaPrevPhoto|ariaNextPhoto|bookPhotoAlt|backToCatalog|categoryFallback)/ },
    { title: "Buy box, stock & pre-orders", match: /^(pdpInStock|pdpBackorder|pdpPreorder|pdpSaleEnds|preorder|addToBag|pdpBuyNow|onlyLeft|saveAmount|priceOnRequest|ariaQty|bookAdded|bookFormat|wishlist|bookShare|bookLinkCopied)/ },
    { title: "Extras, box sets & gift cards", match: /^(pdpAddOn|pdpBoxSet|pdpGift)/ },
    { title: "Description, details & tabs", match: /^(tab|spec|productDescriptionLabel|noDescription|pdpDetailsAria)/ },
    { title: "Back-in-stock alert", match: /^alert/ },
    { title: "Related books & bundles", match: /^(related|bundle)/ },
  ],
  Cart: [
    { title: "Bag heading, rows & total", match: /^cart(Title|Empty|Count|Close|Each|Remove|Subtotal|Shipping|Total|Checkout|Delivery|Continue|OnlyAvailable|Qty|Decrease|Increase|Preorder|AddOn|GiftCard|BoxSet)/ },
    { title: "Free-shipping bar & suggestion", match: /^cart(FreeShip|Upsell)/ },
    { title: "Shipping cost preview", match: /^cartEstimate/ },
    { title: "Trust badges", match: /^trust/ },
  ],
};

export const MORE_WORDS = "More words";

/** A text group's fields split into its sub-sections (unmatched → "More words"); one section when unmapped. */
export function textSubsectionsFor<T extends { key: string }>(group: { group: string; fields: T[] }): { title: string; fields: T[] }[] {
  const subs = TEXT_SUBSECTIONS[group.group];
  if (!subs) return [{ title: "", fields: group.fields }];
  const byPriority = [...subs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const home = new Map<string, string>();
  for (const f of group.fields) {
    const sub = byPriority.find(x => x.match.test(f.key));
    home.set(f.key, sub ? sub.title : MORE_WORDS);
  }
  const out = subs.map(x => ({ title: x.title, fields: group.fields.filter(f => home.get(f.key) === x.title) })).filter(x => x.fields.length);
  const rest = group.fields.filter(f => home.get(f.key) === MORE_WORDS);
  if (rest.length) out.push({ title: MORE_WORDS, fields: rest });
  return out;
}

/** Labels the owner rewrote (including deliberately blank ones). */
export function changedCopyCount(fields: { key: string }[], design: any): number {
  return fields.filter((f) => typeof design?.copy?.[f.key] === "string").length;
}
