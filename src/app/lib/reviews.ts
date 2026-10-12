import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  doc,
  updateDoc,
  writeBatch,
  deleteField,
  documentId,
  startAfter,
  getAggregate,
  count,
  average,
} from "firebase/firestore/lite";
import { liteDb } from "../../lib/firestoreLite";
import { inEditorPreview } from "./trackingGuard";

/** Reviews shown per page on a book page. */
export const REVIEW_PAGE = 50;

export type Review = {
  id: string;
  bookId: string;
  authorName: string;
  email?: string;
  rating: number; // 1..5
  title?: string;
  body: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  /** Public reply from the store owner (admin-written). */
  reply?: { body: string; at: string };
  /** Admin-written when approving: the reviewer's email matches a paid order for this book. */
  verified?: boolean;
  /** Admin-written: pinned to the top of the book's reviews. */
  featured?: boolean;
};

/** Splits a list into groups of `size` (Firestore "in" queries take up to 30 values). */
export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// Older reviews kept the email on the public document; moved once per admin session.
let legacyEmailsMoved = false;
// The product page (for search markup) and its reviews section read the same approved list;
// share one request per book for a short while instead of reading it twice.
const approvedCache = new Map<string, { at: number; promise: Promise<Review[]> }>();
const summaryCache = new Map<string, { at: number; promise: Promise<{ count: number; average: number }> }>();
const clearApprovedCache = () => { approvedCache.clear(); summaryCache.clear(); };

export const reviewsApi = {
  listApproved: (bookId: string): Promise<Review[]> => {
    const hit = approvedCache.get(bookId);
    if (hit && Date.now() - hit.at < 30_000) return hit.promise;
    const promise = reviewsApi.list(bookId, false);
    approvedCache.set(bookId, { at: Date.now(), promise });
    promise.catch(() => approvedCache.delete(bookId));
    return promise;
  },

  /**
   * The true number and average of a book's approved reviews, counted by Firestore (not from the newest page the
   * book page happens to show). Shared for 30 s with the page's other readers.
   */
  summary: (bookId: string): Promise<{ count: number; average: number }> => {
    const hit = summaryCache.get(bookId);
    if (hit && Date.now() - hit.at < 30_000) return hit.promise;
    const promise = getAggregate(
      query(collection(liteDb, "reviews"), where("bookId", "==", bookId), where("status", "==", "approved")),
      { count: count(), average: average("rating") },
    ).then(snap => {
      const data = snap.data();
      return { count: Number(data.count) || 0, average: Number(data.average) || 0 };
    });
    summaryCache.set(bookId, { at: Date.now(), promise });
    promise.catch(() => summaryCache.delete(bookId));
    return promise;
  },

  /** The next page of approved reviews, older than `before` (the createdAt of the last one shown). */
  listApprovedBefore: async (bookId: string, before: string): Promise<Review[]> => {
    const snap = await getDocs(query(
      collection(liteDb, "reviews"),
      where("bookId", "==", bookId), where("status", "==", "approved"),
      orderBy("createdAt", "desc"), startAfter(before), limit(REVIEW_PAGE),
    ));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  },

  list: async (bookId: string, includePending = false): Promise<Review[]> => {
    const base = collection(liteDb, "reviews");
    const q = includePending
      ? query(base, where("bookId", "==", bookId), orderBy("createdAt", "desc"), limit(REVIEW_PAGE))
      : query(
          base,
          where("bookId", "==", bookId),
          where("status", "==", "approved"),
          orderBy("createdAt", "desc"),
          limit(REVIEW_PAGE),
        );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  },

  create: async (input: Omit<Review, "id" | "status" | "createdAt">) => {
    const { email, ...publicFields } = input;
    const createdAt = new Date().toISOString();
    const payload = { ...publicFields, title: publicFields.title || "", status: "pending" as const, createdAt };
    // The Studio preview runs the real storefront: it shows the success state but never saves a review.
    if (inEditorPreview()) return { id: "preview", ...payload };
    // The review is public once approved; the reviewer's email goes to admin-only
    // reviewContacts under the same id, written together.
    const ref = doc(collection(liteDb, "reviews"));
    const batch = writeBatch(liteDb);
    batch.set(ref, payload);
    const cleanEmail = String(email || "").trim().toLowerCase().slice(0, 254);
    if (cleanEmail) batch.set(doc(liteDb, "reviewContacts", ref.id), { email: cleanEmail, createdAt });
    await batch.commit();
    clearApprovedCache();
    return { id: ref.id, ...payload };
  },

  /**
   * Admin: emails for the listed reviews (admin-only reviewContacts). The first call in a
   * session also moves every older review's public email there, across the whole collection.
   */
  contactsFor: async (reviews: Review[]): Promise<Record<string, string>> => {
    const out: Record<string, string> = {};
    if (!legacyEmailsMoved) {
      // Only reviews that still hold a public email (a string compares above ""), not the whole collection.
      const all = await getDocs(query(collection(liteDb, "reviews"), where("email", ">", "")));
      const legacy = all.docs.filter(d => d.data().email);
      for (let i = 0; i < legacy.length; i += 200) {
        const batch = writeBatch(liteDb);
        for (const d of legacy.slice(i, i + 200)) {
          batch.set(doc(liteDb, "reviewContacts", d.id), { email: String(d.data().email), createdAt: d.data().createdAt || new Date().toISOString() });
          batch.update(d.ref, { email: deleteField() });
          out[d.id] = String(d.data().email);
        }
        await batch.commit();
      }
      legacyEmailsMoved = true;
    }
    // One query per 30 ids (Firestore's "in" limit) instead of one read per review.
    const ids = reviews.map(r => r.id).filter(id => id && !out[id]);
    await Promise.all(chunk(ids, 30).map(async part => {
      // A failed read throws, so the admin sees "couldn't load" (and can retry) instead of "no email left".
      const snap = await getDocs(query(collection(liteDb, "reviewContacts"), where(documentId(), "in", part)));
      snap.docs.forEach(d => { out[d.id] = String(d.data().email || ""); });
    }));
    return out;
  },

  /** `extra.verified` (approval only): stamped publicly so the book page can show "Verified purchase". */
  setStatus: async (id: string, status: Review["status"], extra: { verified?: boolean } = {}) => {
    await updateDoc(doc(liteDb, "reviews", id), { status, ...(typeof extra.verified === "boolean" ? { verified: extra.verified } : {}) });
    clearApprovedCache();
  },

  setFeatured: async (id: string, featured: boolean) => {
    await updateDoc(doc(liteDb, "reviews", id), { featured });
    clearApprovedCache();
  },

  setReply: async (id: string, body: string) => {
    const text = body.trim().slice(0, 1000);
    await updateDoc(doc(liteDb, "reviews", id), { reply: text ? { body: text, at: new Date().toISOString() } : null });
    clearApprovedCache();
  },

  /** Deletes the review and its admin-only reviewer email together, so no orphaned address is left. */
  remove: async (id: string) => {
    const batch = writeBatch(liteDb);
    batch.delete(doc(liteDb, "reviews", id));
    batch.delete(doc(liteDb, "reviewContacts", id));
    await batch.commit();
    clearApprovedCache();
  },

  aggregate: (bookId: string): Promise<{ count: number; average: number }> => reviewsApi.summary(bookId),
};
