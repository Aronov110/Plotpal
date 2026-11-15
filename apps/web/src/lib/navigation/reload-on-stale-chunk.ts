/** The key, in `sessionStorage`, under which the time of the last reload is noted. */
export const RELOAD_GUARD_KEY = "plotpal-chunk-reload";

/**
 * How long after a reload another one is refused, in milliseconds. A file that is still missing
 * after a reload is not going to appear by reloading again.
 */
export const RELOAD_GUARD_MS = 10_000;

export interface StaleChunkReloadOptions {
  /** What hears the event. The page's own window unless told otherwise. */
  readonly target?: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  /** Gives the storage that survives a reload (but not closing the tab). Allowed to throw. */
  readonly getStorage?: () => Pick<Storage, "getItem" | "setItem">;
  readonly now?: () => number;
  readonly reload?: () => void;
}

/**
 * Reloads the page, once, when a piece of the app that it asked for is gone.
 *
 * The app loads some screens on demand, in files whose names change with every version. A tab that
 * was opened before a new version went live still asks for the old names, which the host no longer
 * has, and Vite then reports `vite:preloadError`. A reload fetches the page of the new version, which
 * asks for the right names.
 *
 * The time of the reload is noted in `sessionStorage`, and a second reload within
 * {@link RELOAD_GUARD_MS} is refused, so a file that is gone for another reason (the network is
 * down) cannot make the page reload for ever. When the storage cannot be used, nothing is reloaded
 * for the same reason. The event is not cancelled: the failed load still reaches the screen that
 * waits for it, which shows its own message.
 *
 * @returns a function that stops listening.
 */
export function installStaleChunkReload(options: StaleChunkReloadOptions = {}): () => void {
  const {
    target = window,
    getStorage = () => window.sessionStorage,
    now = Date.now,
    reload = () => window.location.reload(),
  } = options;

  const handler = (): void => {
    try {
      const storage = getStorage();
      const current = now();
      const last = Number.parseInt(storage.getItem(RELOAD_GUARD_KEY) ?? "", 10);
      const elapsed = current - last;
      // A noted time that is not a number, or lies in the future (a clock that was set back), counts
      // as no note: the new note below is what stops a loop.
      if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < RELOAD_GUARD_MS) return;
      storage.setItem(RELOAD_GUARD_KEY, String(current));
    } catch {
      // No usable storage means no way to stop a loop, so no reload.
      return;
    }
    reload();
  };

  target.addEventListener("vite:preloadError", handler);
  return () => target.removeEventListener("vite:preloadError", handler);
}
