// Claude for the stockroom (the inventory app, a separate Firebase project). The stockroom never holds the Claude key:
// it sends its request here with the owner's stockroom sign-in, and this answers with Claude's reply. Same key, same
// monthly limit, same meter and same out-of-credits pause as the website's AI writing assistant (functions/aiClaude.js),
// so Claude is only ever asked while there are credits and the month's limit isn't reached.
// docs/INVENTORY_LINK.md › Claude for the stockroom; the stockroom side is lyrical-inventory src/lib/claude-chat.js.
const { callClaude, claudeCap, claudeModelFor, claudeRestReason, restError } = require("./aiClaude");

/** Where the stockroom runs (GitHub Pages) and its dev server. Kept apart from ALLOWED_ORIGINS on purpose. */
const STOCKROOM_ORIGINS = ["https://lyricalmyricalbooks.github.io", "http://localhost:5173", "http://127.0.0.1:5173"];
const MAX_TOKENS = 8192;
const MAX_MESSAGES = 80;
const MAX_TOOLS = 40;
const MAX_SYSTEM = 100000;
// Receipt photos arrive as base64; 10 MB of request is a few large photos.
const MAX_BODY_CHARS = 10 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const NEEDS_KEY = "Claude isn't set up yet. Add a Claude key on the website: Settings › General › AI writing assistant.";

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const fail = error => ({ ok: false, error });

/** Pure: one content block the stockroom may send. Server tools and anything else are refused. */
function blockProblem(b) {
  if (!isObj(b)) return "a message part is not an object";
  switch (b.type) {
    case "text": return typeof b.text === "string" ? "" : "text without words";
    case "image": return b.source?.type === "base64" && IMAGE_TYPES.includes(b.source.media_type) && typeof b.source.data === "string" ? "" : "a photo must be a JPEG, PNG, WebP or GIF";
    case "document": return b.source?.type === "base64" && b.source.media_type === "application/pdf" && typeof b.source.data === "string" ? "" : "a document must be a PDF";
    case "tool_use": return typeof b.id === "string" && typeof b.name === "string" && isObj(b.input) ? "" : "a tool call is incomplete";
    case "tool_result": {
      if (typeof b.tool_use_id !== "string") return "a tool answer has no id";
      if (typeof b.content === "string" || b.content === undefined) return "";
      return Array.isArray(b.content) && b.content.every(c => c?.type === "text" && typeof c.text === "string") ? "" : "a tool answer must be words";
    }
    default: return `"${String(b.type).slice(0, 30)}" parts aren't allowed`;
  }
}

/**
 * Pure: the stockroom's request → exactly what goes to Claude (only these fields; the model comes from the owner's
 * Quick / Best writing choice, never from the request). { ok, request } or { ok: false, error }.
 */
function cleanStockroomRequest(body, model) {
  if (!isObj(body)) return fail("The request was empty.");
  if (JSON.stringify(body).length > MAX_BODY_CHARS) return fail("That's too much to send at once. Try fewer or smaller photos.");
  const { system, messages, tools, tool_choice: toolChoice, format } = body;
  if (system !== undefined && (typeof system !== "string" || system.length > MAX_SYSTEM)) return fail("The instructions are too long.");
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) return fail("The conversation is empty or too long. Start a new one.");
  for (const m of messages) {
    if (!isObj(m) || !["user", "assistant"].includes(m.role)) return fail("A message has no sender.");
    if (typeof m.content === "string") continue;
    if (!Array.isArray(m.content) || !m.content.length) return fail("A message is empty.");
    for (const b of m.content) { const p = blockProblem(b); if (p) return fail(`Claude can't take this: ${p}.`); }
  }
  if (messages[0].role !== "user") return fail("The conversation must start with a question.");
  const request = { model, max_tokens: Math.min(MAX_TOKENS, Math.max(1, Math.floor(Number(body.max_tokens)) || 4096)), messages: messages.map(m => ({ role: m.role, content: m.content })) };
  if (system) request.system = system;
  if (tools !== undefined) {
    if (!Array.isArray(tools) || tools.length > MAX_TOOLS) return fail("Too many tools.");
    for (const t of tools) {
      // Only the stockroom's own tools (no `type`): Claude's server tools (web search and the rest) cost extra.
      if (!isObj(t) || "type" in t || !/^[A-Za-z0-9_-]{1,64}$/.test(String(t.name || "")) || !isObj(t.input_schema)) return fail("A tool is set up wrongly.");
    }
    if (tools.length) request.tools = tools.map(t => ({ name: t.name, description: String(t.description || "").slice(0, 4000), input_schema: t.input_schema }));
  }
  if (toolChoice !== undefined && request.tools) {
    const ok = isObj(toolChoice) && (["auto", "any", "none"].includes(toolChoice.type) || (toolChoice.type === "tool" && typeof toolChoice.name === "string"));
    if (!ok) return fail("The tool choice is set up wrongly.");
    request.tool_choice = toolChoice.type === "tool" ? { type: "tool", name: toolChoice.name } : { type: toolChoice.type };
  }
  request.output_config = { effort: "low" };
  if (format !== undefined) {
    if (!isObj(format) || format.type !== "object") return fail("The answer shape is set up wrongly.");
    request.output_config.format = { type: "json_schema", schema: format };
  }
  return { ok: true, request };
}

/** Pure: what the stockroom shows about Claude (configured, why it's paused, this month's spend). */
function meterFor(settings, usage, ms = Date.now()) {
  const cap = claudeCap(settings.claudeCap);
  const month = usage?.months?.[new Date(ms).toISOString().slice(0, 7)] || {};
  return {
    configured: !!settings.claudeKey,
    choice: settings.claudeModel === "best" ? "best" : "quick",
    capDollars: cap,
    spentMicros: Number(month.costMicros) || 0,
    requests: Number(month.requests) || 0,
    rest: claudeRestReason(usage, cap, ms),
  };
}

/**
 * The stockroom's request, after sign-in was checked. `op`: "status" (meter only), "check" (Try again: clears the
 * pause, then one tiny request) or "message" (one Claude turn). Nothing is sent to Anthropic while Claude rests.
 * deps: { readSettings() → adminSecrets/ai, usage: claudeUsageStore, fetchImpl, now }.
 */
async function handleStockroomClaude(body, { readSettings, usage, fetchImpl, now = () => Date.now() }) {
  const op = ["status", "check", "message"].includes(body?.op) ? body.op : "message";
  const settings = await readSettings();
  if (!settings.claudeKey) return { status: op === "status" ? 200 : 412, body: op === "status" ? { meter: meterFor(settings, {}, now()) } : { error: NEEDS_KEY, needsKey: true } };
  if (op === "check") await usage.resume();
  const used = await usage.read();
  const meter = meterFor(settings, used, now());
  if (op === "status") return { status: 200, body: { meter } };
  if (meter.rest) {
    const err = restError(meter.rest);
    return { status: 402, body: { error: err.message, rest: meter.rest, meter } };
  }
  const model = claudeModelFor(settings.claudeModel);
  const cleaned = op === "check"
    ? { ok: true, request: { model, max_tokens: 16, messages: [{ role: "user", content: "Reply with the word OK." }] } }
    : cleanStockroomRequest(body, model);
  if (!cleaned.ok) return { status: 400, body: { error: cleaned.error } };
  try {
    const message = await callClaude({ apiKey: settings.claudeKey, body: cleaned.request, fetchImpl, onCost: usage.record });
    const after = meterFor(settings, await usage.read(), now());
    if (op === "check") return { status: 200, body: { ok: true, meter: after } };
    return { status: 200, body: { message: { content: message.content, stop_reason: message.stop_reason, model: message.model }, meter: after } };
  } catch (err) {
    if (err?.pause) await usage.pause(err.pause);
    if (!err?.friendly && !err?.pause) console.warn(`stockroomClaude: ${model} answered ${err?.upstreamStatus || err?.status || "?"}: ${String(err?.message || "").slice(0, 300)}`);
    const status = Number(err?.status) || 502;
    return { status: status >= 400 && status < 600 ? status : 502, body: { error: err?.upstreamStatus || err?.friendly ? err.message : "Claude couldn't answer just now. Try again in a minute.", rest: err?.pause || undefined, meter: meterFor(settings, await usage.read(), now()) } };
  }
}

module.exports = { STOCKROOM_ORIGINS, MAX_TOKENS, cleanStockroomRequest, meterFor, handleStockroomClaude, NEEDS_KEY };
