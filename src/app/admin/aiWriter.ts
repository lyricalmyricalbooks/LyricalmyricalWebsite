import { auth } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import { bookCreators, searchText } from "../lib/bookSeo";
import type { Book } from "../features/site/types";

// AI writing assistant (Google Gemini, free AI Studio key). The key lives in admin-only adminSecrets/ai and
// is used only by the createStripeCheckoutSession `aiWrite` action (functions/aiWriter.js). Every answer is
// a suggestion placed in the editor; nothing is saved until the owner saves the book or page.

export type AiTask = "bookSeo" | "bookDescription" | "pageSeo";
export type AiResult = Record<string, string>;

/** Same rule as functions/aiWriter.js aiKeyProblem ("" = fine or empty). */
export function aiKeyProblem(value: string): string {
  const v = value.trim();
  if (!v) return "";
  return /^[A-Za-z0-9_.-]{30,200}$/.test(v) ? "" : "That doesn't look like a Google AI key (it usually starts with AIza and is 39 characters).";
}

/** An error the editor can show; `needsKey` = point the owner at Settings › General › AI writing assistant. */
export class AiWriteError extends Error {
  needsKey: boolean;
  constructor(message: string, needsKey = false) {
    super(message);
    this.needsKey = needsKey;
  }
}

/** Pure: the public catalog facts sent for a book — never cost, stock, shelf or file fields. */
export function bookAiInput(book: Partial<Book> & Record<string, any>) {
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : []);
  return {
    title: searchText(book.title || ""),
    author: searchText(book.authorName || "") || bookCreators(book).join(", "),
    format: searchText(book.edition || "") || searchText(book.format || ""),
    editions: list((book.variants || []).map((v: any) => v?.name)),
    categories: list(book.categories),
    tags: list(book.tags),
    publisher: searchText(book.publisher || ""),
    publishDate: String(book.publishDate || ""),
    pageCount: Number(book.pageCount) || 0,
    language: searchText(book.language || ""),
    description: String(book.description || ""),
    preorder: book.preorder === true,
    comingSoon: book.comingSoon === true,
  };
}

/** Asks the shop's server to write; throws AiWriteError with a plain-English reason. */
export async function askAi(task: AiTask, input: Record<string, unknown>, extra: { siteName?: string; titleSuffix?: number } = {}): Promise<AiResult> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new AiWriteError("Sign in again as the shop administrator.");
  let res: Response;
  try {
    res = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: "aiWrite", task, input, ...extra }),
    });
  } catch {
    throw new AiWriteError("Couldn't reach the shop's server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.result) {
    throw new AiWriteError(data?.error || `The shop's server answered ${res.status}. Check that Cloud Functions are deployed.`, data?.needsKey === true);
  }
  return data.result as AiResult;
}

/** Settings card's Check key: one tiny request with the saved key. */
export async function checkAiKey(): Promise<{ ok: boolean; message: string }> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) return { ok: false, message: "Sign in again as the shop administrator." };
  try {
    const res = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: "aiWrite", op: "check" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: data.error || `The shop's server answered ${res.status}. Check that Cloud Functions are deployed.` };
    return data.ok
      ? { ok: true, message: "Gemini answered with this key. The Write with AI buttons are ready in Books and Studio › Pages." }
      : { ok: false, message: data.error || "Google refused the key." };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Could not check the key." };
  }
}

/** Where the key goes, for error messages that need it. */
export const AI_SETTINGS_PATH = "Settings › General › AI writing assistant";
