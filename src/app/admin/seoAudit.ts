import { bookCreators, bookMetadata, creatorLinks, isbn13, searchText, splitPress } from "../lib/bookSeo";
import { descriptionPlainText } from "../features/site/descriptionLinks";
import { pageBodyStats, pageDescription } from "../features/site/pageBody";
import { describedAlt } from "../features/site/photoAlt";

export interface BookSeoAuditItem {
  id: string;
  title: string;
  slug: string;
  book: any;
  issues: string[];
  words: number;
  descriptionLength: number;
}

export interface PageSeoAuditItem {
  id: string;
  title: string;
  slug: string;
  page: any;
  issues: string[];
  words: number;
  descriptionLength: number;
}

export interface StorefrontSeoAudit {
  bookResults: BookSeoAuditItem[];
  pageResults: PageSeoAuditItem[];
  booksWithIssues: number;
  pagesWithIssues: number;
}

function countWords(text: string): number {
  const clean = searchText(text);
  return clean ? clean.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;
}

/** Audit one live, indexable book against search snippet, copy depth, photo alt, ISBN-13, and creator link rules. */
export function auditBookSeo(book: any, siteName = "Lyricalmyrical Books"): BookSeoAuditItem {
  const issues: string[] = [];
  const meta = bookMetadata(book);
  const titleText = searchText(book.metaTitle) || (meta.title ? `${meta.title} — ${siteName}` : "");
  if (!meta.title) {
    issues.push("Missing search title.");
  } else if (titleText.length > 60) {
    issues.push(`Search title too long (${titleText.length} chars; aim for ≤60).`);
  }

  const descLen = meta.description.length;
  if (descLen < 80) {
    issues.push(`Description too short (${descLen} chars; aim for 80–160).`);
  } else if (descLen > 160) {
    issues.push(`Description too long (${descLen} chars; aim for 80–160).`);
  }

  const bodyPlain = descriptionPlainText(splitPress(String(book.description || "")).body);
  const words = countWords(bodyPlain);
  if (words < 50) {
    issues.push(`Thin book description (${words} words; aim for 50+).`);
  }

  const photos = Array.isArray(book.photos) ? book.photos : [];
  if (!photos.length || !photos[0]?.url) {
    issues.push("Missing cover photo for search and Google Images.");
  } else if (photos.some((p: any) => !describedAlt(p?.altText))) {
    issues.push("One or more book photos lack descriptive alt text (or still use a filename).");
  }

  if (!isbn13(book.isbn)) {
    issues.push("Missing valid ISBN-13 for Book schema & Google Shopping.");
  }

  if (bookCreators(book).length > 0 && creatorLinks(book).length === 0) {
    issues.push("Missing creator website link in Search (SEO) › Artist links.");
  }

  return {
    id: String(book.id || ""),
    title: String(book.title || "Untitled"),
    slug: String(book.slug || book.id || ""),
    book,
    issues,
    words,
    descriptionLength: descLen,
  };
}

/** Audit one published, indexable custom page for title, meta description, and thin body copy. */
export function auditPageSeo(page: any, siteName = "Lyricalmyrical Books"): PageSeoAuditItem {
  const issues: string[] = [];
  const rawTitle = searchText(page.seoTitle || page.title || "");
  const fullTitle = rawTitle ? `${rawTitle} — ${siteName}` : "";
  if (!rawTitle) {
    issues.push("Missing page title.");
  } else if (fullTitle.length < 20) {
    issues.push(`Page title very short (${fullTitle.length} chars; consider a clearer topic title).`);
  } else if (fullTitle.length > 60) {
    issues.push(`Page title too long (${fullTitle.length} chars; aim for ≤60).`);
  }

  const desc = searchText(page.metaDescription || pageDescription(String(page.body || "")));
  const descLen = desc.length;
  if (descLen < 80) {
    issues.push(`Description too short (${descLen} chars; aim for 80–160).`);
  } else if (descLen > 160) {
    issues.push(`Description too long (${descLen} chars; aim for 80–160).`);
  }

  const { words } = pageBodyStats(String(page.body || ""));
  if (words < 80) {
    issues.push(`Thin page copy (${words} words; aim for 80+ for stronger indexing).`);
  }

  return {
    id: String(page.id || ""),
    title: String(page.title || page.slug || "Untitled"),
    slug: String(page.slug || ""),
    page,
    issues,
    words,
    descriptionLength: descLen,
  };
}

/** Audit all live, indexable books and published, indexable pages, sorting items needing work first. */
export function auditStorefrontSeo(books: any[], pages: any[], siteName = "Lyricalmyrical Books"): StorefrontSeoAudit {
  const liveBooks = (Array.isArray(books) ? books : []).filter(
    (b) => b && (!b.status || b.status === "published") && b.productType !== "giftCard" && b.seoNoindex !== true,
  );
  const livePages = (Array.isArray(pages) ? pages : []).filter(
    (p) => p && p.status === "published" && p.seoNoindex !== true,
  );

  const sortIssuesFirst = <T extends { issues: string[]; title: string }>(items: T[]) =>
    [...items].sort((a, b) => b.issues.length - a.issues.length || a.title.localeCompare(b.title));

  const bookResults = sortIssuesFirst(liveBooks.map((b) => auditBookSeo(b, siteName)));
  const pageResults = sortIssuesFirst(livePages.map((p) => auditPageSeo(p, siteName)));

  return {
    bookResults,
    pageResults,
    booksWithIssues: bookResults.filter((r) => r.issues.length > 0).length,
    pagesWithIssues: pageResults.filter((r) => r.issues.length > 0).length,
  };
}
