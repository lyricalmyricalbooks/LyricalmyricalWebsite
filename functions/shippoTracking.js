// Tracking numbers typed in by hand (order page, inventory app, a replaced label) are registered with Shippo,
// so Shippo sends the same tracking updates it sends for labels bought through it. The tracking webhook
// (shippoEndpoints.js) then moves the order along and emails the customer exactly as for a bought label.

// Carrier names the admin offers (src/app/lib/tracking.ts CARRIERS) mapped to Shippo's carrier tokens.
const CARRIER_ALIASES = { dhl: "dhl_express", canadapost: "canada_post" };
// Carriers Shippo can track that the shop offers. Chit Chats, Stallion Express and typed-in "Other" carriers
// can't be tracked by Shippo, so they are never sent.
const TRACKABLE = new Set(["canada_post", "purolator", "ups", "fedex", "dhl_express", "usps", "canpar"]);

/** Shippo's carrier token for a carrier name or token ("Canada Post", "DHL", "canada_post"). */
function shippoCarrierToken(name) {
  const token = String(name || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return CARRIER_ALIASES[token] || token;
}

const clean = value => String(value || "").replace(/\s+/g, "");

/**
 * The tracking to register after an order write, or null. Only a number that is new or changed, on an order with
 * no label bought through Shippo (Shippo already tracks those), with a carrier Shippo can track.
 */
function trackingToRegister(before = {}, after = {}) {
  if (after.isTest === true || after.labelUrl) return null;
  const trackingNumber = clean(after.trackingNumber);
  if (!trackingNumber || trackingNumber.length > 100) return null;
  const carrier = shippoCarrierToken(after.trackingCarrier);
  if (!TRACKABLE.has(carrier)) return null;
  if (clean(before.trackingNumber) === trackingNumber && shippoCarrierToken(before.trackingCarrier) === carrier) return null;
  return { carrier, trackingNumber };
}

/** Body for Shippo's POST tracks/. */
function trackRegistration({ carrier, trackingNumber }, orderId) {
  return { carrier, tracking_number: trackingNumber, metadata: `Order ${orderId}`.slice(0, 100) };
}

module.exports = { shippoCarrierToken, trackingToRegister, trackRegistration, TRACKABLE };
