import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { SHIPPO_API_VERSION, shippoHeaders } = require("./shippoRequest");

describe("Shippo request headers", () => {
  it("pins the API version on every call", () => {
    expect(shippoHeaders("shippo_test_abc")).toEqual({
      Authorization: "ShippoToken shippo_test_abc",
      "Content-Type": "application/json",
      "Shippo-API-Version": "2018-02-08",
    });
    expect(SHIPPO_API_VERSION).toBe("2018-02-08");
  });

  it("is the only way the functions reach the Shippo API", () => {
    const dir = path.dirname(new URL(import.meta.url).pathname);
    const sources = fs.readdirSync(dir).filter(name => name.endsWith(".js") && !name.endsWith(".test.js"));
    const callers = sources.filter(name => fs.readFileSync(path.join(dir, name), "utf8").includes("api.goshippo.com"));
    expect(callers).toEqual(["index.js"]);
    const index = fs.readFileSync(path.join(dir, "index.js"), "utf8");
    expect(index).toMatch(/headers:\s*shippoHeaders\(token\)/);
    expect(index).not.toMatch(/`ShippoToken \$\{/);
  });
});
