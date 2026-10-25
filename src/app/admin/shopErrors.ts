// Shop errors: what shoppers' browsers reported (functions/clientErrors.js, src/app/lib/errorReport.ts). Pure, tested.
import type { AdminAlert } from "./adminAlerts";

export type ShopErrorRow = {
  id: string;
  kind: string;
  message: string;
  section: string;
  count: number;
  lastPath: string;
  paths: string[];
  lastSeen: number;
  firstSeen: number;
  stack: string;
};

const DAY = 864e5;
const ms = (value: any): number => {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : 0;
};

export const KIND_LABELS: Record<string, string> = { page: "Page", section: "Section", script: "Script", promise: "Script" };

export function shopErrorRows(docs: any[]): ShopErrorRow[] {
  return docs.map(d => ({
    id: String(d.id),
    kind: String(d.kind || "script"),
    message: String(d.message || ""),
    section: String(d.section || ""),
    count: Math.max(1, Number(d.count) || 1),
    lastPath: String(d.lastPath || "/"),
    paths: Array.isArray(d.paths) ? d.paths.map(String) : [],
    lastSeen: ms(d.lastSeenAt),
    firstSeen: ms(d.firstSeenAt),
    stack: String(d.stack || ""),
  })).sort((a, b) => b.lastSeen - a.lastSeen);
}

/** One alert while any error was seen in the last day; a new distinct error brings a dismissed alert back. */
export function shopErrorAlert(rows: ShopErrorRow[], now = Date.now()): AdminAlert | null {
  const recent = rows.filter(r => now - r.lastSeen < DAY);
  if (!recent.length) return null;
  const top = [...recent].sort((a, b) => b.count - a.count)[0];
  const times = top.count;
  const where = top.section ? `the ${top.section} section on ${top.lastPath}` : top.lastPath;
  return {
    id: "shop-errors",
    tone: top.kind === "page" ? "danger" : "warning",
    title: recent.length === 1 ? "A shopper hit an error on the shop" : `Shoppers hit ${recent.length} different errors on the shop`,
    detail: `Most often: “${top.message.slice(0, 120)}” on ${where}. ${times === 1 ? "Seen once" : `Seen ${times} times`} so far. Details are in Shop errors.`,
    orderIds: [],
    key: recent.map(r => r.id).sort().join(","),
    action: "general",
  };
}
