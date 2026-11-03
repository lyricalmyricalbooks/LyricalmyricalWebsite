# Lessons

Rules learned from the owner's corrections. **Read this at the start of every task.** After any new correction, add a
rule under the right heading: what to do (or never do), then **Why:** with the date and what happened. Keep each rule
short; edit an old rule instead of adding a near-duplicate.

## Design (everything shopper- or admin-facing)

- **Ship only "super high design".** Strict type scale, spacing rhythm, grid alignment, restraint, polish and
  consistency. Verify with browser screenshots before merging; never ship something that merely works but looks
  average. **Why:** standing rule, 22 Oct 2026.
- **When the owner picks a design concept, build all of it in the first PR.** Before merging, compare the result
  against the concept item by item and list anything left out. **Why:** the first Overview concept A build did only
  part of it (21 Oct 2026: "not sure why it wasn't completely fixed before").
- **Shopper-facing parts are editable in Studio.** Each new part gets a Style control and its words in Text & labels,
  with no hard-coded colours. **Why:** checkout redesign, 22 Oct 2026 ("everything editable in the designer").

## Admin UI

- **Inventory's use of Riso is the reference for every admin page** (components, type, colours, spacing, tables,
  buttons), now in the flat "Pressroom" layer: flat sheets, ledger figures, 36px flat buttons. Compose the shared
  `.rp-*` pieces; never hand-roll a page-only restyle. **Why:** 22 Oct 2026, two coexisting looks were the main
  inconsistency.
- **Never use the old ugly admin style:** red-square eyebrow labels, explanatory paragraphs under headings,
  multi-sentence descriptions, heavy shadowed boxes, chunky outlined/shadow or uppercase buttons, numbered step
  headings stacked on one page. **Why:** the owner was angry twice on 22 Oct 2026 (shipping profiles PR #731/#733,
  Settings › General PR #735): "keep running into the ugly design features, stop doing this".
- **Admin copy is short, sharp and stylish:** one punchy line at most (card descriptions ≤ 70 characters).
  **Why:** 22 Oct 2026, "this is not sexy wording, do better".
- **Every admin page uses the Masthead header:** one big title, underlined sub tabs right under it, numbers in one
  strip, small filter chips, and **no description line under the title**. A page never repeats its own title.
  **Why:** chosen 20 Oct 2026 from six concepts.
- **Prefer sub tabs over long single pages** when adding to an admin page. **Why:** 20 Oct 2026, reads cleaner.
- **The admin rail's sub line reads "Website admin"**, never "Back office". **Why:** PR #782, 22 Oct 2026.

## Shipping work

- **Ship a PR early, keep follow-ups small.** With parallel helpers, open the PR with what is done instead of waiting
  for every helper; still run tests and a fresh-context review before merging. **Why:** 20 Oct 2026, the owner
  complained the agents "aren't working" and wanted the PR.
- **Merge your own PR once every check is green and there are no conflicts**, without asking. Merging deploys live.
  If the owner merged first, start the next change on a new branch and PR. **Why:** standing rule since 12 Oct 2026.
- **Add SEO wording; don't replace existing wording.** **Why:** owner preference, 20 Oct 2026.
- **Don't suggest "moving to the domain".** The shop has lived at lyricalmyricalbooks.com since 18 Oct 2026.

## Repo gotchas that cost time before

- **Use `pnpm install --frozen-lockfile`**, not plain `npm install`: drifting packages cause a false typecheck error
  in `StripeCardForm.tsx`. **Why:** 18 Oct 2026.
- **The guest order create rule in `firestore.rules` is at the rules engine's budget.** A new browser-written order
  field must be one string with a size check, not a map checked per key, and only the emulator shows the denial.
  **Why:** 18 Oct 2026, orders went PERMISSION_DENIED.
- **Never start "Deploy storefront" by hand while "Deploy Firebase" is failing** when the frontend needs new rules.
- **Each PR adds its own release-note file**; never edit another PR's note file. **Why:** parallel PRs conflicted.
