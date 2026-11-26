// Address check with Shippo's Address Validation v2, which explains why an address looks wrong in plain words
// ("Unit number is missing"). Accounts without v2 (any 4xx) or an answer in an unknown shape use the older
// v1 check, so checkout never loses its address check. Both answer { isValid, messages: [{ code, text }] }.

const V2_TIMEOUT_MS = 6000;

function v2Query(address) {
  const params = new URLSearchParams();
  const put = (key, value) => { const text = String(value || "").trim(); if (text) params.set(key, text.slice(0, 200)); };
  put("name", address.name);
  put("address_line_1", address.street);
  put("address_line_2", address.unit);
  put("city_locality", address.city);
  put("state_province", address.state);
  put("postal_code", address.zip);
  put("country_code", address.country);
  return params.toString();
}

/**
 * Reads a v2 answer, or null when its shape is unknown. Only "valid" counts as valid: "partially_valid" means part of
 * the address couldn't be confirmed, so the shop still reviews it before packing.
 */
function readV2(result) {
  const verdict = result?.analysis?.validation_result;
  const value = String(verdict?.value || "").toLowerCase();
  if (!["valid", "partially_valid", "invalid"].includes(value)) return null;
  const messages = (Array.isArray(verdict.reasons) ? verdict.reasons : [])
    .map(reason => ({ code: String(reason?.code || ""), text: String(reason?.description || reason?.code || "").trim(), type: reason?.type || undefined }))
    .filter(message => message.text);
  if (value === "partially_valid" && !messages.length) messages.push({ code: "partially_valid", text: "Part of this address could not be confirmed." });
  return { isValid: value === "valid", messages };
}

function readV1(result) {
  const verdict = result?.validation_results || {};
  return { isValid: verdict.is_valid === true, messages: Array.isArray(verdict.messages) ? verdict.messages : [] };
}

/**
 * Checks one address. `address` holds codes already: { name, street, unit, city, state, zip, country }.
 * Throws on a Shippo outage (5xx, timeout), like the v1 check did, so callers keep their "unverified" path.
 */
async function checkAddress(callShippo, token, address) {
  try {
    const parsed = readV2(await callShippo(`v2/addresses/validate?${v2Query(address)}`, "GET", null, token, V2_TIMEOUT_MS));
    if (parsed) return { ...parsed, checker: "v2" };
    console.warn("Shippo address check v2 answered in an unknown shape; using v1.");
  } catch (err) {
    const status = Number(err?.shippoStatus);
    if (!(status >= 400 && status < 500)) throw err;
    console.warn(`Shippo address check v2 refused (HTTP ${status}); using v1.`);
  }
  const v1 = await callShippo("addresses/", "POST", {
    name: address.name || "Customer",
    street1: address.street,
    street2: address.unit || "",
    city: address.city,
    state: address.state,
    zip: address.zip,
    country: address.country,
    validate: true,
  }, token);
  return { ...readV1(v1), checker: "v1" };
}

module.exports = { checkAddress, readV2, readV1, v2Query };
