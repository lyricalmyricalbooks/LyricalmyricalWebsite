import { describe, expect, it } from "vitest";
import { decodeStrict, readStorefrontData } from "./storefrontDataFile.mjs";

const base = "https://firestore.test/v1/projects/p/databases/(default)/documents";
const doc = (path: string, fields: Record<string, unknown>) => ({ name: `projects/p/databases/(default)/documents/${path}`, fields });

describe("storefront data file (build side)", () => {
  it("decodes values exactly like the browser's Firestore read and refuses ones JSON can't carry", () => {
    expect(decodeStrict({ mapValue: { fields: { a: { integerValue: "3" }, b: { doubleValue: 1.5 }, c: { nullValue: null }, d: { arrayValue: { values: [{ stringValue: "x" }, { booleanValue: false }] } } } } }))
      .toEqual({ a: 3, b: 1.5, c: null, d: ["x", false] });
    expect(decodeStrict({ arrayValue: {} })).toEqual([]);
    expect(() => decodeStrict({ timestampValue: "2026-10-15T00:00:00Z" }, "createdAt")).toThrow(/createdAt/);
    expect(() => decodeStrict({ doubleValue: "NaN" })).toThrow();
  });

  it("reads settings, books and pages at one snapshot, in the browser's shapes", async () => {
    const calls: any[] = [];
    const fetchImpl = async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      calls.push({ url, body });
      let out: unknown;
      if (url.endsWith(":batchGet")) out = [{ found: doc("settings/website", { info: { mapValue: { fields: { name: { stringValue: "Shop" } } } } }), readTime: "2026-10-15T03:49:48.748909Z" }];
      else if (body.structuredQuery.from[0].collectionId === "books") {
        const page = body.structuredQuery.startAt ? [doc("books/c", { title: { stringValue: "C" } })] : [doc("books/a", { id: { stringValue: "stale" }, title: { stringValue: "A" } }), doc("books/b", { title: { stringValue: "B" } })];
        out = page.map(d => ({ document: d, readTime: body.readTime }));
      } else out = [{ document: doc("pages/about", { id: { stringValue: "own-id" }, order: { integerValue: "2" } }), readTime: body.readTime }];
      return { ok: true, json: async () => out } as any;
    };
    const data = await readStorefrontData(base, "p", fetchImpl as any, 2);
    expect(data.readTime).toBe("2026-10-15T03:49:48.748909Z");
    expect(data.settings).toEqual({ info: { name: "Shop" } });
    expect(data.books).toEqual([{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }]);
    // Pages keep a stored `id` field over the document id, exactly like getPublishedPages' { id, ...data }.
    expect(data.pages).toEqual([{ id: "own-id", order: 2 }]);
    expect(calls.slice(1).every(c => c.body.readTime === "2026-10-15T03:49:48.748909Z")).toBe(true);
  });

  it("stops when a read fails, so no file is written", async () => {
    const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({}) }) as any;
    await expect(readStorefrontData(base, "p", fetchImpl as any)).rejects.toThrow(/403/);
  });
});
