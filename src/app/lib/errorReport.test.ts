import { describe, expect, it } from "vitest";
import { buildReport, shouldIgnore } from "./errorReport";

describe("error reports", () => {
  it("keeps only the page path, never its query or fragment", () => {
    const r = buildReport("page", new Error("Cannot read x"), { path: "/track?orderId=1&key=secret#top", section: "Hero" });
    expect(r).toMatchObject({ kind: "page", message: "Cannot read x", path: "/track", section: "Hero" });
    expect(r.stack).toContain("Cannot read x");
  });
  it("accepts thrown strings and rejected values", () => {
    expect(buildReport("promise", "plain text", { path: "/" }).message).toBe("plain text");
    expect(buildReport("promise", undefined, { path: "" })).toMatchObject({ message: "", path: "/" });
  });
  it("ignores browser and network noise", () => {
    for (const m of ["Script error.", "ResizeObserver loop completed with undelivered notifications.", "Failed to fetch", "Load failed", ""]) expect(shouldIgnore(m)).toBe(true);
    expect(shouldIgnore("Cannot read properties of undefined (reading 'price')")).toBe(false);
  });
});
