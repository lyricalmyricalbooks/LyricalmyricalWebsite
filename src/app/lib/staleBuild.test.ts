import { describe, expect, it } from "vitest";
import { isChunkLoadError, mayReload, RELOAD_WINDOW_MS } from "./staleBuild";

describe("isChunkLoadError", () => {
  it("recognises each browser's missing-code message", () => {
    for (const message of [
      "Failed to fetch dynamically imported module: https://lyricalmyricalbooks.com/assets/BookDetail-abc.js",
      "error loading dynamically imported module: https://x/assets/a.js",
      "Importing a module script failed.",
      "Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of \"text/html\".",
      "Unable to preload CSS for /assets/Checkout-1.css",
    ]) expect(isChunkLoadError(new Error(message))).toBe(true);
  });

  it("leaves ordinary errors alone", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined (reading 'title')"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError("Importing a module script failed.")).toBe(true);
  });
});

describe("mayReload", () => {
  const now = 1_000_000_000;
  it("reloads the first time", () => expect(mayReload(null, now)).toBe(true));
  it("never reloads twice within the window (no loop)", () => expect(mayReload(now - 5_000, now)).toBe(false));
  it("reloads again once the window has passed", () => expect(mayReload(now - RELOAD_WINDOW_MS - 1, now)).toBe(true));
  it("ignores a time in the future (clock changed)", () => expect(mayReload(now + 10_000, now)).toBe(true));
});
