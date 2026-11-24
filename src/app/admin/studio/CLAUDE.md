# Studio (the theme editor)

Studio is the only designer. Read `docs/THEME_EDITOR.md` too before changing it. The repo-wide rules are in the root `CLAUDE.md`.

## Standing rules

### Studio is the only designer
- Add or change every theme/design feature in Studio (`studio/StudioEditor.tsx`); the old editors and `?editor=legacy` are gone. Custom pages live only in Studio › Pages: never re-add a separate Pages screen.
- **After every theme-editor change, end the reply with a plain-English click path** in the admin, using the real on-screen labels from the code (tab names, accordion `title`s, button text). Agents can't sign in to `/admin`, so never write it from memory.

### Everything shopper-facing is editable
- Every storefront element needs a Studio control to show/hide it in `STYLE_GROUPS` (`studio/styleSchema.ts`, default = current behaviour) and its words in Text & labels (`COPY_SCHEMA`, via `getCopy(design, key)`), in the same change that adds the element.
- Sentences that reach shoppers indirectly are copy too: errors, notices, SEO titles, template `aria-label`/`alt`, renderer fallbacks. Inside `SectionComponents.tsx` use `sectionFallbacks.ts` `fb("Type.field")` with `??`. Behaviour numbers and the placeholder image are Style controls (`designNumber()`, `placeholderImage()`). Guarded by `noHardwiredMessages.test.ts`, `sectionFallbacks.test.ts`, `storeCopy.coverage.test.ts`.
- No hard-coded colours: use a design key or `var(--token, #hex)` (hex only as a fallback), never literal `rgb()/hsl()`. Every Tailwind colour class the storefront uses goes in `features/site/storefrontColorClasses.ts`. `RISO_STOREFRONT_CSS` stays token-driven; `--*-rgb` triplets are comma-separated. Every section default needs a Content field. Enforced by `designerCoverage.test.ts`, `studioCoverage.test.ts`, `themeTokens.test.ts`.
- Theme presets (`studio/themeLibrary.ts`) and the brand kit may only set keys that have a Style control (`themeLibrary.test.ts`, `brandKit.test.ts`). Add the control with the key; never allowlist around a test.
- No sample books or announcements for shoppers: empty-section samples show only in the preview (`noSampleContent.test.tsx`).

### Controls must reach the shop
- Every control has a baseline file in `scripts/studio-control-baseline/` (`visible`/`css-only`/`dom-only`, or `none: <reason>`). After adding or changing one run `AUDIT_UPDATE=1 node scripts/studio-control-audit.mjs` and commit; never mark a working control `none`.
- `storefrontOverrides.test.ts` fails on a `STYLE_GROUPS` control nothing reads: wire it or delete it. Any new storefront root that injects token `<style>` must render `<StorefrontOverrides>`.
- Write CSS that wins where it lands (Riso and Fine-tune CSS use `!important`; move Tailwind variables or use enough specificity). A default must draw exactly as before. A control's `defaultValue` equals what the storefront draws for an unset key (`styleDefaults.test.ts`). Two readers of one key share one priority.
- Reviving a dead control: add a new key defaulting to today's look rather than switching the old saved value on. A control a Fine-tune setting beats goes in `studio/fineTuneConflicts.ts`.
- Every button that opens settings goes through `openTarget` (or `data-studio-panel`); otherwise `pnpm run test:studio` fails. Extend `scripts/studio-e2e.mjs` when Studio behaviour changes.

### Click-to-edit, structure and search
- New storefront regions carry `data-studio-target` + `data-studio-label` (or `regionProps` in every layout); `studioTargets.test.ts`, `studio/targetLabels.ts` and `elementCatalog.test.ts` must pass. Header parts go inside `<header>`, footer inside `<footer>`, pop-overs in `role="dialog"` (new ones in `STUDIO_OVERLAYS` + `useStudioOverlay`).
- New `STYLE_GROUPS`/`COPY_SCHEMA` groups go under a heading in `studio/settingsMap.ts` (`settingsMap.test.ts`, no jargon in titles). Find anything indexes them automatically: give clear labels.
- New structured design keys with their own editor go in `designDiff.ts` `STRUCTURAL`.

### Preview pipeline
- Storefront receivers follow Studio only through `subscribePreview` (`features/site/previewTab.ts`); never add another `message` listener (`previewSubscribe.test.ts`). Snapshots must stay clone-safe (`toCloneable`).
- Preview pages never write (abandoned carts, consent, newsletter, reviews, stock alerts, account records: `inEditorPreview()`). Pay does nothing in preview. Studio Health only reads the DOM. A new page kind belongs in `healthRoutes`.
- Custom code is injected on public pages only, never in preview, checkout or admin.

### Data, saving and resolution
- Drafts live in admin-only `themes/workspace`, My themes in `savedThemes/{id}`; all saves go through `admin/themeStore.ts` (revision-checked). Never put draft, theme or scheduled data in public `settings/website`. Outside Studio, change one design field with `draftFieldUpdate`. Shopper code reads `adminApi.getPublicSettings()`, never `getSettings()`.
- Resolve page designs only through `features/site/designModel.ts` (`layerDesign`, `resolve*Design`), never by spreading by hand. "All pages" writes use `writeDesignValue`. Book sections use `bookTemplateSurface`/`categoryTemplateSurface`/`sectionsSurface`, never `design.productPage` directly.
- Never auto-overwrite unsaved edits. A conflict during Publish never publishes.
- Schedules are applied only by the server (`functions/themeSchedule.js`), never in the browser; times are entered in Toronto time (`features/site/shopTime.ts`) and stored as UTC.
- Compare designs with `designEqual`, never `JSON.stringify`; keep normalisers identity-preserving.
- Code reading setting values as text must tolerate `$dyn` objects; show them in Studio UI through `displayValue()`.

### Studio code rules
- No `window.confirm/prompt/alert`: Undo toasts via `say(…, { label: "Undo", run })`, permanent actions via `useConfirm`, names via `usePrompt`. Name every edit `change(fn, { label })`. Failures go through `studio/friendlyError.ts`. Shortcuts live in `studio/shortcuts.ts`. Link in with `studioHash()`.
- Moves and bulk edits use `moveSectionTo`/`moveBlockTo`/`updateSectionsById`/`writeSections` (`studioWorkflow.ts`); never splice section arrays by hand.
- Uploads use `uploadStudioImage`/`uploadMediaImage` into folders `storage.rules` allows (`admin/storagePaths.test.ts`); never store `data:` pictures. New `<img>`s in sections use `ResponsiveImage`.
- Url-like section/block fields use picker kinds (`link`, `book`…), never `text` (`sectionFieldKinds.test.ts`). Catalog sections select books only through `features/site/merchandising.ts`.
- Phone/tablet widths come only from `features/site/breakpoints.ts`. New storefront columns use `contentMaxWidth`/`catalogHeaderMaxWidth`.

### Storefront contracts Studio relies on
- Adding a section = registry schema + identically named renderer + storefront mapping + library entry (and a `KIND` thumbnail). A name mismatch renders nothing.
- `StoreHeader`/`StoreFooter` are the only header and footer (`storeChrome.parity.test.tsx`; refresh its fixture only for an intended hook change). Don't re-add a second header or the removed trust-signal lines.
- Every new book card uses `fm-card` and the `fm-card-title`/`fm-card-price*` classes (`cardClasses.test.tsx`); photo frames use `fm-photo-frame(-pdp)`. A new buy-card piece needs a block type and a refreshed `productCard.parity.test.tsx` fixture.
- A section with a fixed-position bar goes in `LAZY_EXCLUDED_TYPES`.

### Deploy
- Rules for `media`, `previewTokens` and Storage deploy with the frontend; Functions with schedule changes.

## Feature notes

Details of each feature live in [`docs/agent-notes/studio.md`](../../../../docs/agent-notes/studio.md) (read the section before changing that feature; Grep its heading). Sections:
- Theme editor
- Studio organization
- Public designer coverage (2 October 2026)
- Responsive public element editing (4 October 2026)
