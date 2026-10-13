import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import { cleanMeasurementId } from "../lib/ga4";

// Google Analytics 4 for the admin. The measurement ID ("G-…") is public (shoppers' browsers load it from
// settings/website.analytics); the property ID lives in admin-only adminSecrets/googleAnalytics. Reports are read by
// the createStripeCheckoutSession `ga4Report` action with the Functions' own service account (functions/googleAnalytics.js).

export { cleanMeasurementId };

/** Mirrors functions/googleAnalytics.js cleanPropertyId: the number, "properties/123…" or a pasted Analytics URL. */
export function cleanPropertyId(value: unknown): string {
  const m = String(value ?? "").trim().match(/(?:^|properties\/|\bp)(\d{6,15})(?:\/|$|\b)/);
  return m ? m[1] : "";
}

export interface Ga4Range { startDate: string; endDate: string; prevStartDate: string; prevEndDate: string }
type Row = Record<string, any>;
export interface Ga4Report {
  totals: { current: Row; previous: Row };
  byDate: { current: Row[]; previous: Row[] };
  channels: Row[]; sources: Row[]; landing: Row[]; countries: Row[]; devices: Row[]; pages: Row[]; visitorType: Row[];
  events: { current: Record<string, number>; previous: Record<string, number> };
  activeNow: number | null;
}
export interface Ga4Answer {
  connected: boolean; code?: string; error?: string; serviceAccount?: string; propertyId?: string; enableApiUrl?: string;
  activeNow?: number; report?: Ga4Report;
}

async function call(payload: Record<string, unknown>): Promise<any> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Sign in again as the shop administrator.");
  let res: Response;
  try {
    res = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Couldn't reach the shop's server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `The shop's server answered ${res.status}. Check that Cloud Functions are deployed.`);
  return data;
}

export const googleAnalyticsApi = {
  /** What is saved: the public measurement ID and the private property ID. */
  load: async (): Promise<{ measurementId: string; propertyId: string }> => {
    const [pub, priv] = await Promise.all([getDoc(doc(db, "settings", "website")), getDoc(doc(db, "adminSecrets", "googleAnalytics"))]);
    return {
      measurementId: String((pub.exists() && pub.data()?.analytics?.ga4MeasurementId) || ""),
      propertyId: String((priv.exists() && priv.data()?.propertyId) || ""),
    };
  },
  /** Saves both IDs (an empty value switches that part off). Only `analytics.ga4MeasurementId` is touched in public settings. */
  save: async (measurementId: string, propertyId: string) => {
    await setDoc(doc(db, "settings", "website"), { analytics: { ga4MeasurementId: cleanMeasurementId(measurementId) } }, { mergeFields: ["analytics.ga4MeasurementId"] });
    await setDoc(doc(db, "adminSecrets", "googleAnalytics"), { propertyId: cleanPropertyId(propertyId), updatedAt: serverTimestamp() }, { merge: true });
  },
  status: (): Promise<Ga4Answer> => call({ action: "ga4Report", op: "status" }),
  report: (range: Ga4Range): Promise<Ga4Answer> => call({ action: "ga4Report", op: "report", range }),
  /** Overview › Start traffic counts again: deletes the shop's own daily traffic counters (never orders). */
  resetTraffic: (): Promise<{ ok: boolean; at: string; removedDays: number }> => call({ action: "resetTraffic", confirm: "RESET" }),
  /** When the shop's own counters were last reset (admin-read systemStatus/trafficReset), or null. */
  lastReset: async (): Promise<{ at: string; removedDays: number } | null> => {
    const snap = await getDoc(doc(db, "systemStatus", "trafficReset"));
    return snap.exists() ? (snap.data() as any) : null;
  },
};

/** Where the setup lives, for messages that point at it. */
export const GA_SETTINGS_PATH = "Settings › General › Google Analytics";
