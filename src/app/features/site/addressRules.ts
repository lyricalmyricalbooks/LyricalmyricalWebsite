// Which address boxes a destination really needs (mirror of functions/addressRules.js,
// addressRules.parity.test.ts keeps them identical). Canada and the US need a province/state;
// a few countries have no postal code; everything else is optional free text there.
import { findCountry } from "./shippingZones";

export const NO_POSTAL_CODE = new Set([
  "AO", "AG", "AW", "BS", "BZ", "BJ", "BW", "BF", "BI", "CM", "CF", "KM", "CG", "CD", "CK", "CI", "DJ", "DM", "ER", "FJ",
  "GM", "GH", "GD", "GY", "HK", "KI", "MO", "ML", "MR", "NR", "NU", "QA", "RW", "KN", "LC", "ST", "SC", "SL", "SB", "SR",
  "SY", "TL", "TG", "TK", "TO", "TT", "TV", "UG", "VU", "YE", "ZW", "AE",
]);
export const REGION_COUNTRIES = new Set(["CA", "US"]);

export function countryCodeOf(country: unknown): string {
  const found = findCountry(String(country || ""));
  if (found) return found.code;
  const clean = String(country || "").trim();
  return /^[a-z]{2}$/i.test(clean) ? clean.toUpperCase() : "";
}
export const regionRequired = (country: unknown) => REGION_COUNTRIES.has(countryCodeOf(country));
export const postalRequired = (country: unknown) => !NO_POSTAL_CODE.has(countryCodeOf(country));
const blank = (value: unknown) => !String(value ?? "").trim();

/** The boxes still empty that this country needs (street, city, country, state for CA/US, postal unless none). */
export function addressMissing(address: any): string[] {
  const a = address || {};
  const missing: string[] = [];
  if (blank(a.street)) missing.push("street");
  if (blank(a.city)) missing.push("city");
  if (blank(a.country)) missing.push("country");
  if (regionRequired(a.country) && blank(a.state)) missing.push("state");
  if (postalRequired(a.country) && blank(a.zip)) missing.push("zip");
  return missing;
}
