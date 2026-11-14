import { describe, expect, it, vi } from "vitest";
import {
  applyPreference,
  deviceTheme,
  isThemePreference,
  readPreference,
  THEME_STORAGE_KEY,
  writePreference,
} from "../theme.ts";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

describe("isThemePreference", () => {
  it.each(["light", "dark"])("accepts %s", (value) => {
    expect(isThemePreference(value)).toBe(true);
  });

  it.each([
    null,
    undefined,
    "",
    "system",
    "LIGHT",
    "Dark",
    "auto",
    "constructor",
    "__proto__",
    1,
    {},
  ])("refuses %j", (value) => {
    expect(isThemePreference(value)).toBe(false);
  });
});

describe("readPreference", () => {
  it("is nothing when nothing was saved", () => {
    expect(readPreference(fakeStorage())).toBeUndefined();
  });

  it.each(["light", "dark"] as const)("gives back a saved %s", (value) => {
    expect(readPreference(fakeStorage({ [THEME_STORAGE_KEY]: value }))).toBe(value);
  });

  it.each(["system", "bogus", "", "LIGHT", "{}", "null", "constructor"])(
    "is nothing for a saved value that means nothing (%j)",
    (value) => {
      expect(readPreference(fakeStorage({ [THEME_STORAGE_KEY]: value }))).toBeUndefined();
    },
  );

  it("is nothing when there is no storage at all", () => {
    expect(readPreference(undefined)).toBeUndefined();
  });

  it("is nothing when reading the storage throws (blocked storage)", () => {
    const blocked = {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
    };
    expect(readPreference(blocked)).toBeUndefined();
  });
});

describe("deviceTheme", () => {
  const answer = (matches: boolean) => (query: string) => ({
    matches: query.includes("dark") && matches,
  });

  it("is dark when the device prefers dark", () => {
    expect(deviceTheme(answer(true))).toBe("dark");
  });

  it("is light when the device does not prefer dark", () => {
    expect(deviceTheme(answer(false))).toBe("light");
  });

  it("asks about the dark colour scheme", () => {
    const ask = vi.fn(() => ({ matches: false }));
    deviceTheme(ask);
    expect(ask).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
  });

  it("is light when the browser cannot be asked", () => {
    expect(deviceTheme(undefined)).toBe("light");
  });

  it("is light when asking throws", () => {
    expect(
      deviceTheme(() => {
        throw new Error("no");
      }),
    ).toBe("light");
  });
});

describe("writePreference", () => {
  it.each(["light", "dark"] as const)("saves %s", (value) => {
    const storage = fakeStorage();
    writePreference(value, storage);
    expect(storage.data.get(THEME_STORAGE_KEY)).toBe(value);
  });

  it("does not fail when the storage is missing or blocked", () => {
    expect(() => {
      writePreference("dark", undefined);
    }).not.toThrow();
    const blocked = {
      setItem: vi.fn(() => {
        throw new DOMException("full", "QuotaExceededError");
      }),
    };
    expect(() => {
      writePreference("dark", blocked);
    }).not.toThrow();
  });

  it("stores nothing but the one word", () => {
    const storage = fakeStorage();
    writePreference("dark", storage);
    expect([...storage.data.entries()]).toEqual([[THEME_STORAGE_KEY, "dark"]]);
  });
});

describe("applyPreference", () => {
  it.each(["light", "dark"] as const)("marks the page with the chosen theme %s", (value) => {
    const root = document.createElement("html");
    applyPreference(value, root);
    expect(root.getAttribute("data-theme")).toBe(value);
  });

  it("removes the mark when nothing is chosen, so the device's own setting decides", () => {
    const root = document.createElement("html");
    root.setAttribute("data-theme", "dark");
    applyPreference(undefined, root);
    expect(root.hasAttribute("data-theme")).toBe(false);
  });

  it("changes from one theme to another", () => {
    const root = document.createElement("html");
    applyPreference("dark", root);
    applyPreference("light", root);
    expect(root.getAttribute("data-theme")).toBe("light");
  });

  it("uses the page's own root element when none is given", () => {
    applyPreference("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    applyPreference(undefined);
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});
