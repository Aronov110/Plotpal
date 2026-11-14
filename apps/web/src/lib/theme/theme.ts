/**
 * The colour theme a person chose: always light, or always dark. Until they choose, the page follows
 * the device's own setting (see `deviceTheme`). The choice is only a preference, so it is kept in the
 * browser's `localStorage` (never a token or anything private). `public/theme-init.js` reads the same
 * key before the first paint so that the page never flashes the wrong colours; `theme-init.test.ts`
 * checks that both agree.
 */
export type ThemePreference = "light" | "dark";

export const THEME_STORAGE_KEY = "plotpal-theme";

const PREFERENCES: readonly string[] = ["light", "dark"];

/** Whether a value is one of the two words. Anything else a stored value might be is refused. */
export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && PREFERENCES.includes(value);
}

/** The part of `localStorage` that reading needs; a missing or blocked storage reads as "nothing". */
export type ReadableStorage = Pick<Storage, "getItem">;
export type WritableStorage = Pick<Storage, "setItem">;

/** The page's `localStorage`, or `undefined` when the browser blocks it (a private window, say). */
export function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** The saved preference, or `undefined` when none was saved or the saved value means nothing. */
export function readPreference(
  storage: ReadableStorage | undefined = browserStorage(),
): ThemePreference | undefined {
  try {
    const stored = storage?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : undefined;
  } catch {
    return undefined;
  }
}

/** Saves the preference. */
export function writePreference(
  preference: ThemePreference,
  storage: WritableStorage | undefined = browserStorage(),
): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The preference only lasts until the page is closed. Nothing is lost that matters.
  }
}

/** The question the browser is asked about the device's setting. */
export const DARK_DEVICE_QUERY = "(prefers-color-scheme: dark)";

type MatchMedia = (query: string) => Pick<MediaQueryList, "matches">;

/** The browser's `matchMedia`, or `undefined` where there is none. */
export function browserMatchMedia(): MatchMedia | undefined {
  return typeof window.matchMedia === "function" ? window.matchMedia.bind(window) : undefined;
}

/** The theme the device asks for: dark if it prefers dark, otherwise light (also when it cannot be asked). */
export function deviceTheme(match: MatchMedia | undefined = browserMatchMedia()): ThemePreference {
  try {
    return match?.(DARK_DEVICE_QUERY).matches === true ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Marks the page with the chosen theme, or removes the mark so that the device's setting decides. */
export function applyPreference(
  preference: ThemePreference | undefined,
  root: HTMLElement = document.documentElement,
): void {
  if (preference === undefined) root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);
}
