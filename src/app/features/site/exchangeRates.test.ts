import { describe, expect, test, vi } from "vitest";
import { FALLBACK_RATES, RATES_CACHE_KEY, loadRates } from "./exchangeRates";

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
};
const feed = (usd: number, eur: number) => vi.fn(async () => new Response(JSON.stringify({ rates: { USD: usd, EUR: eur } }), { status: 200 }));

describe("#88 exchange rates", () => {
  test("a live answer is used, marked live and remembered for the session", async () => {
    const store = memory();
    const fetchImpl = feed(0.71, 0.65);
    expect(await loadRates({ fetchImpl: fetchImpl as any, store, now: 1000 })).toEqual({ rates: { CAD: 1, USD: 0.71, EUR: 0.65 }, source: "live" });
    // The next page load asks nobody.
    const again = await loadRates({ fetchImpl: fetchImpl as any, store, now: 2000 });
    expect(again.source).toBe("cached");
    expect(again.rates.USD).toBe(0.71);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("a stale cache is refreshed", async () => {
    const store = memory();
    store.setItem(RATES_CACHE_KEY, JSON.stringify({ at: 0, rates: { USD: 0.5, EUR: 0.5 } }));
    const res = await loadRates({ fetchImpl: feed(0.7, 0.6) as any, store, now: 7 * 60 * 60 * 1000 });
    expect(res.source).toBe("live");
  });

  test("a feed that never answers times out and is reported as fallback, not left hanging", async () => {
    const hang = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const res = await loadRates({ fetchImpl: hang as any, store: memory(), timeoutMs: 20 });
    expect(res).toEqual({ rates: FALLBACK_RATES, source: "fallback" });
  });

  test("an error status, bad numbers or a blocked storage still end in an honest fallback", async () => {
    expect((await loadRates({ fetchImpl: (async () => new Response("", { status: 429 })) as any, store: memory() })).source).toBe("fallback");
    expect((await loadRates({ fetchImpl: feed(0, 0) as any, store: null })).source).toBe("fallback");
    expect((await loadRates({ fetchImpl: (async () => { throw new TypeError("blocked"); }) as any, store: null })).source).toBe("fallback");
  });
});
