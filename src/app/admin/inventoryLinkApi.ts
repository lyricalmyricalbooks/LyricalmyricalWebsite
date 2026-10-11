// Inventory › Inventory app link: calls to the server (createStripeCheckoutSession action "inventoryLink",
// admin only) and a read of the link's settings (admin-read systemStatus/inventoryLink).
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import type { InventoryAppBook, InventoryLinks, StockRow } from "./inventoryLink";

export type LinkOp = "status" | "check" | "catalog" | "saveLinks" | "setOptions" | "startSales" | "preview" | "apply" | "syncNow";

export interface LinkStatus {
  state: any; undelivered: number | null; unlinkedOrders: number | null; earliestPaidDay: string | null;
  serviceAccount: string; busy: boolean; today: string;
}
export interface StockPreview { hash: string; rows: StockRow[]; changed?: boolean; notReady?: boolean; applied?: Array<StockRow & { result: string }> }

async function call<T>(op: LinkOp, payload: Record<string, unknown> = {}): Promise<T> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("You must be signed in as admin.");
  const response = await functionFetch("createStripeCheckoutSession", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ action: "inventoryLink", op, ...payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The inventory app link didn't answer. Try again in a minute.");
  return result as T;
}

export const inventoryLinkApi = {
  status: () => call<LinkStatus>("status"),
  check: () => call<{ connection: any }>("check"),
  catalog: () => call<{ books: InventoryAppBook[] }>("catalog"),
  saveLinks: (links: InventoryLinks) => call<{ links: InventoryLinks; errors: Array<{ bookId: string; variantId: string | null; reason: string }> }>("saveLinks", { links }),
  setOptions: (options: { autoSync?: boolean; rehearsal?: boolean }) => call<{ saved: any }>("setOptions", options),
  startSales: (startDay: string) => call<{ startDay: string; run: any }>("startSales", { startDay }),
  preview: () => call<{ run: any; stock: StockPreview | null }>("preview"),
  apply: (confirmHash: string) => call<{ run: any; stock: StockPreview | null }>("apply", { confirmHash }),
  syncNow: () => call<{ run: any; stock: StockPreview | null }>("syncNow"),
  /** The links alone, for the stock guards (Inventory page, book editor). {} when not set up. */
  links: async (): Promise<InventoryLinks> => {
    const snap = await getDoc(doc(db, "systemStatus", "inventoryLink"));
    return (snap.exists() && (snap.data() as any).links) || {};
  },
  /** The whole saved state (admin alerts read it). */
  state: async (): Promise<any> => {
    const snap = await getDoc(doc(db, "systemStatus", "inventoryLink"));
    return snap.exists() ? snap.data() : {};
  },
};
