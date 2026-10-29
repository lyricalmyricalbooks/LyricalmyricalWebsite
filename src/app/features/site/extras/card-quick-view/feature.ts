// "Quick view" pop-up from a shop card (see QuickView.tsx). Display only: Add to bag uses the bag's own rules.
import type { StorefrontFeature } from "../featureKit";

const copy = "Catalog & empty states";

export default {
  id: "card-quick-view",
  style: {
    group: "products", subsection: "Title & price", subsectionAfter: "showQuickAdd", after: "showQuickAdd",
    fields: [
      { key: "showQuickView", label: "“Quick view” button on shop cards (opens a pop-up with the photo, price, short description and Add to bag; words: Text & labels › Catalog & empty states)", kind: "toggle", defaultValue: false },
      { key: "quickViewBlurbLength", label: "Quick view: how much of the description it shows (letters; the pop-up's parts are styled in Catalog & shared content · layout)", kind: "range", min: 40, max: 1200, step: 20, suffix: " letters", defaultValue: 320 },
    ],
  },
  copy: {
    group: copy, after: "cardFormatsLead",
    fields: [
      { key: "quickViewButton", label: "Quick view button on shop cards", default: "Quick view", hint: "Shown only when Theme settings › Book cards in the shop grid › Quick view is on." },
      { key: "quickViewAria", label: "Quick view window name (read aloud by screen readers)", default: "Quick view: {title}", hint: "Use {title} for the book title." },
      { key: "quickViewClose", label: "Quick view close button (read aloud)", default: "Close quick view" },
      { key: "quickViewDetails", label: "Quick view link to the full page", default: "View full details" },
    ],
  },
  regions: {
    group: "catalogElements", after: "catalogShowMore", files: ["features/site/extras/card-quick-view/QuickView.tsx"],
    fields: [
      { id: "quickViewShade", label: "Quick view: shaded backdrop", required: true, copy },
      { id: "quickViewPanel", label: "Quick view: window", required: true, copy },
      { id: "quickViewCloseButton", label: "Quick view: close button", required: true, copy },
      { id: "quickViewPhoto", label: "Quick view: book photo", image: true, copy },
      { id: "quickViewTitle", label: "Quick view: book title", copy },
      { id: "quickViewPrice", label: "Quick view: price", copy },
      { id: "quickViewBlurb", label: "Quick view: short description", copy },
      { id: "quickViewAdd", label: "Quick view: Add to bag button", copy },
      { id: "quickViewLink", label: "Quick view: link to the full page", copy },
    ],
  },
} satisfies StorefrontFeature;
