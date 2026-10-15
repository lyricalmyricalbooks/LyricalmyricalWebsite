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

// [[keep-N]] / [[line-N]] hold a picture, video or line layout out of the text the AI sees (protectRichText).
const TOKEN_RE = /\{\{[^{}]{1,60}\}\}|\{[A-Za-z][A-Za-z0-9_.]{0,40}\}|\[\[(?:keep|line)-\d{1,3}\]\]/g;
/** {placeholders} the shop fills in, {{book.title}} connected details and picture/layout markers: a rewrite must keep every one. */
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

/** Tags the AI may write back (same list as functions/aiWriter.js HTML_TAGS, aiStudio.test.ts). */
export const SIMPLE_TAGS = new Set(["p", "br", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li", "h1", "h2", "h3", "h4", "blockquote"]);
/** Pictures, videos and dividers: held out of the text and put back exactly. */
const KEPT_TAGS = new Set(["img", "iframe", "video", "audio", "picture", "figure", "hr", "svg"]);
/** Lines whose alignment / indent (Quill's ql-align-* / ql-indent-* or text-align) is held out and put back. */
const LINE_TAGS = new Set(["p", "h1", "h2", "h3", "h4", "li", "blockquote"]);
const LINE_CLASS = /^ql-(align-(left|center|right|justify)|indent-[1-8])$/;
const LINK_ATTRS = new Set(["href", "target", "rel", "title"]);
const COLOUR_PROBLEM = "This text has coloured, highlighted or specially styled words the AI can't keep, so it isn't rewritten here. Remove that styling first, or edit it by hand.";
const FORMAT_PROBLEM = (what: string) => `This text has formatting the AI can't keep (${what}), so it isn't rewritten here. Edit it by hand.`;
const MARKER_G = /\[\[(?:keep|line)-\d{1,3}\]\]/g;
export const MOVED_MARK = "The AI moved or dropped a picture, video or line layout, so nothing was changed. Try again.";

/** What protectRichText held out of the text: kept[n - 1] belongs to marker [[keep-n]] / [[line-n]]. */
export type HeldOut = { keep: { html: string; block: boolean }[]; line: { cls: string; style: string }[] };
const parse = (html: string) => { const t = document.createElement("template"); t.innerHTML = html; return t; };
const hasKept = (el: Element) => KEPT_TAGS.has(el.tagName.toLowerCase()) || [...KEPT_TAGS].some(t => el.querySelector(t));

/**
 * Rich text as the AI may see it: every picture, video and divider becomes a [[keep-N]] marker (a line of its own
 * when it stood alone) and every aligned or indented line starts with a [[line-N]] marker instead of its layout.
 * restoreRichText puts them back. `problem` names anything else it can't carry over (coloured words, odd tags).
 */
export function protectRichText(html: string): { text: string; held: HeldOut; problem: string } {
  const held: HeldOut = { keep: [], line: [] };
  if (typeof document === "undefined") return { text: html, held, problem: FORMAT_PROBLEM("not in a browser") };
  const root = parse(html);
  let problem = "";
  const keepNode = (el: Element, block: boolean) => {
    held.keep.push({ html: el.outerHTML, block });
    const marker = `[[keep-${held.keep.length}]]`;
    if (block) { const p = document.createElement("p"); p.textContent = marker; el.replaceWith(p); }
    else el.replaceWith(document.createTextNode(marker));
  };
  const walk = (parent: ParentNode, top: boolean) => {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === 8) { node.remove(); continue; }
      if (node.nodeType !== 1) continue;
      const el = node as HTMLElement, tag = el.tagName.toLowerCase();
      // A line that is only a picture/video/divider (Quill's <p><img></p>, a top-level <iframe>/<hr>) is held whole.
      if (top && hasKept(el) && !(el.textContent || "").trim()) { keepNode(el, true); continue; }
      if (KEPT_TAGS.has(tag)) { keepNode(el, false); continue; }
      if (!SIMPLE_TAGS.has(tag) && tag !== "span") { problem ||= FORMAT_PROBLEM(`<${tag}>`); continue; }
      let lineCls = "", lineStyle = "";
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (tag === "a" && LINK_ATTRS.has(name)) continue;
        if (LINE_TAGS.has(tag) && name === "class" && attr.value.trim().split(/\s+/).every(c => LINE_CLASS.test(c))) { lineCls = attr.value.trim(); continue; }
        if (LINE_TAGS.has(tag) && name === "style" && Array.from(el.style).every(k => k === "text-align")) { lineStyle = el.getAttribute("style") || ""; continue; }
        problem ||= name === "style" || name === "class" ? COLOUR_PROBLEM : FORMAT_PROBLEM(`${name} on <${tag}>`);
      }
      if (tag === "span" && el.attributes.length) problem ||= COLOUR_PROBLEM;
      walk(el, false);
      if (lineCls || lineStyle) {
        el.removeAttribute("class"); el.removeAttribute("style");
        held.line.push({ cls: lineCls, style: lineStyle });
        el.insertBefore(document.createTextNode(`[[line-${held.line.length}]]`), el.firstChild);
      }
    }
  };
  walk(root.content, true);
  return { text: root.innerHTML, held, problem };
}

/** The rewritten rich text with every held-out picture, video and line layout back in place, or why it can't be. */
export function restoreRichText(answer: string, held: HeldOut): { html: string } | { error: string } {
  if (typeof document === "undefined") return { error: MOVED_MARK };
  const found = [...String(answer).matchAll(/\[\[(keep|line)-(\d{1,3})\]\]/g)].map(m => ({ kind: m[1] as "keep" | "line", n: Number(m[2]) }));
  const count = (kind: string, n: number) => found.filter(f => f.kind === kind && f.n === n).length;
  const keepOrder = found.filter(f => f.kind === "keep").map(f => f.n);
  if (found.length !== held.keep.length + held.line.length
    || held.keep.some((_, i) => count("keep", i + 1) !== 1) || held.line.some((_, i) => count("line", i + 1) !== 1)
    || keepOrder.some((n, i) => n !== i + 1)) return { error: MOVED_MARK };
  const root = parse(answer);
  // Each marker as its own text node, so it can be swapped for what it stands for.
  const markers: Text[] = [];
  const texts: Text[] = [];
  const walker = document.createTreeWalker(root.content, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
  for (let text of texts) {
    let m: RegExpExecArray | null;
    while ((m = /\[\[(?:keep|line)-\d{1,3}\]\]/.exec(text.data))) {
      const marker = m.index ? text.splitText(m.index) : text;
      const rest = marker.splitText(m[0].length);
      markers.push(marker);
      text = rest;
    }
  }
  const nodes = (html: string) => Array.from(parse(html).content.childNodes);
  const emptied = new Set<Node>();
  const after = new Map<Node, ChildNode>();
  const topOf = (node: Node) => { let n: Node = node; while (n.parentNode && n.parentNode !== root.content) n = n.parentNode; return n; };
  for (const marker of markers) {
    const [, kind, num] = /\[\[(keep|line)-(\d+)\]\]/.exec(marker.data)!;
    const i = Number(num) - 1;
    if (kind === "line") {
      let block = marker.parentNode as Element | null;
      while (block && !(block instanceof Element && LINE_TAGS.has(block.tagName.toLowerCase()))) block = block.parentNode as Element | null;
      const before = block ? (block.textContent || "").slice(0, (block.textContent || "").indexOf(marker.data)) : "x";
      if (!block || before.replace(MARKER_G, "").trim()) return { error: MOVED_MARK };
      const { cls, style } = held.line[i];
      if (cls) block.setAttribute("class", cls);
      if (style) block.setAttribute("style", style);
      marker.remove();
      continue;
    }
    const kept = held.keep[i];
    if (!kept.block) { marker.replaceWith(...nodes(kept.html)); continue; }
    const top = topOf(marker);
    if (top === marker) { marker.replaceWith(...nodes(kept.html)); continue; }
    // A picture's own line goes back as its own line: before the line the AI put its marker in when the marker
    // starts that line, otherwise after it (in order); a line left holding only markers is removed below.
    const lead = (top.textContent || "").slice(0, (top.textContent || "").indexOf(marker.data)).replace(MARKER_G, "").trim();
    // Take the marker out without leaving a double space (or a leading one) where it stood.
    const prev = marker.previousSibling, next = marker.nextSibling;
    if (next?.nodeType === 3 && (!prev || (prev.nodeType === 3 && /\s$/.test((prev as Text).data)) || (prev.nodeType === 3 && !(prev as Text).data))) (next as Text).data = (next as Text).data.replace(/^\s+/, "");
    marker.remove();
    emptied.add(top);
    if (!lead) (top as ChildNode).before(...nodes(kept.html));
    else { const parts = nodes(kept.html); (after.get(top) || (top as ChildNode)).after(...parts); after.set(top, parts[parts.length - 1] as ChildNode); }
  }
  for (const top of emptied) if (!(top.textContent || "").trim() && !(top instanceof Element && top.querySelector("img,iframe,video,audio,picture,figure,hr,svg"))) (top as ChildNode).remove();
  return { html: root.innerHTML };
}

/** The same rich text as the browser writes it (so "nothing changed" isn't fooled by spelling of tags). */
export const normalizeRichText = (html: string) => (typeof document === "undefined" ? html : parse(html).innerHTML);

/**
 * Why a value can't be rewritten (or "" when it can): too long, or rich text holding things the AI can't carry over
 * (coloured words, unusual tags). Pictures, videos, dividers, alignment and indents are fine: they're held out.
 */
export function rewriteProblem(kind: string, value: string): string {
  const format = rewriteFormat(kind);
  const tooLong = `This text is too long to rewrite in one go (over ${REWRITE_MAX[format].toLocaleString("en-CA")} characters). Split it, or rewrite a part at a time.`;
  if (format !== "html") return value.length > REWRITE_MAX[format] ? tooLong : "";
  const { text, problem } = protectRichText(value);
  if (problem) return problem;
  return text.length > REWRITE_MAX.html ? tooLong : "";
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
