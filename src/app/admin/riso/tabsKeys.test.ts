import { describe, expect, it } from "vitest";
import { nextTabIndex } from "./components";

describe("nextTabIndex", () => {
  it("steps with the arrows and wraps at both ends", () => {
    expect(nextTabIndex("ArrowRight", 0, 3)).toBe(1);
    expect(nextTabIndex("ArrowRight", 2, 3)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(nextTabIndex("ArrowLeft", 2, 3)).toBe(1);
  });
  it("jumps to the first and last tab with Home and End", () => {
    expect(nextTabIndex("Home", 2, 4)).toBe(0);
    expect(nextTabIndex("End", 0, 4)).toBe(3);
  });
  it("ignores other keys and empty rows", () => {
    expect(nextTabIndex("Tab", 1, 3)).toBeNull();
    expect(nextTabIndex("Home", 0, 0)).toBeNull();
  });
  it("a side menu also moves with up and down", () => {
    expect(nextTabIndex("ArrowDown", 0, 3, true)).toBe(1);
    expect(nextTabIndex("ArrowUp", 0, 3, true)).toBe(2);
    expect(nextTabIndex("ArrowDown", 0, 3)).toBeNull();
  });
});
