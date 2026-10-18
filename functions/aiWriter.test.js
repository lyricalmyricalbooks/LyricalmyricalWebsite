import { createRequire } from "module";
import { describe, expect, it, vi } from "vitest";

const { aiKeyProblem, photoImageUrl, buildRequest, parseResponse, generate, handleAiWrite, fitWords, plainText, bookFacts } = createRequire(import.meta.url)("./aiWriter");

const KEY = "AIza" + "x".repeat(35);
const reply = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const answer = obj => reply(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: "STOP" }] });
const deps = (over = {}) => ({ readSettings: async () => ({ apiKey: KEY, voice: "" }), allow: async () => true, fetchImpl: vi.fn(), ...over });

describe("AI writing assistant (Gemini)", () => {
  it("accepts AI Studio keys and refuses junk", () => {
    expect(aiKeyProblem(KEY)).toBe("");
    expect(aiKeyProblem("")).toMatch(/Enter/);
    expect(aiKeyProblem("not a key")).toMatch(/doesn't look/);
  });

  it("asks for JSON and turns off thinking on 2.5 flash only", () => {
    const body = buildRequest("bookSeo", { title: "Salt" }, { siteName: "Lyricalmyrical Books" }, "gemini-2.5-flash");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(buildRequest("bookSeo", { title: "Salt" }, {}, "gemini-flash-latest").generationConfig.thinkingConfig).toBeUndefined();
    expect(body.contents[0].parts[0].text).toContain("Title: Salt");
    expect(body.systemInstruction.parts[0].text).toMatch(/Never invent/);
  });

  it("puts the owner's house style in the instructions", () => {
    const body = buildRequest("bookDescription", { title: "Salt" }, { voice: "Short sentences. British spelling." });
    expect(body.systemInstruction.parts[0].text).toContain("British spelling");
  });

  it("sends only catalog facts, with HTML and links stripped", () => {
    const facts = bookFacts({ title: "Salt", description: "<p>A <b>bold</b> [link](https://x.y) book.</p>", costPrice: 4, shelfLocation: "B2" });
    expect(facts.description).toBe("A bold link book.");
    expect(JSON.stringify(facts)).not.toMatch(/costPrice|shelfLocation|B2/);
    expect(plainText("a<script>bad()</script>b")).toBe("a b");
  });

  it("cleans and fits the answer", () => {
    const long = "word ".repeat(60);
    const out = parseResponse("bookSeo", { candidates: [{ content: { parts: [{ text: JSON.stringify({ metaTitle: "Salt by Ana", metaDescription: long }) }] } }] });
    expect(out.metaTitle).toBe("Salt by Ana");
    expect(out.metaDescription.length).toBeLessThanOrEqual(160);
    expect(out.metaDescription.endsWith(" ")).toBe(false);
    expect(fitWords("one two three", 8)).toBe("one two");
  });

  it("strips markdown from a description and keeps paragraphs", () => {
    const out = parseResponse("bookDescription", { candidates: [{ content: { parts: [{ text: JSON.stringify({ description: "## Heading\n**Bold** start\nline two\n\n- a point" }) }] } }] });
    expect(out.description).toBe("Heading Bold start line two\n\na point");
  });

  it("ignores thought parts and explains a blocked prompt", () => {
    const data = { candidates: [{ content: { parts: [{ text: "thinking…", thought: true }, { text: '{"seoTitle":"About","metaDescription":"Who we are."}' }] } }] };
    expect(parseResponse("pageSeo", data)).toEqual({ seoTitle: "About", metaDescription: "Who we are." });
    expect(() => parseResponse("pageSeo", { promptFeedback: { blockReason: "SAFETY" } })).toThrow(/safety filter/);
    expect(() => parseResponse("pageSeo", { candidates: [{ content: { parts: [{ text: "not json" }] } }] })).toThrow(/couldn't be read/);
  });

  it("moves to the next model when Google has retired one", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply(404, { error: { status: "NOT_FOUND", message: "models/gemini-2.5-flash is not found" } }))
      .mockResolvedValueOnce(answer({ seoTitle: "About", metaDescription: "Who we are." }));
    const out = await generate({ apiKey: KEY, task: "pageSeo", input: { title: "About" }, fetchImpl });
    expect(out.model).toBe("gemini-flash-latest");
    expect(fetchImpl.mock.calls[1][0]).toContain("gemini-flash-latest:generateContent");
    expect(fetchImpl.mock.calls[0][1].headers["x-goog-api-key"]).toBe(KEY);
  });

  it("explains the free allowance running out", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(429, { error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }));
    await expect(generate({ apiKey: KEY, task: "pageSeo", input: { title: "About" }, fetchImpl })).rejects.toThrow(/free Google AI allowance/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("needs a saved key before calling Google", async () => {
    const d = deps({ readSettings: async () => ({}) });
    const out = await handleAiWrite({ task: "bookSeo", input: { title: "Salt" } }, d);
    expect(out.status).toBe(412);
    expect(out.body.needsKey).toBe(true);
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });

  it("is rate limited and refuses unknown tasks", async () => {
    expect((await handleAiWrite({ task: "bookSeo", input: { title: "Salt" } }, deps({ allow: async () => false }))).status).toBe(429);
    expect((await handleAiWrite({ task: "deleteEverything" }, deps())).status).toBe(400);
    expect((await handleAiWrite({ task: "bookSeo", input: {} }, deps())).body.error).toMatch(/title first/);
  });

  it("returns a suggestion for a book", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(answer({ metaTitle: "Salt by Ana — Lyricalmyrical", metaDescription: "A risograph-printed book of sea poems." }));
    const out = await handleAiWrite({ task: "bookSeo", input: { title: "Salt", author: "Ana" }, siteName: "Lyricalmyrical" }, deps({ fetchImpl }));
    expect(out).toEqual({ status: 200, body: { ok: true, result: { metaTitle: "Salt by Ana — Lyricalmyrical", metaDescription: "A risograph-printed book of sea poems.", model: "gemini-2.5-flash" } } });
  });

  it("describes a book photo from the shop's own Storage bucket only", async () => {
    const BUCKET = "shop.firebasestorage.app";
    const own = "https://firebasestorage.googleapis.com/v0/b/shop.firebasestorage.app/o/products%2F1-01-960w.webp?alt=media&token=t";
    expect(photoImageUrl(own, BUCKET)).toBe(own);
    expect(photoImageUrl("https://storage.googleapis.com/shop.firebasestorage.app/products/a.jpg", BUCKET)).toMatch(/^https:/);
    expect(photoImageUrl("https://firebasestorage.googleapis.com/v0/b/other.appspot.com/o/a.jpg", BUCKET)).toBe("");
    expect(photoImageUrl("https://evil.example/v0/b/shop.firebasestorage.app/o/a.jpg", BUCKET)).toBe("");
    expect(photoImageUrl("http://firebasestorage.googleapis.com/v0/b/shop.firebasestorage.app/o/a.jpg", BUCKET)).toBe("");
    expect(photoImageUrl("https://firebasestorage.googleapis.com:8443/v0/b/shop.firebasestorage.app/o/a.jpg", BUCKET)).toBe("");

    const refused = await handleAiWrite({ task: "photoAlt", input: { title: "Salt", imageUrl: "https://evil.example/a.jpg" } }, deps({ bucket: BUCKET }));
    expect(refused.status).toBe(400);

    const image = { ok: true, status: 200, headers: { get: h => (h === "content-type" ? "image/webp" : "4") }, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer };
    const fetchImpl = vi.fn().mockResolvedValueOnce(image).mockResolvedValueOnce(answer({ alt: "Salt by Ana, open on a spread of grey sea photographs" }));
    const out = await handleAiWrite({ task: "photoAlt", input: { title: "Salt", author: "Ana", imageUrl: own, photoNumber: 2 } }, deps({ fetchImpl, bucket: BUCKET }));
    expect(out.body.result.alt).toBe("Salt by Ana, open on a spread of grey sea photographs");
    expect(fetchImpl.mock.calls[0][0]).toBe(own);
    const sent = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(sent.contents[0].parts[0].inlineData).toEqual({ mimeType: "image/webp", data: Buffer.from([1, 2, 3, 4]).toString("base64") });
    expect(sent.contents[0].parts[1].text).toMatch(/photo 2 of the book/);

    const notImage = { ...image, headers: { get: () => "text/html" } };
    const bad = await handleAiWrite({ task: "photoAlt", input: { title: "Salt", imageUrl: own } }, deps({ fetchImpl: vi.fn().mockResolvedValue(notImage), bucket: BUCKET }));
    expect(bad.status).toBe(502);
  });

  it("Check key reports Google's refusal in plain English", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(400, { error: { status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key." } }));
    const out = await handleAiWrite({ op: "check" }, deps({ fetchImpl }));
    expect(out.status).toBe(200);
    expect(out.body.ok).toBe(false);
    expect(out.body.error).toMatch(/isn't valid/);
  });
});
