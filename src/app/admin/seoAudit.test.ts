import { describe, expect, it } from "vitest";
import { auditBookSeo, auditPageSeo, auditStorefrontSeo } from "./seoAudit";

const healthyBook = {
  id: "b1",
  title: "The Hound",
  slug: "the-hound",
  status: "published",
  subtitle: "Ian Willms",
  metaTitle: "The Hound by Ian Willms — Lyricalmyrical Books",
  metaDescription: "A documentary photobook tracing Greyhound bus routes across Canada through portraits and highway landscapes.",
  description: Array.from({ length: 55 }, () => "photographs").join(" "),
  isbn: "9780306406157",
  photos: [{ url: "https://example.com/cover.jpg", altText: "Front cover of The Hound showing a highway map." }],
  creatorLinks: [{ name: "Ian Willms", url: "https://www.ianwillms.com" }],
};

describe("admin SEO audit", () => {
  it("passes a complete, well-described book with valid ISBN-13 and artist link", () => {
    const result = auditBookSeo(healthyBook);
    expect(result.issues).toEqual([]);
    expect(result.words).toBe(55);
  });

  it("flags short descriptions, thin copy, filename alt text, missing ISBN-13, and missing creator links", () => {
    const result = auditBookSeo({
      id: "b2",
      title: "Oltre il Tempo",
      slug: "oltre-il-tempo",
      status: "published",
      subtitle: "Isabella Tortola",
      metaDescription: "Oltre il Tempo — Lyricalmyrical Books",
      description: "Short note.",
      isbn: "invalid",
      photos: [{ url: "https://example.com/a.jpg", altText: "IMG_1234.jpg" }],
      creatorLinks: [],
    });
    expect(result.issues.some((i) => i.includes("Description too short"))).toBe(true);
    expect(result.issues.some((i) => i.includes("Thin book description"))).toBe(true);
    expect(result.issues.some((i) => i.includes("descriptive alt text"))).toBe(true);
    expect(result.issues.some((i) => i.includes("ISBN-13"))).toBe(true);
    expect(result.issues.some((i) => i.includes("creator website link"))).toBe(true);
  });

  it("flags over-long search titles and descriptions", () => {
    const result = auditBookSeo({
      ...healthyBook,
      metaTitle: "A".repeat(65),
      metaDescription: "B".repeat(200),
    });
    expect(result.issues.some((i) => i.includes("Search title too long"))).toBe(true);
    expect(result.issues.some((i) => i.includes("Description too long"))).toBe(true);
  });

  it("audits custom pages for thin copy and snippet length", () => {
    const thinPage = auditPageSeo({
      id: "p1",
      title: "About",
      slug: "about",
      status: "published",
      metaDescription: "Short.",
      body: "<p>Independent publishing house in Toronto.</p>",
    });
    expect(thinPage.issues.some((i) => i.includes("Description too short"))).toBe(true);
    expect(thinPage.issues.some((i) => i.includes("Thin page copy"))).toBe(true);

    const healthyPage = auditPageSeo({
      id: "p2",
      title: "Art Book Fairs & Events",
      slug: "book-fairs",
      status: "published",
      metaDescription: "Find Lyricalmyrical Books at Toronto Art Book Fair, Offprint, and international photography book fairs.",
      body: `<p>${Array.from({ length: 85 }, () => "photobooks").join(" ")}</p>`,
    });
    expect(healthyPage.issues).toEqual([]);
  });

  it("excludes drafts, gift cards, and noindex records and sorts items with issues first", () => {
    const report = auditStorefrontSeo(
      [
        healthyBook,
        { ...healthyBook, id: "b-bad", title: "Thin Book", description: "Tiny." },
        { ...healthyBook, id: "b-draft", status: "draft", description: "Tiny." },
        { ...healthyBook, id: "b-noindex", seoNoindex: true, description: "Tiny." },
        { ...healthyBook, id: "b-gift", productType: "giftCard", description: "Tiny." },
      ],
      [
        { id: "p-live", title: "About", slug: "about", status: "published", body: "Short." },
        { id: "p-draft", title: "Draft Page", slug: "draft", status: "draft", body: "Short." },
        { id: "p-hidden", title: "Hidden", slug: "hidden", status: "published", seoNoindex: true, body: "Short." },
      ],
    );
    expect(report.bookResults.map((r) => r.id)).toEqual(["b-bad", "b1"]);
    expect(report.booksWithIssues).toBe(1);
    expect(report.pageResults.map((r) => r.id)).toEqual(["p-live"]);
    expect(report.pagesWithIssues).toBe(1);
  });
});
