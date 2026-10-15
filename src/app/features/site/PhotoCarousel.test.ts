import { describe, expect, it } from "vitest";
import { dragPlan } from "./PhotoCarousel";

describe("dragPlan (mouse drag on the photo strip)", () => {
  it("a short pull snaps back, a sixth of the frame moves one photo", () => {
    expect(dragPlan(2, -40, 600, 5)).toBe(2);
    expect(dragPlan(2, -120, 600, 5)).toBe(3);
    expect(dragPlan(2, 120, 600, 5)).toBe(1);
  });
  it("a long drag moves as many photos as it covered, never past the ends", () => {
    expect(dragPlan(0, -1250, 600, 5)).toBe(2);
    expect(dragPlan(4, -600, 600, 5)).toBe(4);
    expect(dragPlan(0, 600, 600, 5)).toBe(0);
  });
});
