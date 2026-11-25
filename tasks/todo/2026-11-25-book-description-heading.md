# Heading above a book's description (keyword plan, 25 Nov 2026)

Keyword plan: book pages get an "About the book" heading carrying each book's theme phrase (e.g. "Greyhound bus
photobook" for The Hound). Book pages had only the h1; tab labels are buttons and description headings are h3/h4.

- [x] Per-book `aboutHeading` (Catalog › book › Search engine listing). Blank adds nothing, so no existing page changes.
- [x] Rendered as the page's `<h2>` above the description in every details layout (tabs, accordions, sections),
      styled by the existing Studio description-heading style (`fm-pdp-desc-heading`), no top margin as first child.
- [x] Render test for all three layouts, blank heading and empty description.
- [x] Screenshots at 1440 and 390 with the heading on The Hound.

## Review
Reuses the description heading style, so there are no new Studio controls. The words are per-book data, like the
description. Each book's phrase comes from the keyword plan: the owner pastes it in.
