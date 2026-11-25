import { describe, expect, it } from "vitest";
import { artistDirectory, artistPath, artistSlug, bookCreatorLinks, creditParts, findArtist } from "./artistPages.mjs";
import { creatorLinks } from "../../lib/bookSeo";

const hound = { id: "a", slug: "the-hound", title: "The Hound", subtitle: "Ian Willms", publishDate: "2024-05-01", artistBio: "Ian Willms is a Canadian photographer.", creatorLinks: [{ name: "Ian Willms", url: "https://ianwillms.com" }, { name: "Designer Person", url: "https://designer.example" }] };
const later = { id: "b", slug: "second", title: "Second Book", subtitle: "Ian Willms", publishDate: "2026-02-01", creatorLinks: [{ name: "ian willms", url: "https://instagram.com/ianwillms" }] };
const shared = { id: "c", slug: "duo", title: "Duo", subtitle: "Ian Willms & Ana Ruiz", publishDate: "2025-01-01", artistBio: "A shared bio about both." };
const group = { id: "d", slug: "anthology", title: "Anthology", subtitle: "Various artists" };
const collective = { id: "f", slug: "collections-1", title: "Collections #1", subtitle: "Collection of International Artists" };
const gift = { id: "e", slug: "gift", title: "Gift card", productType: "giftCard", subtitle: "Lyricalmyrical" };

describe("artist slugs", () => {
  it("are lower-case words joined by hyphens, with accents folded", () => {
    expect(artistSlug("Ian Willms")).toBe("ian-willms");
    expect(artistSlug("Silvia Cló Di Gregorio")).toBe("silvia-clo-di-gregorio");
    expect(artistSlug("  J. Smith ")).toBe("j-smith");
    expect(artistSlug("森山")).toBe("");
    expect(artistPath("Ian Willms")).toBe("/artists/ian-willms");
  });
});

describe("the artist directory", () => {
  const dir = artistDirectory([hound, later, shared, group, collective, gift]);

  it("gives every credited person one page, never group credits or gift cards", () => {
    expect([...dir.keys()].sort()).toEqual(["ana-ruiz", "ian-willms"]);
  });

  it("lists their books newest first", () => {
    expect(dir.get("ian-willms")!.books.map(b => b.id)).toEqual(["b", "c", "a"]);
    expect(dir.get("ana-ruiz")!.books.map(b => b.id)).toEqual(["c"]);
  });

  it("takes the bio from a book they made alone before a shared one", () => {
    expect(dir.get("ian-willms")!.bio).toBe("Ian Willms is a Canadian photographer.");
    expect(dir.get("ana-ruiz")!.bio).toBe("A shared bio about both.");
  });

  it("keeps only their own links (name matched ignoring case), once each", () => {
    expect(dir.get("ian-willms")!.links.map(l => l.url)).toEqual(["https://instagram.com/ianwillms", "https://ianwillms.com/"]);
    expect(dir.get("ana-ruiz")!.links).toEqual([]);
  });

  it("treats names that share an address as one person, shown with the spelling most books use", () => {
    const zoe = artistDirectory([
      { id: "1", title: "One", subtitle: "Zoë Leon", publishDate: "2020" },
      { id: "2", title: "Two", subtitle: "Zoë Leon", publishDate: "2021" },
      { id: "3", title: "Three", subtitle: "Zoe Leon", publishDate: "2026" },
    ]);
    expect([...zoe.keys()]).toEqual(["zoe-leon"]);
    expect(zoe.get("zoe-leon")!.name).toBe("Zoë Leon");
    expect(zoe.get("zoe-leon")!.books.map(b => b.id)).toEqual(["3", "2", "1"]);
  });

  it("finds an artist by address and answers null for an unknown one", () => {
    expect(findArtist([hound], "ian-willms")!.name).toBe("Ian Willms");
    expect(findArtist([hound], "IAN-WILLMS")!.name).toBe("Ian Willms");
    expect(findArtist([hound], "nobody")).toBeNull();
    expect(findArtist([], undefined)).toBeNull();
  });
});

describe("credit lines", () => {
  it("cuts a credit into names and the text between, keeping every character", () => {
    const parts = creditParts("Ian Willms & Ana Ruiz");
    expect(parts).toEqual([{ text: "Ian Willms", slug: "ian-willms" }, { text: " & " }, { text: "Ana Ruiz", slug: "ana-ruiz" }]);
    expect(parts.map(p => p.text).join("")).toBe("Ian Willms & Ana Ruiz");
  });
  it("leaves names without a page (and group credits) as plain text", () => {
    expect(creditParts("Ian Willms & Ana Ruiz", slug => slug === "ana-ruiz")).toEqual([{ text: "Ian Willms & " }, { text: "Ana Ruiz", slug: "ana-ruiz" }]);
    expect(creditParts("Various artists")).toEqual([{ text: "Various artists" }]);
  });
});

it("reads artist links by the same rule as the book page (lib/bookSeo creatorLinks)", () => {
  for (const book of [hound, later, { creatorLinks: [{ name: "", url: "https://x.example" }, { name: "A", url: "ftp://x" }, { name: "<b>B</b>", url: " https://b.example/path " }] }, {}]) {
    expect(bookCreatorLinks(book)).toEqual(creatorLinks(book as any));
  }
});
