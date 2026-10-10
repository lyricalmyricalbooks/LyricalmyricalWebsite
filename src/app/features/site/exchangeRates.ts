// Exchange rates for showing USD/EUR prices. The server charges the live rate (functions/index.js);
// the browser fetches the same free feed, but must not hang on it, hammer it on every page load, or
// quietly show the old fixed rates without anyone being able to tell.
import { signalWithTimeout } from "./latestRequest";

export type RateCurrency = "CAD" | "USD" | "EUR";
export type Rates = Record<RateCurrency, number>;
/** live = fetched now · cached = fetched earlier this session · fallback = fixed numbers (feed unreachable). */
export type RatesSource = "live" | "cached" | "fallback";

export const FALLBACK_RATES: Rates = { CAD: 1.0, USD: 0.73, EUR: 0.67 };
export const RATES_URL = "https://open.er-api.com/v6/latest/CAD";
export const RATES_CACHE_KEY = "fm_fx_rates";
export const RATES_CACHE_MS = 6 * 60 * 60 * 1000;
export const RATES_FETCH_TIMEOUT_MS = 5000;

type Store = Pick<Storage, "getItem" | "setItem">;

function readCache(store: Store | null, now: number): Rates | null {
  try {
    const saved = JSON.parse(store?.getItem(RATES_CACHE_KEY) || "null");
    if (saved && now - Number(saved.at) < RATES_CACHE_MS && Number(saved.rates?.USD) > 0 && Number(saved.rates?.EUR) > 0) {
      return { CAD: 1, USD: Number(saved.rates.USD), EUR: Number(saved.rates.EUR) };
    }
  } catch { /* unreadable cache: fetch again */ }
  return null;
}

export async function loadRates(opts: { fetchImpl?: typeof fetch; store?: Store | null; now?: number; timeoutMs?: number } = {}): Promise<{ rates: Rates; source: RatesSource }> {
  const now = opts.now ?? Date.now();
  let store: Store | null = null;
  try { store = opts.store === undefined ? (typeof sessionStorage !== "undefined" ? sessionStorage : null) : opts.store; } catch { store = null; }
  const cached = readCache(store, now);
  if (cached) return { rates: cached, source: "cached" };
  const guard = signalWithTimeout(opts.timeoutMs ?? RATES_FETCH_TIMEOUT_MS);
  try {
    const res = await (opts.fetchImpl || fetch)(RATES_URL, { signal: guard.signal });
    if (res.ok) {
      const data = await res.json();
      const usd = Number(data?.rates?.USD);
      const eur = Number(data?.rates?.EUR);
      if (usd > 0 && eur > 0) {
        try { store?.setItem(RATES_CACHE_KEY, JSON.stringify({ at: now, rates: { USD: usd, EUR: eur } })); } catch { /* not cached */ }
        return { rates: { CAD: 1, USD: usd, EUR: eur }, source: "live" };
      }
    }
  } catch { /* timed out, blocked or offline: fall back below */ }
  finally { guard.done(); }
  return { rates: FALLBACK_RATES, source: "fallback" };
}
