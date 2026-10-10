import { collection, doc, documentId, getDoc, getDocs, increment, limit, orderBy, query, setDoc, startAfter, where } from "firebase/firestore/lite";

import { liteDb } from "../../lib/firestoreLite";
import { defaultSettings } from "../admin/defaultSettings";
import { withRisoNoirDefault } from "../features/site/risoNoir";
import type { Page } from "../features/site/types";

/**
 * The shopper-side reads the storefront needs to render. Kept apart from `admin/api.ts` so the public
 * bundle never downloads the admin API, Firebase Auth or the theme store; `adminApi` re-exports these.
 */
export const publicApi = {
  // Document-ID ordering includes legacy books without createdAt and gives
  // public pagination the same membership as the sitemap, without writes.
  getStorefrontBooks: async (limitCount = 100, lastVisible: any = null) => {
    // firestore.rules serve the public only books with status "published", so a list query must say so (a
    // book saved before statuses existed is stamped "published" by scripts/migrate-book-private-fields.mjs).
    const constraints = [where("status", "==", "published"), orderBy(documentId()), ...(lastVisible ? [startAfter(lastVisible)] : []), limit(limitCount)];
    const snap = await getDocs(query(collection(liteDb, "books"), ...constraints));
    return snap.docs.map(d => ({ ...d.data(), id: d.id, _lastDoc: d }));
  },

  // A shopper's read of one book: null for a missing book and for one that is not published (the rules refuse
  // the read of a draft or archived book, which is the same answer to a shopper).
  getBook: async (id: string) => {
    let snap;
    try { snap = await getDoc(doc(liteDb, "books", id)); }
    catch (err: any) { if (err?.code === "permission-denied") return null; throw err; }
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  },

  getShippingProfiles: async () => {
    const snap = await getDocs(collection(liteDb, "shipping-profiles"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  // Shopper read of settings/website: no admin-only lookups, never writes, and never keeps the
  // unpublished draft or My themes (older documents may still carry them) in shopper state or cache.
  getPublicSettings: async () => {
    const snap = await getDoc(doc(liteDb, "settings", "website"));
    const merged: any = { ...defaultSettings(), ...(snap.exists() ? snap.data() : {}) };
    delete merged.draftDesign;
    delete merged.savedThemes;
    delete merged.scheduledPublish; // older client-side schedules; the server scheduler publishes now (Studio 3.5)
    if (merged.design) merged.design = withRisoNoirDefault(merged.design);
    return merged;
  },

  /** A shared preview link (Studio 3.4): readable by its exact token while unexpired (firestore.rules), never listed. */
  getThemePreview: async (token: string) => {
    const snap = await getDoc(doc(liteDb, "previewTokens", token));
    return snap.exists() ? snap.data() : null;
  },

  getPublishedPages: async (): Promise<Page[]> => {
    const q = query(collection(liteDb, "pages"), where("status", "==", "published"));
    const snap = await getDocs(q);
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
    return docs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },

  // One counter bump per shopper session. `increment` is applied by Firestore itself, so two shoppers arriving at
  // once can't overwrite each other's count (the old read-then-write could).
  recordVisit: async () => {
    const today = new Date().toISOString().split('T')[0];
    try {
      await setDoc(doc(liteDb, "analytics", today), { date: today, visits: increment(1) }, { merge: true });
    } catch (e) {
      console.warn("Analytics failed", e);
    }
  },
};
