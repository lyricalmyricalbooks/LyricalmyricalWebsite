import { describe, expect, it } from "vitest";
import { fastPublishedDecision, isBackstopWindow, torontoDay } from "./publishedChangeCheck.mjs";

const FP = "a".repeat(64);
const file = (overrides: Record<string, unknown> = {}) => ({
  v: 1,
  readTime: "2026-11-27T10:00:00.000000Z",
  builtAt: "2026-11-27T10:00:05.000Z", // 05:00 Toronto
  settings: null,
  books: [],
  pages: [],
  ...overrides,
});
const marker = (changedAt: string) => ({
  fields: { changedAt: { timestampValue: changedAt } },
});

describe("publishedChangeCheck", () => {
  it("rebuilds immediately when fingerprint is missing or malformed", () => {
    expect(fastPublishedDecision({ previousFingerprint: "", file: file(), marker: marker("2026-11-27T09:00:00Z") }))
      .toEqual({ action: "rebuild", reason: "missing-fingerprint" });
    expect(fastPublishedDecision({ previousFingerprint: "<html>404</html>", file: file(), marker: marker("2026-11-27T09:00:00Z") }))
      .toEqual({ action: "rebuild", reason: "missing-fingerprint" });
  });

  it("rebuilds immediately without scanning Firestore when catalogVersion is newer than file", () => {
    expect(fastPublishedDecision({
      previousFingerprint: FP,
      file: file(),
      marker: marker("2026-11-27T10:00:01Z"),
      now: new Date("2026-11-27T15:22:00Z"),
    })).toEqual({ action: "rebuild", reason: "catalog-version-newer" });
  });

  it("skips full Firestore scan when file and marker are current on the same Toronto day outside backstop windows", () => {
    // 2026-11-27T15:22:00Z = 10:22 Toronto (not hour % 6)
    expect(fastPublishedDecision({
      previousFingerprint: FP,
      file: file(),
      marker: marker("2026-11-27T09:59:59Z"),
      now: new Date("2026-11-27T15:22:00Z"),
    })).toEqual({ action: "skip", reason: "catalog-version-current" });
  });

  it("runs full-check during the 6-hour backstop window", () => {
    expect(isBackstopWindow(new Date("2026-11-27T12:07:00Z"))).toBe(true);
    expect(isBackstopWindow(new Date("2026-11-27T12:22:00Z"))).toBe(false);
    expect(isBackstopWindow(new Date("2026-11-27T13:07:00Z"))).toBe(false);
    expect(fastPublishedDecision({
      previousFingerprint: FP,
      file: file(),
      marker: marker("2026-11-27T09:59:59Z"),
      now: new Date("2026-11-27T12:07:00Z"),
    })).toEqual({ action: "full-check", reason: "backstop-or-day-rollover" });
  });

  it("runs full-check after Toronto midnight rollover", () => {
    // builtAt = 2026-11-27T23:00:00Z = 18:00 Toronto on Nov 27
    // now = 2026-11-28T05:22:00Z = 00:22 Toronto on Nov 28
    expect(torontoDay("2026-11-27T23:00:00Z")).toBe("2026-11-27");
    expect(torontoDay("2026-11-28T05:22:00Z")).toBe("2026-11-28");
    expect(fastPublishedDecision({
      previousFingerprint: FP,
      file: file({ builtAt: "2026-11-27T23:00:00Z" }),
      marker: marker("2026-11-27T09:59:59Z"),
      now: new Date("2026-11-28T05:22:00Z"),
    })).toEqual({ action: "full-check", reason: "backstop-or-day-rollover" });
  });

  it("falls back to full-check when file or marker is missing/corrupt", () => {
    expect(fastPublishedDecision({
      previousFingerprint: FP,
      file: null,
      marker: marker("2026-11-27T09:59:59Z"),
      now: new Date("2026-11-27T15:22:00Z"),
    })).toEqual({ action: "full-check", reason: "backstop-or-day-rollover" });
    expect(fastPublishedDecision({
      previousFingerprint: FP,
      file: file(),
      marker: null,
      now: new Date("2026-11-27T15:22:00Z"),
    })).toEqual({ action: "full-check", reason: "backstop-or-day-rollover" });
  });
});
