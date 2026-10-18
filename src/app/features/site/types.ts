export type BookPhoto = {
  url: string;
  altText?: string;
};

export type Variant = {
  id: string;
  name: string;
  price: number;
  stock: number;
  stockLevel?: number;
  photoUrl?: string;
  sku?: string;
  weight?: string;
};

export type Book = {
  metaTitle?: string;
  metaDescription?: string;
  seoImage?: string;
  seoNoindex?: boolean;
  /** Books › edit › Search (SEO) › Artist links: each credited person's official website. */
  creatorLinks?: { name: string; url: string }[];
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  isbn?: string;
  sku?: string;
  retailPrice: number;
  costPrice?: number;
  stockLevel: number;
  format?: string;
  dimensions?: string;
  weight?: string;
  language?: string;
  status?: string;
  isFeatured?: boolean;
  /** Older records stored the flag as `featured`; still read as a fallback. */
  featured?: boolean;
  scheduleDate?: string;
  categories?: string[];
  photos?: BookPhoto[];
  stripePriceId?: string;
  slug?: string;
  isOnSale?: boolean;
  salePrice?: number;
  variants?: Variant[];
  shippingProfileId?: string;
  authorId?: string;
  relatedBookIds?: string[];
  edition?: string;
  pageCount?: number;
  publisher?: string;
  publishDate?: string;
  /** Answers to the shop's custom book fields (Books › Book fields), keyed by field key. */
  custom?: Record<string, string>;
};

export type LocalFulfillmentAddress = { street: string; unit?: string; city: string; state: string; zip: string; country: string; postalCode?: string };
export type PickupLocation = { id: string; enabled: boolean; name: string; price: number; address: LocalFulfillmentAddress; /** Who may choose this pickup: postal prefixes such as "M" (all of Toronto). Empty = everyone. */ postalPrefixes?: string[]; instructions?: string; hours?: string; estimate?: string; translations?: Record<string, Record<string, string>> };
export type DeliveryZone = { id: string; enabled: boolean; name: string; price: number; minimumSubtotal: number; postalPrefixes: string[]; postalCodes: string[]; instructions?: string; estimate?: string; translations?: Record<string, Record<string, string>> };
export type LocalFulfillmentConfig = { enabled: boolean; pickupLocations: PickupLocation[]; deliveryZones: DeliveryZone[] };

export type SiteSettings = {
  localFulfillment?: LocalFulfillmentConfig;
  announcements?: Array<{ message: string }>;
  maintenance?: { enabled: boolean; message: string };
  /** Most copies one shopper can have set aside at checkout (functions/stockHolds.js). */
  stockHolds?: { perBook: number; units: number; orders: number };
  domain?: { subdomain: string; custom: string };
  info?: { name: string; description: string; website: string; email?: string };
  inventory?: { tracking: boolean; overselling: boolean };
  checkout?: { requirePhone: boolean };
  assets?: { profileUrl: string; faviconUrl: string };
  location?: { street: string; city: string; state: string; zip: string; country: string };
  localization?: { timezone: string; currency: string };
  aiShield?: { blockTraining: boolean; blockShopping: boolean };
  policies?: { shipping: string; returns: string; privacy: string; terms: string; legal: string };
  communications?: {
    orderReceipts: boolean;
    shippingStatus: boolean;
    abandonedCart: boolean;
    receiptMessage: string;
    newOrderNotifications: boolean;
  };
  payments?: {
    shippo?: {
      apiToken?: string;
    };
    stripe: {
      connected: boolean;
      email: string;
      publicKey?: string;
      applePay: boolean;
      googlePay: boolean;
      afterpay: boolean;
      affirm: boolean;
      klarna: boolean;
      subscriptions: boolean;
    };
    paypal: {
      connected: boolean;
      email: string;
      clientId?: string;
      venmo: boolean;
      buyNowPayLater: boolean;
    };
  };
  taxes?: {
    rates: Array<{ country: string; rate: string | number }>;
  };
    design?: {
      primaryColor?: string;
      font?: string;
      logoUrl?: string;
      logoText?: string;
      logoColor?: string;
      logoTint?: boolean;
      logoHeight?: number;
      logoPosition?: "left" | "center" | "right";
      faviconUrl?: string;
      categories?: string[];
      headerLinks?: {
        showEnterArchive?: boolean;
        showBag?: boolean;
        showSys?: boolean;
      };
      storefront?: any;
      hero?: any;
      [key: string]: any;
    };
    draftDesign?: any;
  };

export type Page = {
  id: string;
  title: string;
  slug: string;
  body: string;
  status: "published" | "draft";
  showInNav: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
  // SEO fields
  seoTitle?: string;
  metaDescription?: string;
  /** Sharing image (social cards, search); blank = the page's first picture, else the site's share image. */
  seoImage?: string;
};
