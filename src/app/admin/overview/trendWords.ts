// Headline figures say what moved in words (Pressroom refreshed, 9 November 2026): "CA$96.00 more than yesterday",
// "2 fewer than the 7 days before", "Down from 3.4%". Pure and tested; TrendWords in OverviewParts draws it.

export type TrendKind = "money" | "count" | "percent";
export type TrendDir = "up" | "down" | "same";
export type TrendTone = "good" | "bad" | "neutral";

export function trendWords(now: number, before: number, opts: {
  kind: TrendKind; before: string; money?: (n: number) => string; goodWhen?: "up" | "down" | "neutral";
}): { text: string; dir: TrendDir; tone: TrendTone } {
  const a = Number.isFinite(now) ? now : 0;
  const b = Number.isFinite(before) ? before : 0;
  const goodWhen = opts.goodWhen || "up";
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;
  const same = opts.kind === "percent" ? fmtPct(a) === fmtPct(b) : opts.kind === "money" ? Math.round(a * 100) === Math.round(b * 100) : a === b;
  const dir: TrendDir = same ? "same" : a > b ? "up" : "down";
  const tone: TrendTone = dir === "same" || goodWhen === "neutral" ? "neutral" : dir === goodWhen ? "good" : "bad";
  if (dir === "same") return { text: `Same as ${opts.before}`, dir, tone };
  if (opts.kind === "percent") return { text: `${dir === "up" ? "Up" : "Down"} from ${fmtPct(b)}`, dir, tone };
  const diff = Math.abs(a - b);
  if (opts.kind === "money") {
    const m = opts.money || ((n: number) => `$${n.toFixed(2)}`);
    return { text: `${m(diff)} ${dir === "up" ? "more" : "less"} than ${opts.before}`, dir, tone };
  }
  return { text: `${diff.toLocaleString()} ${dir === "up" ? "more" : "fewer"} than ${opts.before}`, dir, tone };
}
