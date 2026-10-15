import { describe, expect, it } from "vitest";
import { CARD_PHOTO_SIZES, pdpPhotoSizes, photoSrcSet, smallPhotoUrl } from "./photoSources";

describe("photoSrcSet", () => {
  const url = (w: number) => `https://cdn.test/products/1-cover-${w}w.webp`;
  it("lists a book photo's resized copies smallest first", () => {
    const photo = { url: url(2400), srcset: [{ url: url(2400), w: 2400 }, { url: url(480), w: 480 }, { url: url(960), w: 960 }] };
    expect(photoSrcSet(photo, CARD_PHOTO_SIZES)).toEqual({
      srcSet: `${url(480)} 480w, ${url(960)} 960w, ${url(2400)} 2400w`,
      sizes: CARD_PHOTO_SIZES,
    });
  });
  it("leaves older photos, typed URLs and missing photos as plain images", () => {
    expect(photoSrcSet({ url: url(1600) }, CARD_PHOTO_SIZES)).toEqual({});
    expect(photoSrcSet(undefined, CARD_PHOTO_SIZES)).toEqual({});
    expect(photoSrcSet({ url: "", srcset: [{ url: url(480), w: 480 }] }, CARD_PHOTO_SIZES)).toEqual({});
  });
});

describe("smallPhotoUrl", () => {
  const photo = { url: "https://x/original.png", srcset: [{ url: "https://x/960.webp", w: 960 }, { url: "https://x/480.webp", w: 480 }, { url: "https://x/640.webp", w: 640 }] };
  it("picks the smallest copy wide enough", () => {
    expect(smallPhotoUrl(photo)).toBe("https://x/480.webp");
    expect(smallPhotoUrl(photo, 600)).toBe("https://x/640.webp");
    expect(smallPhotoUrl(photo, 5000)).toBe("https://x/960.webp");
  });
  it("keeps the url for photos without copies", () => {
    expect(smallPhotoUrl({ url: "https://x/a.jpg" })).toBe("https://x/a.jpg");
    expect(smallPhotoUrl(undefined)).toBe("");
  });
});

describe("pdpPhotoSizes", () => {
  it("offers wide screens the copy for the frame's Max width (+10%), full width below it", () => {
    expect(pdpPhotoSizes({ maxWidth: 560, photoRatio: 0.75, frameRatio: 0.75, cover: true })).toBe("(max-width: 560px) 100vw, 616px");
    expect(pdpPhotoSizes({ maxWidth: undefined as any, cover: true })).toBe("(max-width: 560px) 100vw, 616px");
  });
  it("grows for a wide photo cropped to fill a narrower frame, never past the old 900px", () => {
    // A 3:2 photo filling a 3:4 frame is drawn twice as wide as the frame.
    expect(pdpPhotoSizes({ maxWidth: 400, photoRatio: 1.5, frameRatio: 0.75, cover: true })).toBe("(max-width: 400px) 100vw, 880px");
    expect(pdpPhotoSizes({ maxWidth: 560, photoRatio: 1.5, frameRatio: 0.75, cover: true })).toBe("(max-width: 560px) 100vw, 900px");
    expect(pdpPhotoSizes({ maxWidth: 900, cover: true })).toBe("(max-width: 900px) 100vw, 900px");
  });
  it("doesn't grow for whole photos (contain), taller photos or unknown shapes", () => {
    expect(pdpPhotoSizes({ maxWidth: 560, photoRatio: 1.5, frameRatio: 0.75, cover: false })).toBe("(max-width: 560px) 100vw, 616px");
    expect(pdpPhotoSizes({ maxWidth: 560, photoRatio: 0.5, frameRatio: 0.75, cover: true })).toBe("(max-width: 560px) 100vw, 616px");
    expect(pdpPhotoSizes({ maxWidth: 560, frameRatio: 0.75, cover: true })).toBe("(max-width: 560px) 100vw, 616px");
  });
});
