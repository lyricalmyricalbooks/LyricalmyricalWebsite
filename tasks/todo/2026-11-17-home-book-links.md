# Home page book links (SEO code audit follow-up)

- [x] Book sections render real `<a href="/books/<slug>">` links (whole card where it holds no other control, else the title)
- [x] Plain clicks still open the book in the app; Ctrl/Cmd/middle click open a new tab
- [x] Test: `sectionBookLinks.render.test.tsx` (every book section links, no link inside a button or link)
- [x] `cardClasses.test.tsx` reads the heading around a title link
- [x] Screenshots in the Studio fixture: featured collection, featured product, book spotlight look unchanged
- [x] Full vitest, typecheck, lint

## Review
Price-currency finding from the audit was re-checked and left alone: the book page's price data deliberately matches the
price the visitor sees (Google requires structured data to match the visible price). `/collections/all` was not added to
the sitemap: it would duplicate the "Publications" collection. Old-site trailing-slash redirects could not be checked from
the build machine (no outbound access to the live site).
