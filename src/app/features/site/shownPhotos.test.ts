import { describe, expect, it } from "vitest";
import { isHiddenPhoto, shownPhotos, withShownPhotos } from "./shownPhotos.mjs";
import { merchantFeedItems } from "./merchantFeed.mjs";
import { sitemapArtifacts } from "../../../../scripts/sitemapData.mjs";

const book = {
  id: "b1", slug: "the-hound", title: "The Hound", status: "published", retailPrice: 40, stockLevel: 3,
  photos: [
    { id: "a", url: "https://x.test/cover.jpg", hidden: true },
    { id: "b", url: "https://x.test/spread.jpg" },
    { id: "c", url: "https://x.test/back.jpg", hidden: true },
  ],
};

describe("hidden book images", () => {
  it("leaves hidden images out and makes the first shown image the cover", () => {
    const out = withShownPhotos(book);
    expect(out.photos.map((p: any) => p.id)).toEqual(["b"]);
    expect(book.photos).toHaveLength(3); // the saved book is untouched
  });

  it("returns the same book when nothing is hidden, and copes with odd data", () => {
    const plain = { photos: [{ url: "u" }] };
    expect(withShownPhotos(plain)).toBe(plain);
    expect(withShownPhotos(null)).toBe(null);
    expect(withShownPhotos({ photos: "nope" })).toEqual({ photos: "nope" });
    expect(shownPhotos(undefined)).toBe(undefined);
    expect(isHiddenPhoto({ hidden: "true" })).toBe(false);
  });

  it("keeps hidden images out of the image sitemap and the Merchant feed", () => {
    const shown = withShownPhotos(book);
    const { xml } = sitemapArtifacts("https://shop.test", [shown], [], [], {}) as any;
    expect(xml).toContain("spread.jpg");
    expect(xml).not.toContain("cover.jpg");
    expect(xml).not.toContain("back.jpg");
    const feed = merchantFeedItems("https://shop.test", [shown], { shopName: "Shop" }) as any;
    const text = JSON.stringify(feed.items);
    expect(text).toContain("spread.jpg");
    expect(text).not.toContain("cover.jpg");
  });
});
