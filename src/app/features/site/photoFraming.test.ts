import { describe, expect, it } from "vitest";
import { dragFraming, framingStyle, framingToSave, motionFraming, photoFraming } from "./photoFraming";
import { shopFrameShapes } from "../../admin/photoCrop";

describe("photo crop & placement", () => {
  it("leaves photos without framing exactly as before", () => {
    expect(photoFraming({ url: "a.jpg" })).toBeNull();
    expect(framingStyle({ url: "a.jpg" })).toEqual({});
    expect(framingStyle(undefined, { x: 20, y: 80 })).toEqual({ objectPosition: "20% 80%" });
    expect(motionFraming(null)).toEqual({ style: {}, zoom: 1 });
  });

  it("treats a centred, unzoomed framing as none", () => {
    expect(photoFraming({ framing: { x: 50, y: 50, zoom: 1 } })).toBeNull();
    expect(framingToSave({ x: 50, y: 50, zoom: 1 })).toBeUndefined();
  });

  it("places and zooms around the chosen point, beating the frame's own placement", () => {
    const photo = { framing: { x: 30, y: 10, zoom: 1.5 } };
    expect(framingStyle(photo, { x: 50, y: 50 })).toEqual({ objectPosition: "30% 10%", transform: "scale(1.5)", transformOrigin: "30% 10%" });
    expect(framingStyle({ framing: { x: 0, y: 100, zoom: 1 } })).toEqual({ objectPosition: "0% 100%" });
    expect(motionFraming(photo)).toEqual({ style: { objectPosition: "30% 10%", transformOrigin: "30% 10%" }, zoom: 1.5 });
  });

  it("cleans up bad saved values", () => {
    expect(photoFraming({ framing: { x: -20, y: "140", zoom: 9 } })).toEqual({ x: 0, y: 100, zoom: 3 });
    expect(photoFraming({ framing: { x: "nope", y: 20, zoom: 0.2 } })).toEqual({ x: 50, y: 20, zoom: 1 });
    expect(photoFraming({ framing: "x" })).toBeNull();
  });

  it("moves the point in view against the drag, slower when zoomed", () => {
    const start = { x: 50, y: 50, zoom: 1 };
    expect(dragFraming(start, 100, 0, 400, 400)).toEqual({ x: 25, y: 50, zoom: 1 });
    expect(dragFraming({ ...start, zoom: 2 }, 0, -100, 400, 400)).toEqual({ x: 50, y: 62.5, zoom: 2 });
    expect(dragFraming(start, -10000, 0, 400, 400).x).toBe(100);
    expect(dragFraming(start, 10, 10, 0, 0)).toBe(start);
  });
});

describe("shop frame shapes for the crop preview", () => {
  it("follows Studio's card and book-page shapes", () => {
    expect(shopFrameShapes({}).map((s) => [s.id, s.aspect])).toEqual([["card", "1 / 1"], ["page", "3 / 4"]]);
    const shapes = shopFrameShapes({ catalogLayoutStyle: "modern", storefront: { imageAspectRatio: "2:3" }, productPage: { productImageAspect: "4:5" } });
    expect(shapes.map((s) => [s.id, s.aspect])).toEqual([["card", "2 / 3"], ["page", "4 / 5"], ["square", "1 / 1"]]);
  });
});
