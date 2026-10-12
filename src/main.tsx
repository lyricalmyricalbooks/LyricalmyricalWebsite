
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { startPreviewTab } from "./app/features/site/previewTab";
  import { captureSharedDiscount } from "./app/features/site/sharedDiscount";
  import { takeMovedState } from "./app/features/site/movedState";
  import { installTranslateSafeDom } from "./app/lib/translateSafeDom";

  // Shoppers may translate the page with Google Translate: keep React from crashing on the translated text.
  installTranslateSafeDom();

  // Arriving from the old GitHub Pages address: take the bag/wishlist/order key it handed over, tidy the address.
  takeMovedState();
  // Studio › "Preview in new tab": receive the unsaved draft (no-op for shoppers).
  startPreviewTab();
  // Admin › Discounts › Copy share link: remember ?discount=CODE for checkout and tidy the address.
  captureSharedDiscount();

  createRoot(document.getElementById("root")!).render(<App />);
  
