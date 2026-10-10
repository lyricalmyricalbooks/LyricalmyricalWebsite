// Private book fields (#18). `books/{id}` is readable by shoppers (published books only, firestore.rules), so
// anything the publisher does not want a competitor to read lives in the admin-only document
// `books/{id}/private/admin`: cost prices, shelf codes, the legacy-inventory match key and the
// Storage path of a digital file. Pure: the admin API (api.ts) splits a book on every write and merges the
// two documents on every read; scripts/migrate-book-private-fields.mjs moves older records across once.
//
// During the transition a record may still carry these fields on the public document. Readers therefore
// take the private value when it exists and the public one otherwise, and the next save moves them.

/** Top-level book fields that belong in the private document. */
export const PRIVATE_BOOK_KEYS = ["costPrice", "usdCostPrice", "eurCostPrice", "shelfLocation", "legacyInventoryKey", "digitalFileUrl", "digitalFilePath"] as const;

export const PRIVATE_DOC_PATH = ["private", "admin"] as const;

type Rec = Record<string, any>;

/** An edition's own shelf code travels in `variantShelf` ({ editionId: code }), not in the public `variants` list. */
export function splitBookPrivate(book: Rec): { pub: Rec; priv: Rec } {
  const pub: Rec = { ...book };
  const priv: Rec = {};
  for (const key of PRIVATE_BOOK_KEYS) {
    if (key in pub) {
      if (pub[key] !== undefined) priv[key] = pub[key];
      delete pub[key];
    }
  }
  if (Array.isArray(pub.variants)) {
    const shelf: Rec = {};
    pub.variants = pub.variants.map((variant: Rec) => {
      if (!variant || typeof variant !== "object") return variant;
      const { shelfLocation, ...rest } = variant;
      if (variant.id && typeof shelfLocation === "string" && shelfLocation.trim()) shelf[variant.id] = shelfLocation.trim();
      return rest;
    });
    priv.variantShelf = shelf;
  }
  return { pub, priv };
}

/** The book as the editor and the admin lists see it: public record plus the private document on top. */
export function mergeBookPrivate(book: Rec, priv: Rec | null | undefined): Rec {
  if (!priv) return book;
  const out: Rec = { ...book };
  for (const key of PRIVATE_BOOK_KEYS) if (priv[key] !== undefined) out[key] = priv[key];
  if (priv.variantShelf && Array.isArray(out.variants)) {
    out.variants = out.variants.map((variant: Rec) =>
      variant && variant.id && priv.variantShelf[variant.id] !== undefined ? { ...variant, shelfLocation: priv.variantShelf[variant.id] } : variant);
  }
  return out;
}

/** Fields a public document must not keep once they are stored privately (used to scrub with deleteField()). */
export function privateKeysIn(priv: Rec): string[] {
  return PRIVATE_BOOK_KEYS.filter((key) => priv[key] !== undefined);
}
