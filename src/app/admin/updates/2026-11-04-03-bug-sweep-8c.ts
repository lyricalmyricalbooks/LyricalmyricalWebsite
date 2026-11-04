import type { AppUpdate } from "../appUpdates";

export default {
  id: "bug-sweep-8c",
  date: "2026-11-04",
  title: "Shop and checkout fixes",
  summary: "Shoppers whose browser blocks site data no longer get a broken shop or a checkout that always fails at Pay. A box set in the bag no longer stops checkout from loading delivery prices. When fewer copies are left than a shopper has in their bag, checkout now says so instead of quietly lowering the number, and a bag that empties itself explains why. The free-shipping hint at checkout only counts printed books. Opening a bag reminder email on the same device keeps the bag's inscriptions and gift-card recipients. Order tracking finds orders typed in lower case, capitalised book and collection links open the right page, a missing page is hidden from Google, and moving from one book to another no longer carries over an open photo viewer or the Added state.",
  links: [{ label: "Open orders", tab: "orders" }],
} satisfies AppUpdate;
