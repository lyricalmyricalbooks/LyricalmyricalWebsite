# Artist pages

**Asked for:** "help my pages get ranked higher on google … when I type Ian willms the hound I am completely non existant"
**Done means:** every photographer credited on a published book has a crawlable page at `/artists/<slug>` (H1 with their
name, first line naming their books, bio, website links, books), listed in the sitemap, prerender and llms.txt, linked from
the artist name on each book page, fully editable in Studio.

## Before starting

- [x] Reviewed `tasks/lessons.md` (super high design; everything editable in Studio; add SEO wording, don't replace it)
- [x] Read the area guides: root `CLAUDE.md`, `AGENTS.md`, `src/app/features/site/CLAUDE.md`, `src/app/admin/studio/CLAUDE.md`

## Plan

- [x] 1. Shared derivation `features/site/artistPages.mjs` (+ `.d.mts`): names from `creatorNames`, slug, bio, links, books newest first; collisions merge
- [x] 2. `ArtistPage.tsx` + route (lazy, `whenPrerenderedReady`); loading / fresh / loadError / not-found + noindex; prerendered HTML kept while loading (`keep`, PR #903 pattern)
- [x] 3. SEO: title via Title format, description, canonical, ProfilePage/Person + BreadcrumbList JSON-LD
- [x] 4. Book page: artist names link to their page, same look
- [x] 5. Sitemap, prerender route list + wait condition, llms.txt, `firebase.json` rewrite/no-cache, Studio Health route
- [x] 6. Studio: region group `artistLayout` (show/hide + fine-tune per part), Text & labels group "Artist pages", settingsMap heading/blurb
- [x] 7. Tests, release note, agent notes

## Verification

- [x] Tests: `pnpm test` (new: `artistPages.test.ts`, `ArtistPage.render.test.tsx`, sitemap/llms/prerender/hosting/siteHealth cases)
- [x] Typecheck and lint: `pnpm run typecheck`, `pnpm run lint`
- [x] `vite build` + `node scripts/generate-sitemap.mjs` against the live catalog: 7 artist URLs, no group credit
- [x] Screenshots 1440 and 390 of `/artists/ian-willms` on a built preview with the live catalog (`/mnt/project-files/seo/artist-pages/`)
- [x] Studio control audit for the book-page group (fixture book now has a credit, bio and link): re-recorded, then re-checked green

## Progress notes

- Real catalog showed "Collection of International Artists" as a person: widened the shared group-credit rule (both copies, parity test).
- The real Ian Willms bio starts "(b. 1985)": `leadSentences` cut there, now it only splits before a capital.
- The artist page first inherited the Custom pages surface's dark text on the black shop: it now keeps the shop's colours and reads only the Custom pages type/rule settings.

## Review

Artist pages derive from the catalog only (no Firestore change, no rules, no Functions). Not done on purpose: an `/artists`
index page (not needed; the breadcrumb's "Artists" is plain text and left out of the BreadcrumbList). The full Studio control
audit and Studio browser checks run in CI; locally the book-page group audit and `test:studio` were run.
