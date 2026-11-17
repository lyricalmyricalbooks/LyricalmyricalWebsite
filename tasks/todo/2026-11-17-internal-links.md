# Internal links between shop pages (17 Nov 2026)

From the internal linking report (`/mnt/project-files/seo/internal-linking-2026-11-17.md`); Julian asked for items 1–5.

- [x] 1. Page-opening buttons become real links, same look: shop filter-bar and category chips (`/collections/<slug>`, plain
      click still filters in place on the shop page), Featured book + Spotlight buttons, hero and image banner buttons with a
      link, showcase grid covers, book page Back (to the book's collection; plain click still goes back).
- [x] 2. Book page category tag links to every shop category the book is in.
- [x] 3. Footer Collections group, on by default (`showFooterCollections`, words `footerCollectionsHeading`).
- [x] 4. Collection breadcrumb on by default (`showCollectionBreadcrumbs !== false`); its BreadcrumbList includes the parent.
- [x] 5. “Shop all books” under the home sections (`extras/home-shop-all`, `showHomeShopAll`, words `homeShopAll`).

## Verification
- [x] vitest (all pass), typecheck, lint; new render tests for the section links, footer collections and Shop all.
- [x] Local dev against live data: book tag → /collections/books, Back → history, collection crumb Home / Publications / Zines
      with matching JSON-LD, footer desktop + phone screenshots, no page errors.

## Review
Live home shows the shop grid (Home sections are off), so “Shop all books” appears only once Home sections are used; the grid
already lists every book. Owner's earlier rule "revived controls start Off" is overridden here by his explicit ask to turn the
collection breadcrumb on by default.
