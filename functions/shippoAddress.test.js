import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { checkAddress, readV2, v2Query } = require("./shippoAddress");

const address = { name: "Ada", street: "1 Main St", unit: "", city: "Toronto", state: "ON", zip: "M5V 1A1", country: "CA" };
const shippoError = status => Object.assign(new Error(`Shippo API error: ${status} - nope`), { shippoStatus: status });

describe("Shippo address check v2", () => {
  it("sends v2's field names and leaves blanks out", () => {
    const query = new URLSearchParams(v2Query(address));
    expect(Object.fromEntries(query)).toEqual({ name: "Ada", address_line_1: "1 Main St", city_locality: "Toronto", state_province: "ON", postal_code: "M5V 1A1", country_code: "CA" });
  });

  it("reads valid, partly valid and invalid answers with their reasons", () => {
    expect(readV2({ analysis: { validation_result: { value: "valid", reasons: [] } } })).toEqual({ isValid: true, messages: [] });
    expect(readV2({ analysis: { validation_result: { value: "invalid", reasons: [{ code: "street_not_found", description: "Street name not found", type: "error" }] } } }))
      .toEqual({ isValid: false, messages: [{ code: "street_not_found", text: "Street name not found", type: "error" }] });
    const partly = readV2({ analysis: { validation_result: { value: "partially_valid", reasons: [] } } });
    expect(partly.isValid).toBe(false);
    expect(partly.messages[0].text).toMatch(/could not be confirmed/);
    expect(readV2({ validation_results: { is_valid: true } })).toBeNull();
  });

  it("uses v2 when it answers", async () => {
    const callShippo = vi.fn().mockResolvedValue({ analysis: { validation_result: { value: "valid" } } });
    expect(await checkAddress(callShippo, "tok", address)).toEqual({ isValid: true, messages: [], checker: "v2" });
    expect(callShippo).toHaveBeenCalledTimes(1);
    expect(callShippo.mock.calls[0][0]).toMatch(/^v2\/addresses\/validate\?/);
    expect(callShippo.mock.calls[0][1]).toBe("GET");
  });

  it("falls back to v1 when v2 is refused or answers in an unknown shape", async () => {
    const v1 = { validation_results: { is_valid: false, messages: [{ code: "x", text: "Bad street" }] } };
    for (const first of [() => Promise.reject(shippoError(403)), () => Promise.resolve({ something: "else" })]) {
      const callShippo = vi.fn().mockImplementationOnce(first).mockResolvedValueOnce(v1);
      expect(await checkAddress(callShippo, "tok", address)).toEqual({ isValid: false, messages: [{ code: "x", text: "Bad street" }], checker: "v1" });
      expect(callShippo.mock.calls[1][0]).toBe("addresses/");
      expect(callShippo.mock.calls[1][2]).toMatchObject({ street1: "1 Main St", state: "ON", country: "CA", validate: true });
    }
  });

  it("keeps an outage an outage, so checkout marks the address unverified", async () => {
    const callShippo = vi.fn().mockRejectedValue(shippoError(503));
    await expect(checkAddress(callShippo, "tok", address)).rejects.toThrow(/503/);
    expect(callShippo).toHaveBeenCalledTimes(1);
  });
});
