import { createRequire } from "module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { cleanPropertyId, propertyIdProblem, cleanRange, buildBatches, shapeReport, realtimePagesOf, realtimeMinutesOf, gaErrorMessage, handleGa4Report } = require("./googleAnalytics");
const { resetConfirmed, handleTrafficReset } = require("./trafficReset");

const RANGE = { startDate: "2026-10-01", endDate: "2026-10-13", prevStartDate: "2026-09-18", prevEndDate: "2026-09-30" };
const reply = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const report = (dims, mets, rows) => ({
  dimensionHeaders: dims.map(name => ({ name })), metricHeaders: mets.map(name => ({ name })),
  rows: rows.map(r => ({ dimensionValues: r.d.map(value => ({ value })), metricValues: r.m.map(value => ({ value: String(value) })) })),
});

describe("GA4 property id", () => {
  it("accepts the number, properties/…, or a pasted Analytics URL", () => {
    expect(cleanPropertyId("123456789")).toBe("123456789");
    expect(cleanPropertyId(" properties/123456789 ")).toBe("123456789");
    expect(cleanPropertyId("https://analytics.google.com/analytics/web/#/p123456789/reports/intelligenthome")).toBe("123456789");
  });
  it("refuses a measurement id or junk, and allows empty", () => {
    expect(cleanPropertyId("G-ABC123XYZ")).toBe("");
    expect(propertyIdProblem("G-ABC123XYZ")).toMatch(/property ID/);
    expect(propertyIdProblem("")).toBe("");
    expect(cleanPropertyId("12345678901234567")).toBe("");
  });
});

describe("GA4 report requests", () => {
  it("checks both date windows", () => {
    expect(cleanRange(RANGE)).toEqual(RANGE);
    expect(cleanRange({ ...RANGE, startDate: "2026-10-14" })).toBeNull();
    expect(cleanRange({ ...RANGE, prevStartDate: "nope" })).toBeNull();
    expect(cleanRange({ ...RANGE, startDate: "2020-01-01" })).toBeNull();
  });
  it("asks for at most five reports per batch, each with a key", () => {
    const batches = buildBatches(RANGE);
    batches.forEach(b => expect(b.length).toBeLessThanOrEqual(5));
    expect(batches.flat().map(r => r.key)).toEqual(expect.arrayContaining(["totals", "byDate", "channels", "landing", "events"]));
  });
  it("shapes the answers per window", () => {
    const batches = buildBatches(RANGE);
    const responses = [
      { reports: [
        report(["dateRange"], ["activeUsers", "sessions"], [{ d: ["current"], m: [40, 55] }, { d: ["previous"], m: [20, 30] }]),
        report(["date", "dateRange"], ["activeUsers", "sessions", "screenPageViews"], [{ d: ["20261002", "current"], m: [3, 4, 9] }, { d: ["20261001", "current"], m: [1, 1, 2] }]),
        report(["sessionDefaultChannelGroup"], ["sessions", "activeUsers", "engagementRate"], [{ d: ["Organic Search"], m: [12, 10, 0.6] }]),
      ] },
      { reports: [undefined, undefined, undefined, report(["eventName", "dateRange"], ["eventCount"], [{ d: ["purchase", "current"], m: [2] }, { d: ["add_to_cart", "previous"], m: [5] }])] },
    ];
    const shaped = shapeReport(batches.map((requests, i) => ({ requests, response: responses[i] })), report([], ["activeUsers"], [{ d: [], m: [3] }]));
    expect(shaped.totals.current).toEqual({ activeUsers: 40, sessions: 55 });
    expect(shaped.totals.previous.sessions).toBe(30);
    expect(shaped.byDate.current.map(d => d.date)).toEqual(["2026-10-01", "2026-10-02"]);
    expect(shaped.channels[0]).toEqual({ sessionDefaultChannelGroup: "Organic Search", sessions: 12, activeUsers: 10, engagementRate: 0.6 });
    expect(shaped.events).toEqual({ current: { purchase: 2 }, previous: { add_to_cart: 5 } });
    expect(shaped.activeNow).toBe(3);
    expect(shaped.countries).toEqual([]);
  });
  it("explains the usual setup errors in plain words", () => {
    expect(gaErrorMessage(403, { error: { message: "Google Analytics Data API has not been used in project 1 before or it is disabled" } }).code).toBe("api_disabled");
    expect(gaErrorMessage(403, { error: { message: "User does not have sufficient permissions for this property." } }, "sa@x.iam.gserviceaccount.com").error).toContain("sa@x.iam.gserviceaccount.com");
    expect(gaErrorMessage(404, {}).code).toBe("not_found");
  });
});

describe("handleGa4Report", () => {
  const deps = (over = {}) => ({
    allow: async () => true, readSettings: async () => ({ propertyId: "123456789" }),
    credentials: async () => ({ accessToken: "tok", email: "sa@x.iam.gserviceaccount.com" }), fetchImpl: vi.fn(), projectId: "p", ...over,
  });
  it("needs a property id before calling Google", async () => {
    const d = deps({ readSettings: async () => ({}) });
    const { body } = await handleGa4Report({ op: "status" }, d);
    expect(body).toMatchObject({ connected: false, code: "no_property", serviceAccount: "sa@x.iam.gserviceaccount.com" });
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });
  it("reports a refused property as not connected with the fix", async () => {
    const d = deps({ fetchImpl: vi.fn(async () => reply(403, { error: { message: "User does not have sufficient permissions" } })) });
    const { body } = await handleGa4Report({ op: "status" }, d);
    expect(body).toMatchObject({ connected: false, code: "no_access" });
  });
  it("status: realtime users with the service-account token", async () => {
    const d = deps({ fetchImpl: vi.fn(async () => reply(200, report([], ["activeUsers"], [{ d: [], m: [4] }]))) });
    const { body } = await handleGa4Report({ op: "status" }, d);
    expect(body).toMatchObject({ connected: true, activeNow: 4 });
    const [url, init] = d.fetchImpl.mock.calls[0];
    expect(url).toContain("properties/123456789:runRealtimeReport");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });
  it("report: refuses a bad range and is rate limited", async () => {
    expect((await handleGa4Report({ op: "report", range: { startDate: "x" } }, deps({ fetchImpl: vi.fn(async () => reply(200, {})) }))).status).toBe(400);
    expect((await handleGa4Report({ op: "report", range: RANGE }, deps({ allow: async () => false }))).status).toBe(429);
  });
  it("report: four batches (campaigns, then the visitor batch) plus three realtime calls", async () => {
    const d = deps({ fetchImpl: vi.fn(async () => reply(200, { reports: [] })) });
    const { body } = await handleGa4Report({ op: "report", range: RANGE }, d);
    expect(body.connected).toBe(true);
    expect(d.fetchImpl).toHaveBeenCalledTimes(7);
    expect(d.fetchImpl.mock.calls.filter(([url]) => url.includes(":runRealtimeReport"))).toHaveLength(3);
    expect(body.report.totals.current).toEqual({});
    expect(body.report.campaigns).toEqual([]);
    expect(body.report.pageTime).toEqual([]);
    expect(body.report.actions).toEqual({ current: {}, previous: {} });
    expect(body.report.realtimePages).toEqual([]);
    expect(body.report.realtimeMinutes).toHaveLength(30);
  });
  const routed = (handler) => vi.fn(async (url, init) => {
    const payload = JSON.parse(init.body);
    return handler(url, payload);
  });
  const isVisitorBatch = p => (p.requests || []).some(r => (r.dimensions || []).some(dm => dm.name === "linkDomain" || dm.name === "dayOfWeek"));
  it("report: a refused visitor batch or failed extra realtime calls never fail the report", async () => {
    const d = deps({ fetchImpl: routed((url, p) => {
      if (url.includes(":runRealtimeReport")) return p.dimensions ? reply(500, {}) : reply(200, report([], ["activeUsers"], [{ d: [], m: [2] }]));
      if (isVisitorBatch(p)) return reply(403, { error: { message: "nope" } });
      return reply(200, { reports: [] });
    }) });
    const { body } = await handleGa4Report({ op: "report", range: RANGE }, d);
    expect(body.connected).toBe(true);
    expect(body.report.activeNow).toBe(2);
    expect(body.report.realtimePages).toBeNull();
    expect(body.report.realtimeMinutes).toBeNull();
    ["pageTime", "when", "actions", "pageActions", "outbound"].forEach(k => expect(body.report[k]).toBeUndefined());
    expect(body.report.campaigns).toEqual([]);
  });
  it("report: a 400 on the visitor batch retries its reports one by one and keeps those Google accepts", async () => {
    const d = deps({ fetchImpl: routed((url, p) => {
      if (url.includes(":runRealtimeReport")) return reply(200, {});
      if (isVisitorBatch(p) && p.requests.length > 1) return reply(400, { error: { message: "Field outbound is not valid" } });
      if (p.requests.length === 1 && p.requests[0].dimensions?.[0]?.name === "linkDomain") return reply(400, { error: { message: "bad" } });
      if (p.requests.length === 1 && p.requests[0].dimensions?.[0]?.name === "pagePath" && p.requests[0].dimensions.length === 1 && p.requests[0].metrics.some(m => m.name === "userEngagementDuration")) {
        return reply(200, { reports: [report(["pagePath"], ["screenPageViews", "activeUsers", "userEngagementDuration"], [{ d: ["/"], m: [20, 9, 400] }])] });
      }
      return reply(200, { reports: [] });
    }) });
    const { body } = await handleGa4Report({ op: "report", range: RANGE }, d);
    expect(body.connected).toBe(true);
    expect(body.report.pageTime).toEqual([{ pagePath: "/", screenPageViews: 20, activeUsers: 9, userEngagementDuration: 400 }]);
    expect(body.report.outbound).toBeUndefined();
    expect(body.report.when).toEqual([]);
  });
  it("report: a refused core batch still fails the report", async () => {
    const d = deps({ fetchImpl: routed((url, p) => {
      if (url.includes(":runRealtimeReport")) return reply(200, {});
      if ((p.requests || []).some(r => r.dimensions?.[0]?.name === "sessionCampaignName")) return reply(403, { error: { message: "User does not have sufficient permissions" } });
      return reply(200, { reports: [] });
    }) });
    const { body } = await handleGa4Report({ op: "report", range: RANGE }, d);
    expect(body).toMatchObject({ connected: false, code: "no_access" });
  });
});

describe("GA4 visitor batch", () => {
  it("is the 4th batch, five reports, with the visitor keys and valid filters", () => {
    const batches = buildBatches(RANGE);
    expect(batches).toHaveLength(4);
    expect(batches[3].map(r => r.key)).toEqual(["pageTime", "when", "actions", "pageActions", "outbound"]);
    const outbound = batches[3][4];
    expect(outbound.dimensionFilter.andGroup.expressions.map(e => e.filter.fieldName)).toEqual(["eventName", "outbound"]);
    expect(batches[3][2].dateRanges.map(r => r.name)).toEqual(["current", "previous"]);
  });
  it("shapes pageTime, when, actions (per window), pageActions and outbound, plus realtime", () => {
    const batches = buildBatches(RANGE);
    const responses = [{ reports: [] }, { reports: [] }, { reports: [] }, { reports: [
      report(["pagePath"], ["screenPageViews", "activeUsers", "userEngagementDuration"], [{ d: ["/books/a"], m: [30, 12, 900] }]),
      report(["dayOfWeek", "hour"], ["activeUsers", "sessions"], [{ d: ["1", "09"], m: [4, 5] }]),
      report(["eventName", "dateRange"], ["eventCount", "activeUsers"], [{ d: ["scroll", "current"], m: [10, 6] }, { d: ["scroll", "previous"], m: [4, 3] }]),
      report(["pagePath", "eventName"], ["eventCount"], [{ d: ["/books/a", "scroll"], m: [8] }]),
      report(["linkDomain"], ["eventCount", "activeUsers"], [{ d: ["instagram.com"], m: [7, 5] }]),
    ] }];
    const pages = report(["unifiedScreenName"], ["activeUsers", "screenPageViews"], [{ d: ["Home"], m: [1, 2] }, { d: ["Book A"], m: [3, 4] }]);
    const minutes = report(["minutesAgo"], ["activeUsers"], [{ d: ["00"], m: [2] }, { d: ["05"], m: [1] }]);
    const shaped = shapeReport(batches.map((requests, i) => ({ requests, response: responses[i] })), null, { pages, minutes });
    expect(shaped.pageTime).toEqual([{ pagePath: "/books/a", screenPageViews: 30, activeUsers: 12, userEngagementDuration: 900 }]);
    expect(shaped.when).toEqual([{ dayOfWeek: "1", hour: "09", activeUsers: 4, sessions: 5 }]);
    expect(shaped.actions).toEqual({ current: { scroll: { eventCount: 10, activeUsers: 6 } }, previous: { scroll: { eventCount: 4, activeUsers: 3 } } });
    expect(shaped.pageActions).toEqual([{ pagePath: "/books/a", eventName: "scroll", eventCount: 8 }]);
    expect(shaped.outbound).toEqual([{ linkDomain: "instagram.com", eventCount: 7, activeUsers: 5 }]);
    expect(shaped.realtimePages.map(r => r.unifiedScreenName)).toEqual(["Book A", "Home"]);
    expect(shaped.realtimeMinutes[0]).toEqual({ minutesAgo: 0, activeUsers: 2 });
    expect(shaped.realtimeMinutes[5].activeUsers).toBe(1);
    expect(shaped.realtimeMinutes[29]).toEqual({ minutesAgo: 29, activeUsers: 0 });
    expect(shaped.activeNow).toBeNull();
  });
  it("leaves the new keys out for callers that pass no visitor data", () => {
    const shaped = shapeReport([], null);
    ["pageTime", "when", "actions", "pageActions", "outbound", "realtimePages", "realtimeMinutes"].forEach(k => expect(k in shaped).toBe(false));
  });
  it("realtime helpers give null for a failed call", () => {
    expect(realtimePagesOf(null)).toBeNull();
    expect(realtimeMinutesOf(null)).toBeNull();
    expect(realtimeMinutesOf({})).toHaveLength(30);
  });
});

describe("traffic reset", () => {
  const fakeDb = (n) => {
    let docs = Array.from({ length: n }, (_, i) => ({ ref: `analytics/${i}` }));
    const writes = [];
    return {
      writes,
      collection: (name) => ({
        limit: (k) => ({ get: async () => { const page = name === "analytics" ? docs.slice(0, k) : []; return { empty: page.length === 0, size: page.length, docs: page }; } }),
        doc: (id) => ({ set: async (data) => { writes.push({ path: `${name}/${id}`, data }); } }),
      }),
      batch: () => { const del = []; return { delete: (ref) => del.push(ref), commit: async () => { docs = docs.filter(d => !del.includes(d.ref)); } }; },
    };
  };
  it("needs the typed word", async () => {
    expect(resetConfirmed({ confirm: "reset " })).toBe(true);
    expect((await handleTrafficReset({}, { db: fakeDb(2) })).status).toBe(400);
  });
  it("deletes every daily counter in batches and records when", async () => {
    const db = fakeDb(905);
    const { body } = await handleTrafficReset({ confirm: "RESET" }, { db, by: "owner@x", now: () => "2026-10-13T12:00:00.000Z" });
    expect(body).toEqual({ ok: true, at: "2026-10-13T12:00:00.000Z", removedDays: 905 });
    expect(db.writes).toEqual([{ path: "systemStatus/trafficReset", data: { at: "2026-10-13T12:00:00.000Z", by: "owner@x", removedDays: 905 } }]);
  });
});
