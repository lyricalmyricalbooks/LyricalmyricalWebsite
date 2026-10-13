import { describe, expect, it } from "vitest";
import { stepPhoto } from "./PhotoViewer";

describe("stepPhoto", () => {
  it("moves and clamps to the photo list", () => {
    expect(stepPhoto(0, -1, 3)).toBe(0);
    expect(stepPhoto(1, 1, 3)).toBe(2);
    expect(stepPhoto(2, 1, 3)).toBe(2);
    expect(stepPhoto(0, 1, 0)).toBe(0);
  });
});
