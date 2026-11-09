// After a deploy, a page left open still asks for the old build's code files, which are gone. Opening a page whose
// code wasn't loaded yet then fails ("Failed to fetch dynamically imported module"). One reload picks up the new
// build; a remembered time stops a reload loop when the files are missing for another reason (offline, a bad deploy).

const KEY = "fm_stale_build_reload";
/** A second failure within this long of the last automatic reload shows the error view instead of reloading again. */
export const RELOAD_WINDOW_MS = 60_000;

const CHUNK_ERRORS = [
  /Failed to fetch dynamically imported module/i, // Chrome, Edge
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  /Failed to load module script/i, // any browser, when the missing file comes back as a web page
  /Unable to preload CSS/i, // Vite's own preload helper
  /'text\/html' is not a valid JavaScript MIME type/i,
];

/** Whether an error means the browser couldn't load one of the shop's code files. */
export function isChunkLoadError(error: unknown): boolean {
  const message = String((error && typeof error === "object" && "message" in error ? (error as { message: unknown }).message : error) ?? "");
  return CHUNK_ERRORS.some(re => re.test(message));
}

/** Whether an automatic reload may happen now (none in the last minute). Pure, for tests. */
export function mayReload(lastReloadAt: number | null, now: number): boolean {
  return !lastReloadAt || !Number.isFinite(lastReloadAt) || now - lastReloadAt > RELOAD_WINDOW_MS || now < lastReloadAt;
}

/**
 * Reloads the page to pick up the newest build, at most once a minute. Returns whether it reloaded, so a caller
 * shows its own error view when it didn't. Storage blocked: no reload (a loop can't be ruled out).
 */
export function reloadForNewBuild(): boolean {
  try {
    const now = Date.now();
    if (!mayReload(Number(sessionStorage.getItem(KEY)) || null, now)) return false;
    sessionStorage.setItem(KEY, String(now));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

/** Vite fires `vite:preloadError` when a page's code can't be fetched: reload into the new build (main.tsx). */
export function installStaleBuildRecovery(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("vite:preloadError", event => {
    // preventDefault keeps Vite from throwing; only when the reload actually happens, otherwise the error view shows.
    if (reloadForNewBuild()) event.preventDefault();
  });
}
