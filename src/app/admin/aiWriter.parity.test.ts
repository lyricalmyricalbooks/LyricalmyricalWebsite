import { createRequire } from "module";
import { describe, expect, it } from "vitest";
import { CLAUDE_CAPS, CLAUDE_CHOICES, DEFAULT_CLAUDE_CAP, DEFAULT_OPENROUTER_MODEL, aiKeyProblem, claudeKeyProblem, claudeMeter, openRouterKeyProblem, openRouterModelProblem, usd } from "./aiWriter";

const server = createRequire(import.meta.url)("../../../functions/aiWriter.js");
const claude = createRequire(import.meta.url)("../../../functions/aiClaude.js");

// The Settings card checks keys before saving; the server checks them again before use. Same answers.
describe("AI key rules match the server", () => {
  const keys = ["AIza" + "x".repeat(35), "sk-or-v1-" + "a".repeat(64), "sk-or-short", "not a key", "sk-proj-" + "b".repeat(40)];
  const models = ["google/gemini-2.5-flash", "~google/gemini-flash-latest", "~bad",  "meta-llama/llama-3.3-70b-instruct:free", "openrouter/auto", "gpt 4", "x", "https://evil/x", "a/" + "b".repeat(130)];

  it("agrees on Google and OpenRouter keys", () => {
    for (const k of keys) {
      expect(aiKeyProblem(k) === "").toBe(server.aiKeyProblem(k) === "");
      if (k.startsWith("sk-or-")) expect(aiKeyProblem(k)).toBe(server.aiKeyProblem(k));
      expect(openRouterKeyProblem(k)).toBe(server.openRouterKeyProblem(k));
    }
  });

  it("agrees on model names and the default model", () => {
    for (const m of models) expect(openRouterModelProblem(m)).toBe(server.openRouterModelProblem(m));
    expect(DEFAULT_OPENROUTER_MODEL).toBe(server.OPENROUTER_MODELS[0]);
  });
});

describe("Claude rules match the server", () => {
  it("agrees on Claude keys", () => {
    for (const k of ["sk-ant-api03-" + "a".repeat(80), "sk-ant-short", "sk-or-v1-" + "a".repeat(64), "AIza" + "x".repeat(35), "not a key", "  "]) {
      expect(claudeKeyProblem(k) === "").toBe(!k.trim() || claude.claudeKeyProblem(k) === "");
      if (k.trim() && claudeKeyProblem(k)) expect(claudeKeyProblem(k)).toBe(claude.claudeKeyProblem(k));
    }
  });

  it("agrees on the two choices and the monthly limits", () => {
    expect(CLAUDE_CHOICES).toEqual(claude.CLAUDE_MODELS);
    expect(CLAUDE_CAPS).toEqual(claude.CLAUDE_CAPS);
    expect(DEFAULT_CLAUDE_CAP).toBe(claude.DEFAULT_CAP);
  });

  it("agrees on when Claude is paused", () => {
    const ms = Date.UTC(2026, 10, 26);
    const cases = [
      [null, 5],
      [{ months: { "2026-11": { costMicros: 4_999_999, requests: 9 } } }, 5],
      [{ months: { "2026-11": { costMicros: 5_000_000 } } }, 5],
      [{ months: { "2026-11": { costMicros: 9e9 } } }, 0],
      [{ months: { "2026-10": { costMicros: 9e9 } } }, 1],
      [{ paused: { reason: "credits" } }, 5],
      [{ paused: { reason: "limit" } }, 0],
    ] as const;
    for (const [usage, cap] of cases) expect(claudeMeter(usage, cap, ms).rest).toBe(claude.claudeRestReason(usage, cap, ms));
    expect(claudeMeter({ months: { "2026-11": { costMicros: 1200, requests: 3 } } }, 5, ms)).toEqual({ spentMicros: 1200, drafts: 3, rest: "" });
  });

  it("shows dollars plainly", () => {
    expect(usd(0)).toBe("$0.00");
    expect(usd(200)).toBe("under 1¢");
    expect(usd(1_234_567)).toBe("$1.23");
  });
});
