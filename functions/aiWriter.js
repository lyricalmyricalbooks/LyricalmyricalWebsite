// AI writing assistant (Google Gemini, free AI Studio key). Admin-only: the key lives in the admin-only
// adminSecrets/ai doc and is used only here, through createStripeCheckoutSession `action: "aiWrite"`.
// Every answer is a suggestion the owner reviews in the editor; nothing here writes to Firestore.
const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models/";
// Tried in order; a model Google has retired (404) moves on to the next one.
const MODELS = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"];
const TIMEOUT_MS = 25000;
const VOICE_MAX = 1000;

const clip = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim().slice(0, max) : "");
const oneLine = v => String(v || "").replace(/\s+/g, " ").trim();

/** Strips HTML and the description's light markup so the model sees plain words. */
function plainText(value, max = 6000) {
  return clip(String(value || "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, "\"").replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n"), max);
}

/** Ends on a whole word within `max` characters (never mid-word, no dangling punctuation). */
function fitWords(text, max) {
  const clean = oneLine(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : clean.slice(0, max)).replace(/[\s,;:–—-]+$/, "");
}

/** A key worth sending to Google. AI Studio keys start "AIza"; newer formats are allowed if they look like a token. */
function aiKeyProblem(value) {
  const v = String(value || "").trim();
  if (!v) return "Enter a Google AI Studio API key.";
  if (/\s/.test(v) || !/^[A-Za-z0-9_.-]{30,200}$/.test(v)) return "That doesn't look like a Google AI key (it usually starts with AIza and is 39 characters).";
  return "";
}

/** The book facts the model may use — nothing else, so it has nothing private to repeat. */
function bookFacts(input) {
  const b = input && typeof input === "object" ? input : {};
  const list = v => (Array.isArray(v) ? v.map(x => clip(String(x ?? ""), 80)).filter(Boolean).slice(0, 12) : []);
  const pages = Math.floor(Number(b.pageCount));
  return {
    title: clip(b.title, 200),
    author: clip(b.author, 300),
    format: clip(b.format, 80),
    editions: list(b.editions),
    categories: list(b.categories),
    tags: list(b.tags),
    publisher: clip(b.publisher, 120),
    publishDate: clip(b.publishDate, 40),
    pageCount: pages > 0 && pages < 100000 ? pages : 0,
    language: clip(b.language, 40),
    description: plainText(b.description, 6000),
    preorder: b.preorder === true,
    comingSoon: b.comingSoon === true,
  };
}

function factLines(f) {
  return [
    f.title && `Title: ${f.title}`,
    f.author && `Author / contributors: ${f.author}`,
    f.format && `Format: ${f.format}`,
    f.editions.length && `Editions: ${f.editions.join("; ")}`,
    f.pageCount && `Pages: ${f.pageCount}`,
    f.publisher && `Publisher: ${f.publisher}`,
    f.publishDate && `Publication date: ${f.publishDate}`,
    f.language && `Language: ${f.language}`,
    f.categories.length && `Shop categories: ${f.categories.join(", ")}`,
    f.tags.length && `Tags: ${f.tags.join(", ")}`,
    f.preorder && "Sold as a pre-order before publication.",
    f.comingSoon && "Shown as coming soon (not for sale yet).",
    f.description && `Current description:\n${f.description}`,
  ].filter(Boolean).join("\n");
}

const HONESTY = "Use only the facts given. Never invent awards, reviews, quotes, prices, page counts, dates, editions or claims about the author. If a fact is missing, leave it out. Write in the same language as the book's title and description. No emoji, no hashtags, no markdown, no quotation marks around the whole answer.";

// ── Studio (3.0 phase 8): rewrite one field, draft one section ────────────────────────────────────────
const STUDIO_HONESTY = "Use only what the owner wrote or asked for. Never invent prices, dates, awards, reviews, quotes, testimonials, statistics, stock levels or claims about authors. Write in the same language as the original text (or the request). No emoji, no hashtags, no markdown.";
const REWRITE_HOW = {
  improve: "Make it clearer and more inviting while keeping its meaning and length.",
  shorter: "Make it noticeably shorter (about half), keeping the essential meaning.",
  longer: "Make it a little fuller (up to about half as long again) using only what it already says; add no new facts.",
  friendlier: "Make it warmer and friendlier.",
  formal: "Make it more polished and formal.",
  fix: "Only fix spelling, grammar and punctuation. Change nothing else.",
};
const TOKEN_RE = /\{\{[^{}]{1,60}\}\}|\{[A-Za-z][A-Za-z0-9_.]{0,40}\}/g;
/** The {placeholders} (and {{book.title}}-style connected details) a text uses: they must survive a rewrite. */
const tokensOf = text => [...new Set(String(text || "").match(TOKEN_RE) || [])];
const HTML_TAGS = new Set(["p", "br", "strong", "b", "em", "i", "u", "a", "ul", "ol", "li", "h2", "h3", "h4", "blockquote"]);
const safeHref = h => /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(h) && !/[\s"'<>]/.test(h);
/** Keeps only simple formatting tags (and http(s)/relative links); everything else becomes its text. */
function sanitizeHtml(html) {
  return String(html || "")
    .replace(/<(script|style|iframe|object|embed|template)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (tag, name, attrs) => {
      const n = name.toLowerCase();
      if (!HTML_TAGS.has(n)) return "";
      if (tag.startsWith("</")) return n === "br" ? "" : `</${n}>`;
      if (n !== "a") return `<${n}>`;
      const href = (/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs) || [])[1] ?? (/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs) || [])[2] ?? "";
      return safeHref(href) ? `<a href="${href.replace(/&(?!amp;)/g, "&amp;")}">` : "<a>";
    })
    .trim();
}
const hrefsOf = html => [...String(html || "").matchAll(/\bhref\s*=\s*"([^"]*)"/gi)].map(m => m[1].replace(/&amp;/g, "&"));
function rewriteInput(input) {
  const i = input && typeof input === "object" ? input : {};
  const format = i.format === "html" ? "html" : "plain";
  const how = Object.prototype.hasOwnProperty.call(REWRITE_HOW, i.how) || i.how === "custom" ? i.how : "improve";
  return {
    format, how,
    text: format === "html" ? clip(String(i.text || ""), 8000) : clip(String(i.text || ""), 4000),
    label: clip(i.label, 80), where: clip(i.where, 80), instruction: how === "custom" ? oneLine(clip(i.instruction, 200)) : "",
  };
}

/** Sections the AI may draft, with the words it writes for each (checked against the Studio registry by a test). */
const DRAFT_TYPES = {
  HeroSection: { label: "Hero banner", fields: { eyebrow: 60, title: 90, subtitle: 200, ctaText: 30 } },
  ImageWithTextSection: { label: "Image with text", fields: { eyebrow: 60, title: 90, body: 900, ctaText: 30 } },
  TextContentSection: { label: "Text block", fields: { eyebrow: 60, title: 90, subtitle: 160, content: 2500 }, html: ["content"] },
  FAQSection: { label: "Questions & answers", fields: { title: 90, subtitle: 200 }, items: { question: 160, answer: 700 } },
  NewsletterSection: { label: "Newsletter sign-up", fields: { title: 90, description: 300, buttonLabel: 30 } },
  FeatureGridSection: { label: "Feature grid", fields: { title: 90, subtitle: 200 }, items: { title: 70, description: 280 } },
};
const draftSpec = type => (Object.prototype.hasOwnProperty.call(DRAFT_TYPES, type) ? DRAFT_TYPES[type] : null);
function draftSchema(spec) {
  const str = { type: "STRING" };
  const props = Object.fromEntries(Object.keys(spec.fields).map(k => [k, str]));
  if (spec.items) props.items = { type: "ARRAY", items: { type: "OBJECT", properties: Object.fromEntries(Object.keys(spec.items).map(k => [k, str])), required: Object.keys(spec.items) } };
  return { type: "OBJECT", properties: props, required: [...Object.keys(spec.fields), ...(spec.items ? ["items"] : [])] };
}

const TASKS = {
  // Books › edit › Search (SEO): title used exactly as written, so it carries the shop name when it fits.
  bookSeo: {
    needs: f => Boolean(f.title),
    prompt: (f, ctx) => `Write the Google search listing for this book on ${ctx.siteName || "an independent publisher's online shop"}.
- metaTitle: at most 60 characters. Lead with the book title, then the author if it fits${ctx.siteName ? `, then " — ${ctx.siteName}" only if it still fits` : ""}.
- metaDescription: 130 to 155 characters, one or two complete sentences that make a reader want to click: what the book is and why it is worth reading. Mention the format if known.

${factLines(bookFacts(f))}`,
    schema: { type: "OBJECT", properties: { metaTitle: { type: "STRING" }, metaDescription: { type: "STRING" } }, required: ["metaTitle", "metaDescription"] },
    clean: out => ({ metaTitle: fitWords(out.metaTitle, 70), metaDescription: fitWords(out.metaDescription, 160) }),
    ok: out => Boolean(out.metaTitle && out.metaDescription),
  },
  // Books › edit › Details › Description: plain paragraphs (the editor's own light markup is added by hand).
  bookDescription: {
    needs: f => Boolean(f.title),
    prompt: (f) => `${f.description ? "Improve this book's product description for the shop page: keep every fact and the author's intent, make it clearer and more inviting, fix grammar." : "Write a product description for this book's shop page from the facts below."}
- 2 to 4 short paragraphs, 90 to 220 words in total, separated by a blank line.
- Plain text only: no headings, bullet points, bold, links or markdown.
- Warm, specific and literary, suited to an independent art and poetry publisher. No hype words like "must-read" or "unputdownable".

${factLines(bookFacts(f))}`,
    schema: { type: "OBJECT", properties: { description: { type: "STRING" } }, required: ["description"] },
    clean: out => ({
      description: clip(String(out.description || "")
        .replace(/\r/g, "")
        .split(/\n\s*\n/)
        .map(p => oneLine(p.replace(/^\s*(#+|[-*•]|\d+\.)\s+/gm, "").replace(/\*\*|__|`/g, "")))
        .filter(Boolean)
        .join("\n\n"), 4000),
    }),
    ok: out => Boolean(out.description),
  },
  // Studio › Pages: the storefront adds the shop name around a page's search title, so the title leaves it out.
  pageSeo: {
    needs: f => Boolean(clip(f?.title, 200) || plainText(f?.text, 100)),
    prompt: (f, ctx) => `Write the Google search listing for this page of ${ctx.siteName || "an independent publisher's online shop"}.
- seoTitle: at most ${Math.max(20, 60 - (ctx.titleSuffix || 0))} characters, describing the page. Do not include the shop name (it is added automatically).
- metaDescription: 130 to 155 characters, one or two complete sentences summarising what a visitor finds on the page.

Page title: ${clip(f.title, 200) || "(none)"}
Page text:
${plainText(f.text, 6000) || "(empty)"}`,
    schema: { type: "OBJECT", properties: { seoTitle: { type: "STRING" }, metaDescription: { type: "STRING" } }, required: ["seoTitle", "metaDescription"] },
    clean: (out, ctx) => ({ seoTitle: fitWords(out.seoTitle, Math.max(20, 70 - (ctx.titleSuffix || 0))), metaDescription: fitWords(out.metaDescription, 160) }),
    ok: out => Boolean(out.seoTitle && out.metaDescription),
  },
  // Studio › any text field or Text & labels entry: one rewrite of the owner's own words.
  rewrite: {
    needs: f => Boolean(rewriteInput(f).text.replace(/<[^>]*>/g, "").trim()),
    prompt: (f) => {
      const r = rewriteInput(f);
      const tokens = tokensOf(r.text);
      return `Rewrite this text from the online shop${r.where ? ` (${r.where}` : ""}${r.label ? `${r.where ? ", " : " ("}field "${r.label}"` : ""}${r.where || r.label ? ")" : ""}.
- ${r.how === "custom" ? `The owner asks: ${r.instruction || "improve it"}` : REWRITE_HOW[r.how]}
- ${STUDIO_HONESTY}
${tokens.length ? `- Keep these placeholders exactly as written, braces included: ${tokens.join(" ")}\n` : ""}${r.format === "html" ? "- The text is HTML. Answer in HTML using only <p>, <br>, <strong>, <em>, <u>, <a href>, <ul>, <ol>, <li>, <h2>, <h3>, <h4>, <blockquote>. Keep every link and its href exactly." : "- Answer in plain text (keep line breaks if the original has them)."}
- Return the new text in the field "text".

Original:
${r.text}`;
    },
    schema: { type: "OBJECT", properties: { text: { type: "STRING" } }, required: ["text"] },
    clean: (out, ctx) => {
      const r = rewriteInput(ctx.input);
      const raw = String(out.text || "").replace(/\r/g, "");
      const text = r.format === "html" ? sanitizeHtml(raw).slice(0, 12000) : clip(raw.trim().replace(/^["“]([\s\S]*)["”]$/, "$1").replace(/\*\*|__|`/g, ""), 4000);
      return { text };
    },
    ok: (out, ctx) => {
      if (!out.text) return false;
      const r = rewriteInput(ctx.input);
      if (!tokensOf(r.text).every(t => out.text.includes(t))) throw Object.assign(new Error("The AI dropped a {placeholder} from the text, so nothing was changed. Try again."), { status: 502, friendly: true });
      if (r.format === "html" && !hrefsOf(r.text).every(h => hrefsOf(out.text).includes(h))) throw Object.assign(new Error("The AI changed a link in the text, so nothing was changed. Try again."), { status: 502, friendly: true });
      return true;
    },
  },
  // Studio › Add section › Draft with AI: the words for one new section, from the owner's short brief.
  sectionDraft: {
    needs: f => Boolean(draftSpec(f?.type) && clip(f?.brief, 500)),
    prompt: (f, ctx) => {
      const spec = draftSpec(f.type);
      const fields = Object.entries(spec.fields).map(([k, max]) => `${k} (at most ${max} characters${(spec.html || []).includes(k) ? ", simple HTML: <p>, <strong>, <em>, <ul>, <li>" : ""})`).join(", ");
      return `Draft the words for a "${spec.label}" section on ${ctx.siteName || "an independent publisher's online shop"}.
- Fields: ${fields}.${spec.items ? `\n- items: 3 to 6 entries, each with ${Object.entries(spec.items).map(([k, max]) => `${k} (at most ${max} characters)`).join(" and ")}.` : ""}
- ${STUDIO_HONESTY} Where the brief lacks a fact, write around it instead of guessing.
- Short, specific and warm, suited to an independent art and poetry publisher.

What the owner wants this section to say:
${clip(f.brief, 500)}`;
    },
    schemaFor: f => draftSchema(draftSpec(f?.type) || DRAFT_TYPES.HeroSection),
    schema: draftSchema(DRAFT_TYPES.HeroSection),
    clean: (out, ctx) => {
      const spec = draftSpec(ctx.input?.type);
      if (!spec) return {};
      const cleaned = {};
      for (const [k, max] of Object.entries(spec.fields)) {
        const v = String(out[k] ?? "");
        cleaned[k] = (spec.html || []).includes(k) ? sanitizeHtml(v).slice(0, max * 2) : fitWords(v.replace(/\*\*|__|`/g, ""), max);
      }
      if (spec.items) {
        cleaned.items = (Array.isArray(out.items) ? out.items : []).slice(0, 6).map(item => Object.fromEntries(Object.entries(spec.items).map(([k, max]) => [k, fitWords(String(item?.[k] ?? ""), max)])))
          .filter(item => Object.values(item).every(Boolean));
      }
      return cleaned;
    },
    ok: (out, ctx) => {
      const spec = draftSpec(ctx.input?.type);
      return Boolean(spec && out.title && (!spec.items || out.items.length > 0));
    },
  },
};

function systemText(voice, task) {
  const v = clip(voice, VOICE_MAX);
  return [
    "You write shop copy for Lyricalmyrical Books, an independent publisher. You return only the JSON asked for.",
    task === "rewrite" || task === "sectionDraft" ? STUDIO_HONESTY : HONESTY,
    v ? `The shop owner's house style (follow it unless it conflicts with the rules above):\n${v}` : "",
  ].filter(Boolean).join("\n\n");
}

/** Pure: the generateContent request body for one task. */
function buildRequest(task, input, ctx = {}, model = MODELS[0]) {
  const spec = TASKS[task];
  const generationConfig = {
    temperature: 0.7,
    maxOutputTokens: 2048,
    responseMimeType: "application/json",
    responseSchema: spec.schemaFor ? spec.schemaFor(input || {}) : spec.schema,
  };
  // 2.5 models "think" out of the same token budget; these short answers don't need it.
  if (/^gemini-2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  return {
    systemInstruction: { parts: [{ text: systemText(ctx.voice, task) }] },
    contents: [{ role: "user", parts: [{ text: spec.prompt(input || {}, ctx) }] }],
    generationConfig,
  };
}

/** Pure: Gemini's answer → the task's cleaned fields, or a thrown, plain-English error. */
function parseResponse(task, data, ctx = {}) {
  const block = data?.promptFeedback?.blockReason;
  if (block) throw Object.assign(new Error("Google's safety filter declined to write this one. Try again, or change the wording of the description."), { status: 422, friendly: true });
  const cand = Array.isArray(data?.candidates) ? data.candidates[0] : null;
  const text = (Array.isArray(cand?.content?.parts) ? cand.content.parts : [])
    .filter(p => p && !p.thought && typeof p.text === "string").map(p => p.text).join("").trim();
  if (!text) {
    const why = cand?.finishReason === "SAFETY" ? "Google's safety filter declined to write this one." : "Gemini sent back an empty answer.";
    throw Object.assign(new Error(`${why} Try again.`), { status: 502, friendly: true });
  }
  let out;
  try {
    out = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw Object.assign(new Error("Gemini's answer couldn't be read. Try again."), { status: 502, friendly: true });
  }
  const spec = TASKS[task];
  const cleaned = spec.clean(out && typeof out === "object" ? out : {}, ctx);
  if (!spec.ok(cleaned, ctx)) throw Object.assign(new Error("Gemini's answer was incomplete. Try again."), { status: 502, friendly: true });
  return cleaned;
}

/** Plain-English reason Google refused, for the editor's toast and the Settings card. */
function aiErrorMessage(status, gStatus, message) {
  const m = String(message || "");
  if (/API key not valid|API_KEY_INVALID/i.test(m) || (status === 400 && /key/i.test(m))) return "Google says this AI key isn't valid. Copy it again from aistudio.google.com › Get API key, then save it in Settings › General › AI writing assistant.";
  if (status === 403 || gStatus === "PERMISSION_DENIED") return "Google refused the AI key. Make sure it was created in Google AI Studio (aistudio.google.com) and that the Generative Language API is enabled for its project.";
  if (status === 429 || gStatus === "RESOURCE_EXHAUSTED") return "The free Google AI allowance is used up for now (free keys allow about 10 requests a minute and a few hundred a day). Wait a minute and try again.";
  if (status === 400 && /location|region|not supported/i.test(m)) return "Google's free AI tier isn't available from the shop server's region. Try again later, or turn on billing for the key in Google AI Studio.";
  if (status >= 500 || gStatus === "UNAVAILABLE") return "Google's AI service is busy right now. Try again in a minute.";
  return `Google didn't accept the request (${m || `status ${status}`}).`;
}

async function callGemini({ apiKey, model, body, fetchImpl }) {
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(`${API_ROOT}${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      ...(ctrl ? { signal: ctrl.signal } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error?.message || `Google answered ${res.status}`);
      err.status = res.status;
      err.googleStatus = data?.error?.status || "";
      throw err;
    }
    return data;
  } catch (err) {
    if (err?.name === "AbortError") throw Object.assign(new Error("Google's AI took too long to answer. Try again."), { status: 504, friendly: true });
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** One task through the first model Google still serves. */
async function generate({ apiKey, task, input, ctx = {}, models = MODELS, fetchImpl = fetch }) {
  let lastErr = null;
  for (const model of models) {
    try {
      const data = await callGemini({ apiKey, model, body: buildRequest(task, input, ctx, model), fetchImpl });
      return { ...parseResponse(task, data, ctx), model };
    } catch (err) {
      lastErr = err;
      if (err?.status === 404 || err?.googleStatus === "NOT_FOUND") continue;
      break;
    }
  }
  if (lastErr?.friendly) throw lastErr;
  const err = new Error(lastErr?.status === 404 ? "None of the Gemini models the shop knows are available to this key. Check the key in Google AI Studio." : aiErrorMessage(lastErr?.status || 0, lastErr?.googleStatus, lastErr?.message));
  err.status = lastErr?.status === 429 ? 429 : 502;
  throw err;
}

/**
 * The admin `aiWrite` action. `op: "check"` tries the saved key with a tiny request; otherwise `task` is
 * one of TASKS and `input` its facts. Deps keep it testable: readSettings → { apiKey, voice }, allow → rate limit.
 */
async function handleAiWrite(body, { readSettings, allow, fetchImpl = fetch, siteName = "" }) {
  const settings = await readSettings();
  const apiKey = String(settings?.apiKey || "").trim();
  if (!apiKey || aiKeyProblem(apiKey)) {
    return { status: 412, body: { error: "Add your free Google AI key first: Settings › General › AI writing assistant.", needsKey: true } };
  }
  if (!(await allow())) return { status: 429, body: { error: "That's a lot of AI requests in a short time. Wait a few minutes and try again." } };
  const ctx = { voice: settings.voice, siteName: clip(body?.siteName, 80) || siteName, titleSuffix: Math.max(0, Math.min(40, Math.floor(Number(body?.titleSuffix)) || 0)) };
  if (body?.op === "check") {
    try {
      await generate({ apiKey, task: "pageSeo", input: { title: "About the press", text: "We are a small press publishing poetry and artists' books." }, ctx, fetchImpl });
      return { status: 200, body: { ok: true } };
    } catch (err) {
      return { status: 200, body: { ok: false, error: err.message } };
    }
  }
  const task = body?.task;
  if (!Object.prototype.hasOwnProperty.call(TASKS, task)) return { status: 400, body: { error: "Unknown AI task." } };
  const input = body?.input && typeof body.input === "object" && !Array.isArray(body.input) ? body.input : {};
  if (task === "sectionDraft" && !draftSpec(input.type)) return { status: 400, body: { error: "That section can't be drafted with AI." } };
  const raw = task === "pageSeo" || task === "rewrite" || task === "sectionDraft";
  if (!TASKS[task].needs(raw ? input : bookFacts(input))) {
    const why = { pageSeo: "Write the page title or some text first.", rewrite: "There's no text to rewrite yet.", sectionDraft: "Say what the section should be about first." };
    return { status: 400, body: { error: why[task] || "Give the book a title first." } };
  }
  try {
    const result = await generate({ apiKey, task, input, ctx: { ...ctx, input }, fetchImpl });
    return { status: 200, body: { ok: true, result } };
  } catch (err) {
    return { status: err.status === 429 ? 429 : 502, body: { error: err.message } };
  }
}

module.exports = { MODELS, TASKS, DRAFT_TYPES, REWRITE_HOW, tokensOf, sanitizeHtml, aiKeyProblem, bookFacts, buildRequest, parseResponse, aiErrorMessage, generate, handleAiWrite, fitWords, plainText };
