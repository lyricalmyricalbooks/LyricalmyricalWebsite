import { describe, expect, it } from "vitest";
import { fitScale, naturalNavWidth, navNeedsOwnRow } from "./headerNav";

describe("navNeedsOwnRow", () => {
  it("keeps a comfortable buffer when the header fits inline", () => {
    expect(navNeedsOwnRow(400, 300, 900)).toBe(false);
  });

  it("moves the navigation below before it can collide with fixed controls", () => {
    expect(navNeedsOwnRow(520, 430, 1000)).toBe(true);
  });

  it("treats an exact fit including the buffer as inline", () => {
    expect(navNeedsOwnRow(404, 300, 800)).toBe(false);
  });
});

describe("naturalNavWidth (shrink-to-fit category bar)", () => {
  it("measures the links, not the bar's full-row box, so room to spare means no shrink", () => {
    // A 1012px row holding 250px of links: measuring the box asked for 0.99, then 0.98, then 0.97…
    expect(fitScale(naturalNavWidth(1012, 250, 1), 1010)).toBe(1);
    expect(fitScale(naturalNavWidth(1012, 240, 0.96), 1010)).toBe(1);
  });

  it("still shrinks links that really overflow, and stays put once shrunk", () => {
    const fit = fitScale(naturalNavWidth(1012, 1200, 1), 1010);
    expect(fit).toBeLessThan(1);
    expect(fitScale(naturalNavWidth(1012, 1200 * fit, fit), 1010)).toBe(fit);
  });

  it("falls back to the box width when there are no links to measure", () => {
    expect(naturalNavWidth(300, 0, 0.5)).toBe(600);
  });
});

describe("navLinkStyle link case", () => {
  it("uses uppercase only when unset; Inherit (\"\") leaves the case alone", async () => {
    const { navLinkStyle } = await import("./headerNav");
    expect(navLinkStyle({}, false, "#fff").textTransform).toBe("uppercase");
    expect(navLinkStyle({ navLinkTransform: "" }, false, "#fff").textTransform).toBe("");
    expect(navLinkStyle({ navLinkTransform: "none" }, false, "#fff").textTransform).toBe("none");
  });
});
