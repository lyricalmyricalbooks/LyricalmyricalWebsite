// Which address boxes a destination really needs. Many countries have no state/province list and
// some have no postal code at all; demanding them turned valid addresses away from the address
// check and the label tool. Mirrored by src/app/features/site/addressRules.ts
// (addressRules.parity.test.ts), and by the checkout form (regionsFor + the no-postcode list).
const { resolveCountry } = require("./shared/shippingZones");

// Countries whose addresses have no postal code (same list the checkout form uses).
const NO_POSTAL_CODE = new Set([
  "AO", "AG", "AW", "BS", "BZ", "BJ", "BW", "BF", "BI", "CM", "CF", "KM", "CG", "CD", "CK", "CI", "DJ", "DM", "ER", "FJ",
  "GM", "GH", "GD", "GY", "HK", "KI", "MO", "ML", "MR", "NR", "NU", "QA", "RW", "KN", "LC", "ST", "SC", "SL", "SB", "SR",
  "SY", "TL", "TG", "TK", "TO", "TT", "TV", "UG", "VU", "YE", "ZW", "AE",
]);
// Only these have a fixed state/province list (regionsFor). Elsewhere the box is optional free text.
const REGION_COUNTRIES = new Set(["CA", "US"]);

function countryCodeOf(country) {
  const resolved = resolveCountry(country);
  if (resolved) return resolved.code;
  const clean = String(country || "").trim();
  return /^[a-z]{2}$/i.test(clean) ? clean.toUpperCase() : "";
}
const regionRequired = country => REGION_COUNTRIES.has(countryCodeOf(country));
const postalRequired = country => !NO_POSTAL_CODE.has(countryCodeOf(country));
const blank = value => !String(value ?? "").trim();

// The boxes still empty that this country needs: street, city, country always; state only for
// Canada/US; postal code unless the country has none.
function addressMissing(address) {
  const a = address || {};
  const missing = [];
  if (blank(a.street)) missing.push("street");
  if (blank(a.city)) missing.push("city");
  if (blank(a.country)) missing.push("country");
  if (regionRequired(a.country) && blank(a.state)) missing.push("state");
  if (postalRequired(a.country) && blank(a.zip)) missing.push("zip");
  return missing;
}

module.exports = { NO_POSTAL_CODE, REGION_COUNTRIES, countryCodeOf, regionRequired, postalRequired, addressMissing };
