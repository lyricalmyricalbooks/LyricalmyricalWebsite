import { describe, expect, it } from "vitest";
import { currentStorefrontData, fileIsCurrent, isStorefrontDataFile, nanoTime } from "./storefrontDataFile";

const file = { v: 1, readTime: "2026-10-15T03:49:48.748909Z", settings: { info: {} }, books: [{ id: "b" }], pages: [] };
const ts = (iso: string, nanos: number) => ({ seconds: Date.parse(iso) / 1000, nanoseconds: nanos });

describe("storefront data file", () => {
  it("compares Firestore times to the nanosecond", () => {
    expect(nanoTime("2026-10-15T03:49:48.748909Z")).toBe("2026-10-15T03:49:48.748909000");
    expect(nanoTime("2026-10-15T03:49:48Z")).toBe("2026-10-15T03:49:48.000000000");
    expect(nanoTime(ts("2026-10-15T03:49:48Z", 748909001))).toBe("2026-10-15T03:49:48.748909001");
    expect(nanoTime("yesterday")).toBeNull();
  });

  it("uses the file only when nothing changed after its snapshot", () => {
    expect(fileIsCurrent(file, { changedAt: ts("2026-10-15T03:49:48Z", 748909000) })).toBe(true);
    expect(fileIsCurrent(file, { changedAt: ts("2026-10-15T03:49:48Z", 748909001) })).toBe(false);
    expect(fileIsCurrent(file, { changedAt: ts("2026-10-15T03:40:00Z", 0) })).toBe(true);
    expect(fileIsCurrent(file, null)).toBe(false);
    expect(fileIsCurrent(file, {})).toBe(false);
  });

  it("refuses files of another shape", () => {
    expect(isStorefrontDataFile(file)).toBe(true);
    expect(isStorefrontDataFile({ ...file, v: 2 })).toBe(false);
    expect(isStorefrontDataFile({ ...file, books: null })).toBe(false);
    expect(isStorefrontDataFile({ ...file, readTime: "" })).toBe(false);
    expect(isStorefrontDataFile("<!doctype html>")).toBe(false);
  });

  it("falls back (null) when the file, the marker or both can't be read", async () => {
    const marker = async () => ({ changedAt: ts("2026-10-15T03:00:00Z", 0) });
    expect(await currentStorefrontData(async () => file, marker)).toBe(file);
    expect(await currentStorefrontData(async () => { throw new Error("offline"); }, marker)).toBeNull();
    expect(await currentStorefrontData(async () => file, async () => { throw new Error("denied"); })).toBeNull();
    expect(await currentStorefrontData(async () => file, async () => ({ changedAt: ts("2026-10-15T04:00:00Z", 0) }))).toBeNull();
  });
});
