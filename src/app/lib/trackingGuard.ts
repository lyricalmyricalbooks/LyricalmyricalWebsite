import { consentAllows } from "./consent";
import { restoredUser } from "../../lib/authSession";
import { inThemePreview } from "../features/site/themePreview";

/** The Studio preview iframe / new-tab preview runs the real storefront; it must not count as shopper traffic. */
export const inEditorPreview = () =>
  typeof window !== "undefined" && window.location.search.includes("preview=true");

/**
 * Whether this page view may be counted in the daily `analytics/<date>` doc: the shopper has not declined
 * analytics, it is not the Studio preview, and nobody is signed in as admin in this browser (the owner
 * clicking around their own shop is not traffic). Waits briefly for Firebase Auth to restore a saved
 * session so an admin is not counted just because auth had not finished loading.
 */
export async function trackingAllowed(): Promise<boolean> {
  // A shared preview link (Studio 3.4) is the owner's guests looking at an unpublished design, not shop traffic.
  if (inEditorPreview() || inThemePreview() || !consentAllows("analytics")) return false;
  try {
    // Guests with no saved sign-in skip loading Firebase Auth entirely.
    if (await restoredUser(1500)) return false;
  } catch {
    // Auth unavailable: count the visit rather than lose it.
  }
  return true;
}

/** The shop owner's sign-in (the one admin account, CLAUDE.md › Auth & admin access). */
export const SHOP_OWNER_EMAIL = "lyricalmyricalbooks@gmail.com";

/**
 * Google Analytics' rule: the same preview and consent checks, but only the shop owner is left out — customers
 * signed in to their account are real shoppers and their visits and purchases count.
 */
export async function googleTrackingAllowed(): Promise<boolean> {
  if (inEditorPreview() || inThemePreview() || !consentAllows("analytics")) return false;
  try {
    const user = await restoredUser(1500);
    if (user && String(user.email || "").toLowerCase() === SHOP_OWNER_EMAIL) return false;
  } catch {
    // Auth unavailable: count the visit rather than lose it.
  }
  return true;
}
