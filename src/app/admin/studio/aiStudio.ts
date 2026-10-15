// Studio AI writing (3.0 phase 8): which fields can be rewritten, the placeholders a rewrite must keep, and the
// sections the AI may draft. Pure; the server (functions/aiWriter.js) applies the same rules again and has the
// last word. Nothing here is saved: a rewrite or draft lands in the unsaved design as one undoable change.
import { isDynamic } from "../../features/site/dynamicSources";
import { newId, makeSection, type Section } from "./studioModel";

/** Field kinds that get "Rewrite with AI" (never raw HTML/code, links, pictures or numbers). */
export const REWRITE_KINDS = new Set(["text", "textarea", "richtext"]);
export const rewriteFormat = (kind: string): "plain" | "html" => (kind === "richtext" ? "html" : "plain");

export type RewriteHow = "improve" | "shorter" | "longer" | "friendlier" | "formal" | "fix" | "custom";
export const HOW_CHOICES: { how: Exclude<RewriteHow, "custom">; label: string }[] = [
  { how: "improve", label: "Improve" },
  { how: "shorter", label: "Shorter" },
  { how: "longer", label: "A little longer" },
  { how: "friendlier", label: "Friendlier" },
  { how: "formal", label: "More formal" },
  { how: "fix", label: "Fix spelling & grammar" },
];

const TOKEN_RE = /\{\{[^{}]{1,60}\}\}|\{[A-Za-z][A-Za-z0-9_.]{0,40}\}/g;
/** {placeholders} the shop fills in and {{book.title}} connected details: a rewrite must keep every one. */
export const tokensOf = (text: string) => [...new Set(String(text || "").match(TOKEN_RE) || [])];
export const keepsTokens = (before: string, after: string) => tokensOf(before).every(t => String(after || "").includes(t));

/** Visible words in a value (HTML tags and placeholders don't count). */
const words = (v: string) => String(v || "").replace(/<[^>]*>/g, " ").replace(TOKEN_RE, " ").replace(/&nbsp;/g, " ").trim();

/** Longest text the AI rewrites in one go (the server refuses longer rather than cut it). Same in functions/aiWriter.js. */
export const REWRITE_MAX = { plain: 4000, html: 8000 } as const;
/** Whether a field shows "Rewrite with AI": a plain, non-empty value of a text kind (not connected to a detail). */
export function canRewrite(kind: string, value: unknown): value is string {
  return REWRITE_KINDS.has(kind) && typeof value === "string" && !isDynamic(value) && words(value).length > 0;
}

const SIMPLE_TAGS = new Set(["p", "br", "strong", "b", "em", "i", "u", "a", "ul", "ol", "li", "h2", "h3", "h4", "blockquote"]);
/**
 * Why a value can't be rewritten (or "" when it can): too long, or rich text holding things the AI can't carry over
 * (pictures, videos, alignment, colours, big headings…), which a rewrite would otherwise drop without a word.
 */
export function rewriteProblem(kind: string, value: string): string {
  const format = rewriteFormat(kind);
  if (value.length > REWRITE_MAX[format]) return `This text is too long to rewrite in one go (over ${REWRITE_MAX[format].toLocaleString("en-CA")} characters). Split it, or rewrite a part at a time.`;
  if (format !== "html") return "";
  for (const m of value.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g)) {
    const tag = m[1].toLowerCase(), attrs = m[2].replace(/\s+(href|target|rel)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "").trim().replace(/\/$/, "").trim();
    if (!SIMPLE_TAGS.has(tag) || attrs)
      return "This text has pictures, videos, alignment, colours or other formatting the AI can't keep, so it isn't rewritten here. Rewrite a plain part, or edit it by hand.";
  }
  return "";
}

/** Sections the AI may draft and the words it writes for each. Must equal functions/aiWriter.js DRAFT_TYPES
 *  (aiStudio.test.ts). Quotes, testimonials and reviews are left out on purpose: the AI must never invent praise. */
export const DRAFT_TYPES: Record<string, { label: string; fields: Record<string, number>; items?: Record<string, number>; html?: string[]; example: string }> = {
  HeroSection: { label: "Hero banner", fields: { eyebrow: 60, title: 90, subtitle: 200, ctaText: 30 }, example: "Our autumn poetry list is out: five new books from first-time poets." },
  ImageWithTextSection: { label: "Image with text", fields: { eyebrow: 60, title: 90, body: 900, ctaText: 30 }, example: "How we print our books on a risograph in our Toronto studio." },
  TextContentSection: { label: "Text block", fields: { eyebrow: 60, title: 90, subtitle: 160, content: 2500 }, html: ["content"], example: "A short introduction to the press and what we publish." },
  FAQSection: { label: "Questions & answers", fields: { title: 90, subtitle: 200 }, items: { question: 160, answer: 700 }, example: "Shipping, returns and pre-orders, based on our policies." },
  NewsletterSection: { label: "Newsletter sign-up", fields: { title: 90, description: 300, buttonLabel: 30 }, example: "A monthly letter with new books and events." },
  FeatureGridSection: { label: "Feature grid", fields: { title: 90, subtitle: 200 }, items: { title: 70, description: 280 }, example: "Why buy from us: small runs, hand-finished, shipped from Toronto." },
};

type Meta = { defaults?: Record<string, any>; blockDefaults?: Record<string, any> } | undefined;

/**
 * A new section from an AI draft: the registry defaults (pictures, colours, layout) with only the drafted words laid
 * over them; drafted `items` become the section's blocks with fresh ids. Unknown keys and empty words are ignored.
 */
export function sectionFromDraft(type: string, draft: Record<string, any>, getMeta: (type: string) => Meta, blocksKey: (type: string) => string, sanitize: (html: string) => string = h => h): Section | null {
  const spec = DRAFT_TYPES[type];
  if (!spec || !draft || typeof draft !== "object") return null;
  const meta = getMeta(type);
  const section = makeSection(type, meta?.defaults || {});
  for (const [key, max] of Object.entries(spec.fields)) {
    const v = draft[key];
    if (typeof v !== "string" || !v.trim()) continue;
    section.settings[key] = (spec.html || []).includes(key) ? sanitize(v).slice(0, max * 2) : v.trim().slice(0, max);
  }
  if (spec.items && Array.isArray(draft.items)) {
    // Only items the AI filled completely; block defaults (a sample question, an icon) never stand in for its words.
    const items = draft.items.slice(0, 6)
      .filter((item: any) => Object.keys(spec.items!).every(k => typeof item?.[k] === "string" && item[k].trim()))
      .map((item: any) => {
        const block: Record<string, any> = { ...(meta?.blockDefaults || {}), id: newId() };
        for (const [key, max] of Object.entries(spec.items!)) block[key] = item[key].trim().slice(0, max);
        return block;
      });
    if (items.length) section.settings[blocksKey(type)] = items;
  }
  return section;
}
