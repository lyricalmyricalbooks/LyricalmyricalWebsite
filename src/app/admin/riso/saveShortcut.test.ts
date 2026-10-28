import { describe, expect, it } from "vitest";
import { isSaveShortcut } from "./components";

const key = (o: Partial<Parameters<typeof isSaveShortcut>[0]>) =>
  ({ key: "s", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o });

describe("isSaveShortcut", () => {
  it("accepts Ctrl+S and ⌘S in either case", () => {
    expect(isSaveShortcut(key({ ctrlKey: true }))).toBe(true);
    expect(isSaveShortcut(key({ metaKey: true, key: "S" }))).toBe(true);
  });
  it("ignores a bare S and other combinations", () => {
    expect(isSaveShortcut(key({}))).toBe(false);
    expect(isSaveShortcut(key({ ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isSaveShortcut(key({ ctrlKey: true, altKey: true }))).toBe(false);
    expect(isSaveShortcut(key({ ctrlKey: true, key: "k" }))).toBe(false);
  });
});
