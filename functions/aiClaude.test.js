import { createRequire } from "module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { claudeKeyProblem, claudeModelFor, claudeCap, costMicros, monthKey, claudeRestReason, claudeError, fromClaude } = require("./aiClaude");
const { buildClaudeRequest, pickProvider, backupProvider, handleAiWrite, resetProviderRest, TASKS } = require("./aiWriter");

const CLAUDE_KEY = "sk-ant-api03-" + "a".repeat(80);
const OR_KEY = "sk-or-v1-" + "a".repeat(64);
const GEMINI_KEY = "AIza" + "x".repeat(35);
const NOW = Date.parse("2026-11-26T22:00:00Z");
const seo = { metaTitle: "Salt by Ana", metaDescription: "A book of poems about the sea, printed by hand in Toronto." };

const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const message = (obj, { model = "claude-haiku-5-5", stop = "end_turn", usage = { input_tokens: 1000, output_tokens: 200 } } = {}) =>
  json(200, { id: "msg_1", type: "message", role: "assistant", model, content: [{ type: "text", text: JSON.stringify(obj) }], stop_reason: stop, usage });
const apiError = (status, type, msg) => json(status, { type: "error", error: { type, message: msg } });
const chat = obj => json(200, { choices: [{ message: { content: JSON.stringify(obj) }, finish_reason: "stop" }] });

/** A fake meter (adminSecrets/claudeUsage). */
function meter(start = {}) {
  const state = { months: {}, ...start };
  return {
    state,
    read: vi.fn(async () => state),
    record: vi.fn(async micros => { const m = (state.months[monthKey(NOW)] ||= { costMicros: 0, requests: 0 }); m.costMicros += micros; m.requests += 1; }),
    pause: vi.fn(async reason => { state.paused = { reason }; }),
    resume: vi.fn(async () => { delete state.paused; }),
  };
}
const deps = (settings, over = {}) => ({ readSettings: async () => ({ voice: "", ...settings }), allow: async () => true, now: () => NOW, fetchImpl: vi.fn(), ...over });

describe("Claude for the AI writing assistant", () => {
  it("accepts Anthropic keys and refuses others", () => {
    expect(claudeKeyProblem(CLAUDE_KEY)).toBe("");
    expect(claudeKeyProblem("")).toMatch(/Enter/);
    expect(claudeKeyProblem(OR_KEY)).toMatch(/OpenRouter/);
    expect(claudeKeyProblem(GEMINI_KEY)).toMatch(/sk-ant-/);
  });

  it("maps the owner's choices to current models and limits", () => {
    expect(claudeModelFor("best")).toBe("claude-sonnet-5-5");
    expect(claudeModelFor("quick")).toBe("claude-haiku-5-5");
    expect(claudeModelFor(undefined)).toBe("claude-haiku-5-5");
    expect(claudeCap(undefined)).toBe(5);
    expect(claudeCap(20)).toBe(20);
    expect(claudeCap(0)).toBe(0);
    expect(claudeCap(7)).toBe(5);
  });

  it("prices answers in millionths of a dollar, rounding up", () => {
    expect(costMicros("claude-haiku-5-5", { input_tokens: 1000, output_tokens: 200 })).toBe(200);
    expect(costMicros("claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 200 })).toBe(4000);
    expect(costMicros("claude-haiku-5-5", { input_tokens: 1, output_tokens: 0 })).toBe(1);
  });

  it("rests when paused or over the monthly limit", () => {
    expect(claudeRestReason({}, 5, NOW)).toBe("");
    expect(claudeRestReason({ paused: { reason: "credits" } }, 5, NOW)).toBe("credits");
    expect(claudeRestReason({ paused: { reason: "limit" } }, 5, NOW)).toBe("limit");
    expect(claudeRestReason({ months: { "2026-11": { costMicros: 5e6 } } }, 5, NOW)).toBe("cap");
    expect(claudeRestReason({ months: { "2026-10": { costMicros: 9e6 } } }, 5, NOW)).toBe("");
    expect(claudeRestReason({ months: { "2026-11": { costMicros: 9e9 } } }, 0, NOW)).toBe("");
  });

  it("turns Anthropic's refusals into plain words and pauses on no credits", () => {
    expect(claudeError(400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API.").pause).toBe("credits");
    expect(claudeError(402, "billing_error", "").pause).toBe("credits");
    expect(claudeError(400, "invalid_request_error", "You have reached your specified workspace API usage limits.").pause).toBe("limit");
    expect(claudeError(401, "authentication_error", "").message).toMatch(/isn't valid/);
    expect(claudeError(529, "overloaded_error", "").message).toMatch(/busy/);
    expect(claudeError(401, "authentication_error", "").pause).toBeUndefined();
  });

  it("builds a structured request with the honesty rules, house style and photo", () => {
    const body = buildClaudeRequest("photoAlt", { title: "Salt" }, { voice: "British spelling.", image: { mimeType: "image/png", data: "AAAA" } }, "claude-sonnet-5-5");
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.system).toMatch(/Never invent/);
    expect(body.system).toMatch(/British spelling/);
    expect(body.output_config.effort).toBe("low");
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.output_config.format.schema.additionalProperties).toBe(false);
    expect(body.messages[0].content[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } });
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("thinking");
    expect(Object.keys(TASKS)).toContain("photoAlt");
  });

  it("reads refusals and cut-off answers", () => {
    expect(fromClaude({ content: [{ type: "text", text: "{}" }], stop_reason: "max_tokens" }).candidates[0].finishReason).toBe("MAX_TOKENS");
    expect(fromClaude({ content: [], stop_reason: "refusal" }).candidates[0].finishReason).toBe("SAFETY");
  });

  it("picks Claude when chosen, and never uses a paused Claude as a backup", () => {
    const all = { apiKey: GEMINI_KEY, openrouterKey: OR_KEY, claudeKey: CLAUDE_KEY };
    expect(pickProvider({ ...all, provider: "claude" }).name).toBe("claude");
    expect(pickProvider({ claudeKey: CLAUDE_KEY }).name).toBe("claude");
    expect(pickProvider(all).name).toBe("openrouter");
    const gemini = pickProvider({ apiKey: GEMINI_KEY, claudeKey: CLAUDE_KEY, provider: "gemini" });
    expect(backupProvider({ apiKey: GEMINI_KEY, claudeKey: CLAUDE_KEY }, gemini).name).toBe("claude");
    expect(backupProvider({ apiKey: GEMINI_KEY, claudeKey: CLAUDE_KEY }, gemini, { claudeResting: true })).toBeNull();
    const claude = pickProvider({ ...all, provider: "claude" });
    expect(backupProvider({ ...all, claudeBackup: false }, claude)).toBeNull();
  });

  it("writes with Claude and adds the cost to the month's meter", async () => {
    const m = meter();
    const fetchImpl = vi.fn(async () => message(seo));
    const out = await handleAiWrite({ task: "bookSeo", input: { title: "Salt" } }, deps({ claudeKey: CLAUDE_KEY, provider: "claude" }, { fetchImpl, claude: m }));
    expect(out.status).toBe(200);
    expect(out.body.result).toMatchObject({ metaTitle: "Salt by Ana", provider: "claude", model: "claude-haiku-5-5" });
    expect(m.record).toHaveBeenCalledWith(200);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toMatch(/api\.anthropic\.com\/v1\/messages/);
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${CLAUDE_KEY}`);
    expect(JSON.parse(init.body).model).toBe("claude-haiku-5-5");
  });

  it("uses Best writing when chosen", async () => {
    const fetchImpl = vi.fn(async () => message(seo, { model: "claude-sonnet-5-5" }));
    const m = meter();
    await handleAiWrite({ task: "bookSeo", input: { title: "Salt" } }, deps({ claudeKey: CLAUDE_KEY, claudeModel: "best" }, { fetchImpl, claude: m }));
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).model).toBe("claude-sonnet-5-5");
    expect(m.record).toHaveBeenCalledWith(4000);
  });

  it("pauses Claude when the credits run out and stops asking it", async () => {
    resetProviderRest();
    const m = meter();
    const fetchImpl = vi.fn(async () => apiError(400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API."));
    const first = await handleAiWrite({ task: "bookSeo", input: { title: "Salt" } }, deps({ claudeKey: CLAUDE_KEY }, { fetchImpl, claude: m }));
    expect(first.status).toBe(502);
    expect(first.body.error).toMatch(/out of credits/);
    expect(first.body.claudeRest).toBe("credits");
    expect(m.pause).toHaveBeenCalledWith("credits");
    expect(m.record).not.toHaveBeenCalled();

    fetchImpl.mockClear();
    const second = await handleAiWrite({ task: "bookSeo", input: { title: "Salt" } }, deps({ claudeKey: CLAUDE_KEY }, { fetchImpl, claude: m }));
    expect(second.status).toBe(402);
    expect(second.body.claudeRest).toBe("credits");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("lets the other saved AI write while Claude is paused, unless switched off", async () => {
    const m = meter({ paused: { reason: "credits" } });
    const fetchImpl = vi.fn(async url => (String(url).includes("openrouter") ? chat(seo) : message(seo)));
    const out = await handleAiWrite({ task: "bookSeo", input: { title: "Salt" } }, deps({ claudeKey: CLAUDE_KEY, openrouterKey: OR_KEY, provider: "claude" }, { fetchImpl, claude: m }));
    expect(out.status).toBe(200);
    expect(out.body.result).toMatchObject({ provider: "openrouter", fellBack: true, claudeRest: "credits" });
    expect(fetchImpl.mock.calls.every(([url]) => !String(url).includes("anthropic"))).toBe(true);

    fetchImpl.mockClear();
    const off = await handleAiWrite({ task: "bookSeo", input: { title: "Salt" } }, deps({ claudeKey: CLAUDE_KEY, openrouterKey: OR_KEY, provider: "claude", claudeBackup: false }, { fetchImpl, claude: m }));
    expect(off.status).toBe(402);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("stops at the owner's monthly limit", async () => {
    const m = meter({ months: { "2026-11": { costMicros: 2e6, requests: 900 } } });
    const fetchImpl = vi.fn();
    const out = await handleAiWrite({ task: "bookSeo", input: { title: "Salt" } }, deps({ claudeKey: CLAUDE_KEY, claudeCap: 2 }, { fetchImpl, claude: m }));
    expect(out.status).toBe(402);
    expect(out.body.error).toMatch(/this month's limit/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("Check key (Try again) clears a pause first, and pauses again if the credits are still gone", async () => {
    const m = meter({ paused: { reason: "credits" } });
    const ok = await handleAiWrite({ op: "check", provider: "claude" }, deps({ claudeKey: CLAUDE_KEY }, { fetchImpl: vi.fn(async () => message({ seoTitle: "About", metaDescription: "A small press." })), claude: m }));
    expect(m.resume).toHaveBeenCalled();
    expect(ok.body).toMatchObject({ ok: true, provider: "claude", model: "claude-haiku-5-5" });

    const m2 = meter({ paused: { reason: "credits" } });
    const still = await handleAiWrite({ op: "check", provider: "claude" }, deps({ claudeKey: CLAUDE_KEY }, { fetchImpl: vi.fn(async () => apiError(400, "invalid_request_error", "Your credit balance is too low.")), claude: m2 }));
    expect(still.body).toMatchObject({ ok: false, rest: "credits" });
    expect(m2.state.paused).toEqual({ reason: "credits" });
  });
});
