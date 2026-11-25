# SEO audit round 2 (25 November 2026)

Follow-up to the 25 Nov measured audit (/mnt/project-files/seo/seo-audit-2026-11-25.html).

- [x] Re-audit a fresh local build: 24 prerendered pages, titles, descriptions, h1, alt, robots, JSON-LD, sitemap.
- [x] About → AboutPage, Contact → ContactPage, other info pages WebPage, all linked by @id to #organization/#website.
      History stays WebPage: the Press/Books relationship is unconfirmed.
- [x] Release note. Tests, typecheck, lint.

The soft 404 and phone photo sizes are fixed in PR #905 (dropped from this PR to avoid overlap).

## Review
Rebuilt and prerendered: /page/about = AboutPage, /page/contact = ContactPage, both `about` #organization; policy pages WebPage.
