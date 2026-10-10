// Newsletter sign-up shared by the footer's Newsletter box and the Newsletter sections (including the pop-up one).
// One row per address: the document id is the lower-cased email (firestore.rules `match /newsletter/{docId}`
// allows only email, subscribedAt and source), so signing up twice is simply "already done".
import { doc, setDoc } from "firebase/firestore/lite";
import { liteDb } from "../../../lib/firestoreLite";
import { inEditorPreview } from "../../lib/trackingGuard";

export const isEmailAddress = (email: string) => /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(String(email || "").trim());

/** Resolves when signed up (or already signed up); rejects "invalid-email" or the write error. */
export async function subscribeNewsletter(email: string, source: string): Promise<void> {
  if (!isEmailAddress(email)) throw new Error("invalid-email");
  const clean = email.trim().toLowerCase();
  // The Studio preview runs the real storefront: it shows the success state but never adds a subscriber.
  if (inEditorPreview()) return;
  await setDoc(doc(liteDb, "newsletter", clean), {
    email: clean,
    subscribedAt: new Date().toISOString(),
    source: String(source || "website").slice(0, 60),
  }).catch((err: any) => {
    // A repeat sign-up is an update, which the rules refuse: the address is already on the list.
    if (err?.code !== "permission-denied") throw err;
  });
}
