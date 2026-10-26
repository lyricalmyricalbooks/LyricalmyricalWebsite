# Shared rules (one copy for the shop and the server)

A rule the browser and the Functions must agree on (what a pre-order is, later shipping quotes, discount maths) lives
here once, as a TypeScript module, instead of a hand-kept mirror pair with a parity test.

- The storefront imports it as usual (`src/app/features/site/preorder.ts` just re-exports `src/shared/preorder.ts`).
- The Functions deploy uploads only `functions/`, so `scripts/build-shared.mjs` (`pnpm run build:shared`) translates each
  file to CommonJS in `functions/shared/<name>.js`, which is committed and `require`d from there
  (`require("./shared/preorder")`). Never edit `functions/shared/` by hand. After changing a file here run
  `pnpm run build:shared` and commit both; `scripts/sharedRules.test.ts` (in `pnpm test`) fails while a copy is stale,
  missing or left over.
- A shared file is pure (no Firebase, no DOM, no network) and imports only other files in this folder (`./name`), so its
  copy works inside `functions/shared/` too. Types-only TypeScript is fine: the translation drops it.
- Moving a mirror here: merge both copies into one file (the union of their exports, same behaviour), point the
  storefront file at it, point the Functions' `require`s at `./shared/<name>` and delete the old server file. Keep the
  old parity test's cases, now run against the generated copy. Done so far: `preorder`, the shipping engine
  (`shippingEngine`, `shippingZones`, `weightGrams`). Next: discount maths, promotions, address rules.
- `src/app/features/site/merchantFeed.mjs` keeps its own small copy of the pre-order date check because plain Node build
  scripts can't import TypeScript; `features/site/merchantFeed.test.ts` guards it.

## Typed edges (requests and records)

`edge.ts` is a small dependency-free schema kit (`string`, `number`, `boolean`, `oneOf`, `optional`, `nullable`, `array`,
`object`, `check`, `Infer`): one schema both checks a value at the boundary and gives both sides its TypeScript type. Objects
keep only the keys they list and ignore extras, so an older admin tab still works. `orderActions.ts` holds the first ones: the
admin's refund (`refundOrderBody`) and cancel / payment-mismatch / restock actions (`orderActionBody`). The admin builds those
bodies with `satisfies` on their types (`admin/api.ts`), and `functions/index.js` `readBody(req, res, schema)` refuses any other
shape with 400 `bad_request` before touching the order. Friendly business checks (amount above zero, at most what is left)
stay in the handlers. Next: the rest of the order and money actions, then one schema per Firestore collection for what
browsers may write (mirroring `firestore.rules`).
