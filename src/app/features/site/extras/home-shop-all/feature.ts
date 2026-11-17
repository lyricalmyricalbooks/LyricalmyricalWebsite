// “Shop all books” link under the home page sections (see HomeShopAll.tsx). Display only.
import type { StorefrontFeature } from "../featureKit";

export default {
  id: "home-shop-all",
  style: {
    group: "elements", after: "showCollectionBreadcrumbs",
    fields: [
      { key: "showHomeShopAll", label: "“Shop all books” link under the home page sections", kind: "toggle", defaultValue: true },
    ],
  },
  copy: {
    group: "Catalog & empty states",
    fields: [
      { key: "homeShopAll", label: "Home page “Shop all books” link", default: "Shop all books", hint: "Under the home page sections; opens every book in the shop. Shown while Style › Show or hide whole features › “Shop all books” link is on." },
    ],
  },
  regions: {
    group: "catalogElements", files: ["features/site/extras/home-shop-all/HomeShopAll.tsx"],
    fields: [
      { id: "homeShopAll", label: "Home “Shop all books” link", copy: "Catalog & empty states" },
    ],
  },
} satisfies StorefrontFeature;
