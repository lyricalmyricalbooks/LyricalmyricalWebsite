import { createRequire } from "module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { monthKey } = require("./aiClaude");
const { cleanStockroomRequest, handleStockroomClaude, meterFor, STOCKROOM_ORIGINS } = require("./stockroomClaude");

const KEY = "sk-ant-api03-" + "a".repeat(80);
const NOW = Date.parse("2026-11-26T22:00:00Z");
const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const reply = (content, { model = "claude-haiku-5-5", stop = "end_turn", usage = { input_tokens: 2000, output_tokens: 300 } } = {}) =>
  json(200, { id: "msg_1", type: "message", role: "assistant", model, content, stop_reason: stop, usage });
const apiError = (status, type, msg) => json(status, { type: "error", error: { type, message: msg } });

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
const run = (body, settings, usage, fetchImpl = vi.fn()) => handleStockroomClaude(body, { readSettings: async () => settings, usage, fetchImpl, now: () => NOW });
const ask = { op: "message", system: "You answer questions about a small press's sales.", messages: [{ role: "user", content: "What sold best this month?" }] };

describe("Claude for the stockroom: what may be sent", () => {
  it("passes only known fields, with the owner's model", () => {
    const tools = [{ name: "sales_by_book", description: "Sales per book", input_schema: { type: "object", properties: {} }, cache_control: { type: "ephemeral" } }];
    const out = cleanStockroomRequest({ ...ask, tools, tool_choice: { type: "auto" }, max_tokens: 99999, model: "claude-opus-5-5", temperature: 1 }, "claude-haiku-5-5");
    expect(out.ok).toBe(true);
    expect(out.request.model).toBe("claude-haiku-5-5");
    expect(out.request.max_tokens).toBe(8192);
    expect(out.request).not.toHaveProperty("temperature");
    expect(out.request.tools[0]).toEqual({ name: "sales_by_book", description: "Sales per book", input_schema: { type: "object", properties: {} } });
    expect(out.request.tool_choice).toEqual({ type: "auto" });
  });

  it("refuses Claude's paid server tools and unknown parts", () => {
    expect(cleanStockroomRequest({ ...ask, tools: [{ type: "web_search_20260209", name: "web_search" }] }, "m").ok).toBe(false);
    expect(cleanStockroomRequest({ messages: [{ role: "user", content: [{ type: "server_tool_use", id: "x" }] }] }, "m").ok).toBe(false);
    expect(cleanStockroomRequest({ messages: [{ role: "assistant", content: "hi" }] }, "m").ok).toBe(false);
    expect(cleanStockroomRequest({ messages: [] }, "m").ok).toBe(false);
    expect(cleanStockroomRequest({ messages: [{ role: "user", content: [{ type: "image", source: { type: "url", url: "https://x" } }] }] }, "m").ok).toBe(false);
  });

  it("accepts a receipt photo, a tool loop and an answer shape", () => {
    const photo = { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } };
    const out = cleanStockroomRequest({
      messages: [
        { role: "user", content: [photo, { type: "text", text: "Read this receipt." }] },
        { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "lookup", input: {} }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "nothing" }] },
      ],
      tools: [{ name: "lookup", input_schema: { type: "object" } }],
      format: { type: "object", properties: { total: { type: "number" } }, required: ["total"], additionalProperties: false },
    }, "claude-haiku-5-5");
    expect(out.ok).toBe(true);
    expect(out.request.output_config.format.type).toBe("json_schema");
  });

  it("only lets the stockroom's own address in", () => {
    expect(STOCKROOM_ORIGINS).toContain("https://lyricalmyricalbooks.github.io");
    expect(STOCKROOM_ORIGINS.every(o => !o.includes("web.app"))).toBe(true);
  });
});

describe("Claude for the stockroom: credits only", () => {
  it("answers and adds the cost to the shared meter", async () => {
    const usage = meter();
    const fetchImpl = vi.fn(async () => reply([{ type: "text", text: "Salt sold 14 copies." }]));
    const { status, body } = await run(ask, { claudeKey: KEY }, usage, fetchImpl);
    expect(status).toBe(200);
    expect(body.message.content[0].text).toMatch(/Salt/);
    expect(usage.record).toHaveBeenCalledWith(350);
    expect(body.meter).toMatchObject({ configured: true, spentMicros: 350, requests: 1, capDollars: 5, rest: "" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://api.anthropic.com/v1/messages");
    expect(JSON.parse(init.body).model).toBe("claude-haiku-5-5");
  });

  it("pauses when the credits run out and then asks nothing more", async () => {
    const usage = meter();
    const fetchImpl = vi.fn(async () => apiError(400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API."));
    const first = await run(ask, { claudeKey: KEY }, usage, fetchImpl);
    expect(first.status).toBe(502);
    expect(first.body.rest).toBe("credits");
    expect(usage.pause).toHaveBeenCalledWith("credits");
    const second = await run(ask, { claudeKey: KEY }, usage, fetchImpl);
    expect(second.status).toBe(402);
    expect(second.body.error).toMatch(/out of credits/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("stops at the monthly limit the owner set on the website", async () => {
    const usage = meter({ months: { [monthKey(NOW)]: { costMicros: 2_000_000, requests: 50 } } });
    const fetchImpl = vi.fn();
    const { status, body } = await run(ask, { claudeKey: KEY, claudeCap: 2 }, usage, fetchImpl);
    expect(status).toBe(402);
    expect(body.rest).toBe("cap");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("Try again clears the pause and checks with one tiny request", async () => {
    const usage = meter({ paused: { reason: "credits" } });
    const fetchImpl = vi.fn(async () => reply([{ type: "text", text: "OK" }], { model: "claude-sonnet-5-5", usage: { input_tokens: 12, output_tokens: 2 } }));
    const { status, body } = await run({ op: "check" }, { claudeKey: KEY, claudeModel: "best" }, usage, fetchImpl);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(usage.resume).toHaveBeenCalled();
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ model: "claude-sonnet-5-5", max_tokens: 16 });
  });

  it("says where to add a key when none is saved", async () => {
    const usage = meter();
    const out = await run(ask, {}, usage);
    expect(out.status).toBe(412);
    expect(out.body.needsKey).toBe(true);
    const status = await run({ op: "status" }, {}, usage);
    expect(status.body.meter.configured).toBe(false);
  });

  it("reports the meter without asking Claude", async () => {
    const usage = meter({ months: { [monthKey(NOW)]: { costMicros: 1234, requests: 3 } } });
    const fetchImpl = vi.fn();
    const { body } = await run({ op: "status" }, { claudeKey: KEY, claudeCap: 10 }, usage, fetchImpl);
    expect(body.meter).toEqual(meterFor({ claudeKey: KEY, claudeCap: 10 }, usage.state, NOW));
    expect(body.meter.spentMicros).toBe(1234);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
