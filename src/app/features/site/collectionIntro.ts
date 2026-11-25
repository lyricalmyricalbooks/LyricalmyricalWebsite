import { getCopy } from "./storeCopy";

/** Text & labels intro for the shop's own collection pages (used when the category has no Navigation description). */
export const COLLECTION_INTRO_KEYS: Record<string, string> = {
  books: "collectionIntroBooks",
  zines: "collectionIntroZines",
  publications: "collectionIntroPublications",
};

/**
 * The short paragraph under a collection page's heading: the category's own description (Studio › Navigation ›
 * Shop categories › Edit), else its Text & labels intro. Blank when neither is set.
 */
export function collectionIntro(design: any, slug: string | undefined, category: any): string {
  const own = category && typeof category === "object" ? String(category.description || "").trim() : "";
  if (own) return own;
  const key = slug ? COLLECTION_INTRO_KEYS[slug] : undefined;
  return key ? getCopy(design, key).trim() : "";
}

/**
 * A category's own Google listing (Studio › Navigation › Shop categories › Edit › Search engine listing), like
 * Shopify's per-collection SEO title and description. Blank strings when unset: the page then uses its usual title
 * (Text & labels › Collection page title) and description.
 */
export function collectionSearchListing(category: any): { title: string; description: string } {
  const own = category && typeof category === "object" ? category : {};
  return { title: String(own.seoTitle || "").trim(), description: String(own.metaDescription || "").trim() };
}
