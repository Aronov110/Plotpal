import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_STORAGE_KEY } from "../theme.ts";
import { useTheme } from "../use-theme.ts";

type Listener = (event: { matches: boolean }) => void;

/** A device whose colour setting can be changed from the test, like the real one from its settings. */
function fakeDevice(initial: "light" | "dark") {
  let dark = initial === "dark";
  const listeners = new Set<Listener>();
  const matchMedia = vi.fn((query: string) => ({
    get matches() {
      return query.includes("dark") && dark;
    },
    media: query,
    addEventListener: (_type: string, listener: Listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: Listener) => {
      listeners.delete(listener);
    },
  }));
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: matchMedia,
  });
  return {
    listeners,
    change(next: "light" | "dark") {
      dark = next === "dark";
      for (const listener of [...listeners]) listener({ matches: dark });
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  fakeDevice("light");
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "matchMedia");
});

describe("useTheme", () => {
  it("starts with nothing chosen and nothing on the page, in the device's theme (light)", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBeUndefined();
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("is dark with nothing chosen on a device that prefers dark", () => {
    fakeDevice("dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBeUndefined();
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("is light with nothing chosen when the browser cannot say what the device prefers", () => {
    Reflect.deleteProperty(window, "matchMedia");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
  });

  it("starts from the saved choice and marks the page with it", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe("dark");
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("lets a saved choice beat the device", () => {
    fakeDevice("dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
  });

  it.each(["purple", "system", ""])("ignores a saved value that means nothing (%j)", (value) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, value);
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBeUndefined();
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("saves a new choice and puts it on the page", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setPreference("dark");
    });
    expect(result.current.preference).toBe("dark");
    expect(result.current.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("saves the choice even when it is the theme already showing", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setPreference("light");
    });
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("still changes the page when the storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setPreference("dark");
    });
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("follows the device changing while nothing is chosen", () => {
    const device = fakeDevice("light");
    const { result } = renderHook(() => useTheme());
    act(() => {
      device.change("dark");
    });
    expect(result.current.theme).toBe("dark");
    act(() => {
      device.change("light");
    });
    expect(result.current.theme).toBe("light");
  });

  it("does not let the device change a saved choice", () => {
    const device = fakeDevice("light");
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    const { result } = renderHook(() => useTheme());
    act(() => {
      device.change("dark");
    });
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("follows a change made in another tab", () => {
    const { result } = renderHook(() => useTheme());
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY }));
    });
    expect(result.current.preference).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("follows the storage being cleared in another tab", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    const { result } = renderHook(() => useTheme());
    window.localStorage.clear();
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(result.current.preference).toBeUndefined();
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("ignores changes to other keys", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    const { result } = renderHook(() => useTheme());
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "something-else" }));
    });
    expect(result.current.preference).toBe("dark");
  });

  it("stops listening to the tabs and to the device when it is removed", () => {
    const device = fakeDevice("light");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useTheme());
    expect(device.listeners.size).toBe(1);
    unmount();
    expect(remove).toHaveBeenCalledWith("storage", expect.any(Function));
    expect(device.listeners.size).toBe(0);
  });
});
