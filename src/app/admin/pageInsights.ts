// Page helpers: SEO guidance, duplication and menu ordering. Pure.
import { pageBodyText } from "../features/site/pageBody";
import { snippet } from "../lib/bookSeo";
export interface SeoHint { level: "good" | "warn"; text: string }

export function seoHints(title: string, seoTitle: string, meta: string): SeoHint[] {
  const t = (seoTitle || title || "").trim();
  const m = (meta || "").trim();
  const hints: SeoHint[] = [];
  if (!t) hints.push({ level: "warn", text: "Add a title." });
  else if (t.length < 20) hints.push({ level: "warn", text: `Title is short (${t.length}). Aim for 30–60 characters.` });
  else if (t.length > 60) hints.push({ level: "warn", text: `Title may be cut off in search (${t.length}). Aim for 30–60 characters.` });
  else hints.push({ level: "good", text: `Title length is good (${t.length}).` });
  if (!m) hints.push({ level: "warn", text: "Add a meta description (70–160 characters)." });
  else if (m.length < 70) hints.push({ level: "warn", text: `Description is short (${m.length}). Aim for 70–160 characters.` });
  else if (m.length > 160) hints.push({ level: "warn", text: `Description may be cut off (${m.length}). Aim for 70–160 characters.` });
  else hints.push({ level: "good", text: `Description length is good (${m.length}).` });
  return hints;
}

/** Search title and description written from the page itself (Studio › Pages › Auto-fill from page).
 *  The title is the page title (the storefront adds the shop name around it); the description is the
 *  body's opening sentences (headings skipped unless the page has nothing else), ending on a whole
 *  sentence or word within 160 characters. */
export function autoSeo(page: { title?: string; body?: string }): { seoTitle: string; metaDescription: string } {
  const title = String(page.title || "").replace(/\s+/g, " ").trim();
  const body = String(page.body || "");
  const text = pageBodyText(body.replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi, " ")) || pageBodyText(body);
  let description = "";
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const next = description ? `${description} ${sentence}` : sentence;
    if (next.length > 160) break;
    description = next;
  }
  return { seoTitle: snippet(title, 60), metaDescription: description || snippet(text, 160) };
}

/** Only the search fields this page leaves blank, filled from the page; {} when nothing would change. */
export function missingSeo(page: { title?: string; body?: string; seoTitle?: string; metaDescription?: string }) {
  const auto = autoSeo(page);
  const patch: { seoTitle?: string; metaDescription?: string } = {};
  if (!String(page.seoTitle || "").trim() && auto.seoTitle) patch.seoTitle = auto.seoTitle;
  if (!String(page.metaDescription || "").trim() && auto.metaDescription) patch.metaDescription = auto.metaDescription;
  return patch;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();

/** Draft copy of a page with a unique title and slug, ready to open as a new page. */
export function duplicatePage(p: any, existing: { slug: string }[]) {
  const taken = new Set(existing.map((e) => e.slug));
  const baseSlug = slugify(String(p.slug || p.title || "page")).replace(/-copy(-\d+)?$/, "");
  let slug = `${baseSlug}-copy`;
  for (let i = 2; taken.has(slug); i++) slug = `${baseSlug}-copy-${i}`;
  const { id, createdAt, updatedAt, ...rest } = p;
  return { ...rest, title: `${p.title} (copy)`, slug, status: "draft", order: existing.length };
}

/** Moves a page one step and returns the {id, order} writes needed to renumber the list by position (or []). */
export function movePage(sorted: { id: string; order?: number }[], id: string, dir: -1 | 1) {
  const i = sorted.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return [];
  const next = [...sorted];
  [next[i], next[j]] = [next[j], next[i]];
  // Renumber by position so ties or missing values can't make the move a no-op or collide.
  return next.map((p, idx) => ({ id: p.id, order: idx })).filter((u, idx) => next[idx].order !== idx);
}
