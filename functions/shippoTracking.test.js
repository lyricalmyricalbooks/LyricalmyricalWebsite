import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { shippoCarrierToken, trackingToRegister, trackRegistration, TRACKABLE } = require("./shippoTracking");

const fs = require("node:fs");
const path = require("node:path");
const dir = path.dirname(new URL(import.meta.url).pathname);

describe("Shippo carrier tokens", () => {
  it("maps the admin's carrier names and passes Shippo tokens through", () => {
    expect(shippoCarrierToken("Canada Post")).toBe("canada_post");
    expect(shippoCarrierToken("canada_post")).toBe("canada_post");
    expect(shippoCarrierToken("DHL")).toBe("dhl_express");
    expect(shippoCarrierToken("FedEx")).toBe("fedex");
    expect(shippoCarrierToken("Chit Chats")).toBe("chit_chats");
    expect(shippoCarrierToken("")).toBe("");
  });

  it("covers every carrier the admin offers, trackable or knowingly not", () => {
    const source = fs.readFileSync(path.join(dir, "../src/app/lib/tracking.ts"), "utf8");
    const carriers = JSON.parse(source.match(/export const CARRIERS = (\[[^\]]*\])/)[1]);
    const untrackable = ["chit_chats", "stallion_express"];
    for (const name of carriers) {
      const token = shippoCarrierToken(name);
      expect(TRACKABLE.has(token) || untrackable.includes(token), name).toBe(true);
    }
  });
});

describe("which tracking numbers are registered", () => {
  const shipped = { trackingNumber: "7023 2100 0001", trackingCarrier: "Canada Post" };

  it("registers a new hand-typed number", () => {
    expect(trackingToRegister({}, shipped)).toEqual({ carrier: "canada_post", trackingNumber: "702321000001" });
  });

  it("registers a corrected number or carrier", () => {
    expect(trackingToRegister(shipped, { ...shipped, trackingNumber: "999" })).toEqual({ carrier: "canada_post", trackingNumber: "999" });
    expect(trackingToRegister(shipped, { ...shipped, trackingCarrier: "UPS" })).toEqual({ carrier: "ups", trackingNumber: "702321000001" });
  });

  it("skips unchanged numbers, Shippo labels, test orders, untrackable carriers and blanks", () => {
    expect(trackingToRegister(shipped, { ...shipped, updatedAt: "now" })).toBeNull();
    expect(trackingToRegister(shipped, { ...shipped, trackingNumber: "70232100 0001" })).toBeNull();
    expect(trackingToRegister({}, { ...shipped, labelUrl: "https://shippo/label.pdf" })).toBeNull();
    expect(trackingToRegister({}, { ...shipped, isTest: true })).toBeNull();
    expect(trackingToRegister({}, { ...shipped, trackingCarrier: "Chit Chats" })).toBeNull();
    expect(trackingToRegister({}, { ...shipped, trackingCarrier: "Bob's Couriers" })).toBeNull();
    expect(trackingToRegister({}, { trackingCarrier: "Canada Post" })).toBeNull();
  });

  it("registers a replacement label's number once the Shippo label is removed", () => {
    const before = { ...shipped, labelUrl: "https://shippo/label.pdf" };
    expect(trackingToRegister(before, { trackingNumber: "NEW1", trackingCarrier: "Canada Post" })).toEqual({ carrier: "canada_post", trackingNumber: "NEW1" });
  });

  it("builds Shippo's tracks/ body with the order number", () => {
    expect(trackRegistration({ carrier: "ups", trackingNumber: "1Z" }, "LM-1001")).toEqual({ carrier: "ups", tracking_number: "1Z", metadata: "Order LM-1001" });
  });
});
