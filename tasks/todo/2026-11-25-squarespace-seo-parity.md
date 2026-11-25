# Adopt Squarespace's SEO practices

**Asked for:** "take best seo practises from squarespace, do research and implement into my website"
**Done means:** Squarespace's built-in SEO features were compared with the shop, and only the real gaps were built.

## Before starting

- [x] Reviewed `tasks/lessons.md` (add SEO wording, never replace it; admin copy one short line; merge own PR when green)
- [x] Read the area guides: `src/app/features/site/CLAUDE.md`, `src/app/admin/studio/CLAUDE.md`

## Research (Squarespace, Nov 2026)

Already in the shop: per-page/book SEO title + description with search preview, character hints, AI and auto-fill
writers, social image per page with site fallback, title format template, noindex per book, automatic sitemap with
images, robots, structured data, canonicals, clean slugs, redirects (more in PR #910), Google Search Console token,
AI photo descriptions, per-book SEO checks, llms.txt. Skipped: AMP (Google dropped it), the "add an FAQ" checklist
nudge (no evidence it helps), Search Console keyword panel (owned by the "Plan SEO improvements" thread).

## Plan (the gaps)

- [x] 1. Hide a Studio page from search engines (Squarespace's per-page setting): `Page.seoNoindex`, PageView noindex,
      left out of sitemap + llms.txt, still prerendered so Google can read the tag; flag in the page list; skipped by
      "Fill in missing search listings".
- [x] 2. Bing Webmaster Tools verification token next to Google's (msvalidate.01 meta).
- [x] 3. Site-wide photo-description count (Squarespace's "42 of 42 images have alt text") as a ready-to-sell check
      on the Overview, naming books hidden from search.

## Verification

- [x] Tests: new cases in sitemapData, llmsTxt, seo, indexShell, launchReadiness; full `pnpm test`
- [x] Typecheck and lint
- [x] Screenshot of the Studio page editor (fixture)

## Review

Built three small additions; no wording replaced. Bing import via Search Console (other thread) and this token are
alternatives: either verifies the site.
