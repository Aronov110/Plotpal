import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_STORAGE_KEY } from "../../../../lib/theme/theme.ts";
import { expectNoA11yViolations } from "../../../../test-support/a11y.ts";
import { ThemeSwitch } from "../ThemeSwitch.tsx";

type Listener = (event: { matches: boolean }) => void;

/** A device whose colour setting can be changed from the test. */
function fakeDevice(initial: "light" | "dark") {
  let dark = initial === "dark";
  const listeners = new Set<Listener>();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
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
    }),
  });
  return {
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

describe("ThemeSwitch", () => {
  it("is a group named for the colour theme, with light and dark only", () => {
    render(<ThemeSwitch />);
    expect(screen.getByRole("group", { name: "Colour theme" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((radio) => radio.parentElement?.textContent)).toEqual([
      "Light",
      "Dark",
    ]);
    expect(screen.queryByRole("radio", { name: "System" })).not.toBeInTheDocument();
  });

  it("shows Light as chosen on a light device when nothing was chosen, and saves nothing", () => {
    render(<ThemeSwitch />);
    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Dark" })).not.toBeChecked();
    expect(window.localStorage.length).toBe(0);
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("shows Dark as chosen on a device that prefers dark when nothing was chosen", () => {
    fakeDevice("dark");
    render(<ThemeSwitch />);
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(window.localStorage.length).toBe(0);
  });

  it("starts on the saved choice, even against the device", () => {
    fakeDevice("dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(<ThemeSwitch />);
    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("puts a chosen theme on the page and saves it", async () => {
    render(<ThemeSwitch />);
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();

    await userEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("follows the device while nothing is chosen, and stops after a choice", async () => {
    const device = fakeDevice("light");
    render(<ThemeSwitch />);
    act(() => {
      device.change("dark");
    });
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();

    await userEvent.click(screen.getByRole("radio", { name: "Light" }));
    act(() => {
      device.change("dark");
    });
    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
  });

  it("can be used from the keyboard", async () => {
    render(<ThemeSwitch />);
    screen.getByRole("radio", { name: "Light" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<ThemeSwitch />);
    await expectNoA11yViolations(container);
  });
});
