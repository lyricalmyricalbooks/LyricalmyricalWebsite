import { describe, expect, it } from "vitest";
import { isHelpShortcut } from "./helpShortcut";

const key = (o: Partial<Parameters<typeof isHelpShortcut>[0]> = {}) =>
  ({ key: "?", ctrlKey: false, metaKey: false, altKey: false, ...o });
const field = (matches: boolean) => ({ closest: () => (matches ? {} : null) }) as unknown as EventTarget;

describe("isHelpShortcut", () => {
  it("accepts a bare question mark on the page", () => {
    expect(isHelpShortcut(key())).toBe(true);
    expect(isHelpShortcut(key({ target: field(false) }))).toBe(true);
  });
  it("ignores other keys and modifier combinations", () => {
    expect(isHelpShortcut(key({ key: "/" }))).toBe(false);
    expect(isHelpShortcut(key({ ctrlKey: true }))).toBe(false);
    expect(isHelpShortcut(key({ metaKey: true }))).toBe(false);
    expect(isHelpShortcut(key({ altKey: true }))).toBe(false);
    expect(isHelpShortcut(key({ defaultPrevented: true }))).toBe(false);
  });
  it("stays out of the way while typing or in a pop-up window", () => {
    expect(isHelpShortcut(key({ target: field(true) }))).toBe(false);
    expect(isHelpShortcut(key(), true)).toBe(false);
  });
});
