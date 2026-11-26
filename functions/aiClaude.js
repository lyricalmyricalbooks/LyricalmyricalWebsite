// Claude (Anthropic) for the AI writing assistant: the transport, prices, the owner's monthly limit and the
// out-of-credits pause. Anthropic API keys are prepaid: when the credits run out Anthropic refuses the request and
// charges nothing, so the shop is never billed for use. On top of that the shop stops asking Claude once the
// month's spend reaches the owner's limit, or after Anthropic says the credits are gone, until the owner presses
// Try again (Settings › General › AI writing assistant). The key lives in admin-only adminSecrets/ai.
const Anthropic = require("@anthropic-ai/sdk");

/** The owner's two choices: Quick (the default, cheapest) and Best writing. */
const CLAUDE_MODELS = { quick: "claude-haiku-5-5", best: "claude-sonnet-5-5" };
// US dollars per million tokens (Anthropic's list prices, November 2026). Haiku's rate is for prompts under 100K
// tokens, which every shop request is (a description, a page or one photo).
const PRICES = {
  "claude-haiku-5-5": { input: 0.10, output: 0.50 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
};
/** Monthly limits the owner can pick, in US dollars (0 = no limit of the shop's own; credits still cap it). */
const CLAUDE_CAPS = [1, 2, 5, 10, 20, 50, 0];
const DEFAULT_CAP = 5;
const CLAUDE_TIMEOUT_MS = 25000;

/** Anthropic keys start "sk-ant-" (console.anthropic.com › API keys). */
function claudeKeyProblem(value) {
  const v = String(value || "").trim();
  if (!v) return "Enter a Claude API key.";
  if (/^sk-or-/.test(v)) return "That's an OpenRouter key. Paste it in the OpenRouter box instead.";
  if (!/^sk-ant-[A-Za-z0-9_-]{20,300}$/.test(v)) return "That doesn't look like a Claude key (it starts with sk-ant- and comes from console.anthropic.com).";
  return "";
}

const claudeModelFor = choice => CLAUDE_MODELS[choice === "best" ? "best" : "quick"];

/** The owner's monthly limit in dollars: one of CLAUDE_CAPS, else the default. */
function claudeCap(value) {
  const n = Number(value);
  return value !== undefined && value !== null && value !== "" && CLAUDE_CAPS.includes(n) ? n : DEFAULT_CAP;
}

/** Pure: what one answer cost, in millionths of a dollar (rounded up, so the meter never under-counts). */
function costMicros(model, usage) {
  const p = PRICES[model] || PRICES[CLAUDE_MODELS.best];
  const u = usage || {};
  const input = (Number(u.input_tokens) || 0) + (Number(u.cache_creation_input_tokens) || 0) * 1.25 + (Number(u.cache_read_input_tokens) || 0) * 0.1;
  const output = Number(u.output_tokens) || 0;
  return Math.ceil(input * p.input + output * p.output);
}

/** Pure: the calendar month the meter counts in ("2026-11"), UTC like Anthropic's own billing. */
const monthKey = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 7);

/** Pure: why Claude is resting right now, or "" when it may be asked. `usage` is adminSecrets/claudeUsage. */
function claudeRestReason(usage, capDollars, ms = Date.now()) {
  if (usage?.paused?.reason) return usage.paused.reason === "limit" ? "limit" : "credits";
  const spent = Number(usage?.months?.[monthKey(ms)]?.costMicros) || 0;
  if (capDollars > 0 && spent >= capDollars * 1e6) return "cap";
  return "";
}

const REST_MESSAGES = {
  credits: "Claude is out of credits, so it's paused. Add credits at console.anthropic.com › Billing, then press Try again in Settings › General › AI writing assistant.",
  limit: "Claude has reached the monthly spending limit set in your Anthropic account, so it's paused. Raise it at console.anthropic.com › Limits, then press Try again in Settings › General › AI writing assistant.",
  cap: "Claude has used this month's limit you set in Settings › General › AI writing assistant, so it's paused until next month. Raise the limit there to keep going.",
};
const restError = reason => Object.assign(new Error(REST_MESSAGES[reason] || REST_MESSAGES.credits), { status: 402, upstreamStatus: 402, friendly: true, claudeRest: reason });

/** Pure: Anthropic's refusal → a plain-English error. `pause` = stop asking Claude until the owner presses Try again. */
function claudeError(status, type, message, model = "") {
  const m = String(message || "");
  const err = msg => Object.assign(new Error(msg), { status: status === 429 ? 429 : 502, upstreamStatus: Number(status) || 0 });
  if (status === 402 || type === "billing_error" || /credit balance/i.test(m)) return Object.assign(err(REST_MESSAGES.credits), { upstreamStatus: 402, pause: "credits" });
  if (/usage limit|spend(ing)? limit/i.test(m)) return Object.assign(err(REST_MESSAGES.limit), { upstreamStatus: 402, pause: "limit" });
  if (status === 401 || type === "authentication_error") return err("Anthropic says this Claude key isn't valid. Create a new one at console.anthropic.com › API keys, then save it in Settings › General › AI writing assistant.");
  if (status === 403 || type === "permission_error") return err("Anthropic refused this Claude key. Check that it is active at console.anthropic.com › API keys.");
  if (status === 404) return err(`Anthropic doesn't offer ${model || "this Claude model"} to this key. Try the other choice (Quick or Best writing).`);
  if (status === 408 || status === 504) return err("Claude took too long to answer. Try again.");
  if (status === 429) return err("Claude is limiting requests right now. Wait a minute and try again.");
  if (status >= 500) return err("Claude is busy right now. Try again in a minute.");
  return err(`Anthropic didn't accept the request (${m || `status ${status}`}).`);
}

/** Pure: a Claude answer in Gemini's shape, so the writer's parseResponse reads it. */
function fromClaude(message) {
  const text = (Array.isArray(message?.content) ? message.content : []).filter(b => b?.type === "text").map(b => b.text).join("");
  const why = message?.stop_reason;
  return { candidates: [{ content: { parts: [{ text }] }, finishReason: why === "max_tokens" ? "MAX_TOKENS" : why === "refusal" ? "SAFETY" : "STOP" }] };
}

/**
 * One request to Claude with the official SDK. `onCost(micros)` is called for every answer Anthropic returns
 * (charged even if the words then can't be used). Throws claudeError on a refusal.
 */
async function callClaude({ apiKey, body, fetchImpl, onCost = async () => {} }) {
  // The base address is fixed so nothing in the server's environment can send the key elsewhere.
  const client = new Anthropic({ apiKey, baseURL: "https://api.anthropic.com", maxRetries: 0, timeout: CLAUDE_TIMEOUT_MS, ...(fetchImpl && fetchImpl !== globalThis.fetch ? { fetch: fetchImpl } : {}) });
  let message;
  try {
    message = await client.messages.create(body);
  } catch (e) {
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw Object.assign(new Error("Claude took too long to answer. Try again."), { status: 504, upstreamStatus: 504, friendly: true, timedOut: true });
    if (e instanceof Anthropic.APIError && e.status) {
      const type = e.type || e.error?.error?.type || "";
      throw claudeError(e.status, type, e.error?.error?.message || e.message, body.model);
    }
    if (e instanceof Anthropic.APIConnectionError) throw Object.assign(new Error("Couldn't reach Claude. Try again in a minute."), { status: 502, upstreamStatus: 503 });
    throw e;
  }
  await onCost(costMicros(message.model || body.model, message.usage));
  return message;
}

module.exports = { CLAUDE_MODELS, CLAUDE_CAPS, DEFAULT_CAP, PRICES, claudeKeyProblem, claudeModelFor, claudeCap, costMicros, monthKey, claudeRestReason, restError, claudeError, fromClaude, callClaude };
