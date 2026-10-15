import { describe, expect, it } from "vitest";
import { resolveShortcut, SHORTCUTS } from "./shortcuts";

describe("Studio shortcuts", () => {
  it("maps the documented keys", () => {
    expect(resolveShortcut({ key: "k", ctrl: true })).toBe("find");
    expect(resolveShortcut({ key: "K", meta: true })).toBe("find");
    expect(resolveShortcut({ key: "z", ctrl: true, shift: true })).toBe("redo");
    expect(resolveShortcut({ key: "y", meta: true })).toBe("redo");
    expect(resolveShortcut({ key: "ArrowUp", alt: true })).toBe("moveUp");
    expect(resolveShortcut({ key: "?" , shift: true })).toBe("help");
    expect(resolveShortcut({ key: "2" })).toBe("tablet");
  });
  it("never steals keys while typing or in a dialog", () => {
    expect(resolveShortcut({ key: "Backspace", typing: true })).toBeNull();
    expect(resolveShortcut({ key: "z", ctrl: true, typing: true })).toBeNull();
    expect(resolveShortcut({ key: "1", dialogOpen: true })).toBeNull();
    expect(resolveShortcut({ key: "d", ctrl: true, dialogOpen: true })).toBeNull();
    expect(resolveShortcut({ key: "s", ctrl: true, typing: true })).toBe("save");
  });
  it("Backspace on a focused button never deletes the section; Delete still does", () => {
    expect(resolveShortcut({ key: "Backspace", onControl: true })).toBeNull();
    expect(resolveShortcut({ key: "Backspace" })).toBe("delete");
    expect(resolveShortcut({ key: "Delete", onControl: true })).toBe("delete");
  });
  it("every action in the cheat sheet is reachable", () => {
    const actions = new Set(SHORTCUTS.map(s => s.action));
    expect(actions.size).toBe(SHORTCUTS.length);
  });
});
