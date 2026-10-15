// @vitest-environment jsdom
import { createRequire } from "module";
import { vi } from "vitest";
vi.mock("react-quill", () => ({ default: () => null }));
vi.mock("react-quill/dist/quill.snow.css", () => ({}));
import { describe, expect, it } from "vitest";
import { getBlockFields, getBlocksKey, getSectionFields, getSectionMeta, SECTION_REGISTRY } from "../ThemeEditorExtensions";
import { canRewrite, DRAFT_TYPES, keepsTokens, rewriteFormat, sectionFromDraft, tokensOf } from "./aiStudio";

const server = createRequire(import.meta.url)("../../../../functions/aiWriter.js");

describe("Studio AI rules", () => {
  it("drafts the same sections, fields and limits as the server", () => {
    const strip = (map: Record<string, any>) => Object.fromEntries(Object.entries(map).map(([t, s]) => [t, { label: s.label, fields: s.fields, items: s.items, html: s.html }]));
    expect(JSON.parse(JSON.stringify(strip(DRAFT_TYPES)))).toEqual(JSON.parse(JSON.stringify(strip(server.DRAFT_TYPES))));
  });
  it("only drafts real sections and their own text fields, and never quotes or reviews", () => {
    for (const [type, spec] of Object.entries(DRAFT_TYPES)) {
      expect(SECTION_REGISTRY.some(m => m.type === type), type).toBe(true);
      const keys = new Set(getSectionFields(type).filter(f => ["text", "textarea", "richtext"].includes(f.kind)).map(f => f.key));
      for (const key of Object.keys(spec.fields)) expect(keys.has(key), `${type}.${key}`).toBe(true);
      for (const key of (spec.html || [])) expect(getSectionFields(type).find(f => f.key === key)?.kind, `${type}.${key}`).toBe("richtext");
      if (spec.items) {
        const blockKeys = new Set(getBlockFields(type).map(f => f.key));
        for (const key of Object.keys(spec.items)) expect(blockKeys.has(key), `${type} block ${key}`).toBe(true);
      }
    }
    expect(Object.keys(DRAFT_TYPES).some(t => /Testimonial|Praise|Review|Quote/.test(t))).toBe(false);
  });
  it("offers a rewrite only for plain text, text areas and rich text with words in them", () => {
    expect(canRewrite("text", "Hello")).toBe(true);
    expect(canRewrite("richtext", "<p>Hi</p>")).toBe(true);
    expect(canRewrite("richtext", "<p></p>")).toBe(false);
    expect(canRewrite("text", "")).toBe(false);
    expect(canRewrite("text", "{name}")).toBe(false);
    expect(canRewrite("text", { $dyn: "book.title" })).toBe(false);
    for (const kind of ["link", "image", "html", "color", "number"]) expect(canRewrite(kind, "words"), kind).toBe(false);
    expect(rewriteFormat("richtext")).toBe("html");
    expect(rewriteFormat("textarea")).toBe("plain");
  });
  it("keeps every {placeholder} and connected detail", () => {
    expect(tokensOf("Hi {name}, {{book.title}} ({count})")).toEqual(["{name}", "{{book.title}}", "{count}"]);
    expect(keepsTokens("Hi {name}", "Hello {name}!")).toBe(true);
    expect(keepsTokens("Hi {name}", "Hello friend")).toBe(false);
  });
  it("builds a section from a draft: defaults kept, only drafted words laid over, items become fresh blocks", () => {
    const faq = sectionFromDraft("FAQSection", { title: "Questions", subtitle: "", extra: "ignored", items: [{ question: "Q1?", answer: "A1." }, { question: "Q2?", answer: "A2." }, { question: "half" }] }, getSectionMeta as any, getBlocksKey)!;
    expect(faq.type).toBe("FAQSection");
    expect(faq.settings.title).toBe("Questions");
    expect(faq.settings).not.toHaveProperty("extra");
    const items = faq.settings[getBlocksKey("FAQSection")];
    expect(items.map((b: any) => b.question)).toEqual(["Q1?", "Q2?"]);
    expect(new Set(items.map((b: any) => b.id)).size).toBe(2);
    const hero = sectionFromDraft("HeroSection", { title: "Autumn list" }, getSectionMeta as any, getBlocksKey)!;
    expect(hero.settings.title).toBe("Autumn list");
    expect(hero.settings.imageUrl).toBe(getSectionMeta("HeroSection")?.defaults?.imageUrl);
    const text = sectionFromDraft("TextContentSection", { title: "T", content: "<p>x</p><script>bad()</script>" }, getSectionMeta as any, getBlocksKey, h => h.replace(/<script[\s\S]*?<\/script>/g, ""))!;
    expect(text.settings.content).toBe("<p>x</p>");
    expect(sectionFromDraft("TestimonialsSection", { title: "x" }, getSectionMeta as any, getBlocksKey)).toBeNull();
  });
});
