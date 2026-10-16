import { describe, expect, it } from "vitest";
import { adjustStyle, adjustToSave, dragFraming, framingStyle, framingToSave, motionFraming, photoAdjust, photoFraming } from "./photoFraming";
import { shopFrameShapes } from "../../admin/photoCrop";

describe("photo crop & placement", () => {
  it("leaves photos without framing exactly as before", () => {
    expect(photoFraming({ url: "a.jpg" })).toBeNull();
    expect(framingStyle({ url: "a.jpg" })).toEqual({});
    expect(framingStyle(undefined, { x: 20, y: 80 })).toEqual({ objectPosition: "20% 80%" });
    expect(motionFraming(null, 1.05)).toEqual({ style: {}, hover: { scale: 1.05 } });
    expect(adjustStyle({ url: "a.jpg" })).toEqual({});
  });

  it("treats a centred, unzoomed framing as none", () => {
    expect(photoFraming({ framing: { x: 50, y: 50, zoom: 1 } })).toBeNull();
    expect(framingToSave({ x: 50, y: 50, zoom: 1 })).toBeUndefined();
  });

  it("places and zooms around the chosen point, beating the frame's own placement", () => {
    const photo = { framing: { x: 30, y: 10, zoom: 1.5 } };
    expect(framingStyle(photo, { x: 50, y: 50 })).toEqual({ objectPosition: "30% 10%", transform: "scale(1.5)", transformOrigin: "30% 10%" });
    expect(framingStyle({ framing: { x: 0, y: 100, zoom: 1 } })).toEqual({ objectPosition: "0% 100%" });
    expect(motionFraming(photo, 2)).toEqual({ style: { objectPosition: "30% 10%", transformOrigin: "30% 10%", scale: 1.5 }, hover: { scale: 3 } });
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

describe("quick photo edits", () => {
  it("saves nothing when nothing changed and cleans up bad values", () => {
    expect(adjustToSave({ brightness: 100, contrast: 100, saturation: 100, flipX: false, flipY: false })).toBeUndefined();
    expect(photoAdjust({ adjust: { brightness: 400, contrast: "20", saturation: -5, flipX: "yes" } }))
      .toEqual({ brightness: 150, contrast: 50, saturation: 0, flipX: false, flipY: false });
  });

  it("draws light and colour as a CSS filter, on top of the crop", () => {
    const photo = { framing: { x: 30, y: 10, zoom: 1.5 }, adjust: { brightness: 120, saturation: 0 } };
    expect(framingStyle(photo)).toEqual({
      objectPosition: "30% 10%", transform: "scale(1.5)", transformOrigin: "30% 10%", filter: "brightness(1.2) saturate(0)",
    });
    // A colour edit alone leaves the frame's own placement alone.
    expect(framingStyle({ adjust: { contrast: 90 } })).toEqual({ filter: "contrast(0.9)" });
    expect(adjustStyle(photo)).toEqual({ filter: "brightness(1.2) saturate(0)" });
  });

  it("mirrors about the frame's centre and keeps the chosen point in view", () => {
    expect(framingStyle({ adjust: { flipX: true } })).toEqual({ objectPosition: "50% 50%", transform: "scale(-1, 1)", transformOrigin: "50% 50%" });
    expect(framingStyle({ framing: { x: 30, y: 50, zoom: 2 }, adjust: { flipX: true } })).toEqual({
      objectPosition: "70% 50%",
      transform: "scale(2) translate(20%, 0%) scale(-1, 1) translate(-20%, 0%)",
      transformOrigin: "30% 50%",
    });
    expect(adjustStyle({ adjust: { flipY: true } })).toEqual({ transform: "scale(1, -1)" });
    // Motion: translate → scale → scaleX, so the centre shift scales with the zoom (resting and on hover).
    expect(motionFraming({ framing: { x: 30, y: 50, zoom: 2 }, adjust: { flipX: true } }, 1.5)).toEqual({
      style: { objectPosition: "70% 50%", transformOrigin: "30% 50%", scale: 2, x: "80%", scaleX: -1 },
      hover: { scale: 3, x: "120%" },
    });
  });
});

describe("shop frame shapes for the crop preview", () => {
  it("follows Studio's card and book-page shapes", () => {
    expect(shopFrameShapes({}).map((s) => [s.id, s.aspect])).toEqual([["card", "1 / 1"], ["page", "3 / 4"]]);
    const shapes = shopFrameShapes({ catalogLayoutStyle: "modern", storefront: { imageAspectRatio: "2:3" }, productPage: { productImageAspect: "4:5" } });
    expect(shapes.map((s) => [s.id, s.aspect])).toEqual([["card", "2 / 3"], ["page", "4 / 5"], ["square", "1 / 1"]]);
  });
});
