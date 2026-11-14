import { useCallback, useEffect, useState } from "react";
import {
  applyPreference,
  DARK_DEVICE_QUERY,
  deviceTheme,
  readPreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
  writePreference,
} from "./theme.ts";

export interface UseTheme {
  /** What the person chose, or `undefined` while they have not chosen. */
  readonly preference: ThemePreference | undefined;
  /** The theme the page shows now: the choice, or else what the device asks for. */
  readonly theme: ThemePreference;
  /** Saves the choice and puts it on the page at once. */
  readonly setPreference: (preference: ThemePreference) => void;
}

/**
 * The colour theme, and a way to choose it. The page is marked before the first paint by
 * `public/theme-init.js`; this keeps the mark and the saved choice in step afterwards, also when the
 * choice is changed in another tab of the same browser. Until a choice is made the page follows the
 * device (its stylesheet does that), and `theme` follows the device too so that a switch can show it.
 */
export function useTheme(): UseTheme {
  const [preference, setState] = useState<ThemePreference | undefined>(() => readPreference());
  const [device, setDevice] = useState<ThemePreference>(() => deviceTheme());

  // Makes sure the page carries the mark even when the early script did not run.
  useEffect(() => {
    applyPreference(preference);
  }, [preference]);

  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      // A null key means the whole storage was cleared.
      if (event.key === null || event.key === THEME_STORAGE_KEY) setState(readPreference());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(DARK_DEVICE_QUERY);
    const onChange = (): void => {
      setDevice(deviceTheme());
    };
    query.addEventListener("change", onChange);
    return () => {
      query.removeEventListener("change", onChange);
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference): void => {
    writePreference(next);
    setState(next);
  }, []);

  return { preference, theme: preference ?? device, setPreference };
}
