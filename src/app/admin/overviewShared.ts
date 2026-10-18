// One read per source for the whole Overview board: several widgets can show the same carts, back-in-stock
// sign-ups or Search Console report, and each mounts on its own, so they share the promise instead of each
// reading Firestore (or Google) again. Refresh clears it.
const cache = new Map<string, Promise<unknown>>();

export function sharedLoad<T>(key: string, load: () => Promise<T>, fresh = false): Promise<T> {
  if (fresh) cache.delete(key);
  let p = cache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load();
    cache.set(key, p);
    // A failed read is not kept, so Try again really tries again.
    p.catch(() => { if (cache.get(key) === p) cache.delete(key); });
  }
  return p;
}

export const clearShared = () => cache.clear();
