import { expect, type Page, test } from "@playwright/test";
import { expectNoAxeViolations } from "./support/axe.ts";

// The colour theme: Light or Dark. Until one is chosen the page follows the device (and the switch
// shows that theme as the chosen one); a choice is saved in the browser and is on the page before
// anything is painted.
const STORAGE_KEY = "plotpal-theme";
const LIGHT_BACKGROUND = "rgb(247, 242, 233)";
const DARK_BACKGROUND = "rgb(14, 17, 23)";

const backgroundOf = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const themeMark = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute("data-theme"));
const saved = (page: Page) => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
const choice = (page: Page, name: "Light" | "Dark") => page.getByRole("radio", { name });

test("there are two choices, Light and Dark, and no third", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("radio")).toHaveCount(2);
  await expect(page.getByRole("radio", { name: "System" })).toHaveCount(0);
});

test.describe("on a device that prefers dark", () => {
  test.use({ colorScheme: "dark" });

  test("is dark with nothing chosen, shows Dark as chosen, and saves nothing", async ({ page }) => {
    await page.goto("/login");
    expect(await themeMark(page)).toBeNull();
    expect(await backgroundOf(page)).toBe(DARK_BACKGROUND);
    await expect(choice(page, "Dark")).toBeChecked();
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
  });

  test("choosing Light beats the device, and is saved as one word", async ({ page }) => {
    await page.goto("/login");
    await choice(page, "Light").check();
    expect(await themeMark(page)).toBe("light");
    expect(await backgroundOf(page)).toBe(LIGHT_BACKGROUND);
    expect(await saved(page)).toBe("light");
    expect(await page.evaluate(() => localStorage.length)).toBe(1);
  });
});

test.describe("on a device that prefers light", () => {
  test.use({ colorScheme: "light" });

  test("is light with nothing chosen, shows Light as chosen, and saves nothing", async ({
    page,
  }) => {
    await page.goto("/login");
    expect(await themeMark(page)).toBeNull();
    expect(await backgroundOf(page)).toBe(LIGHT_BACKGROUND);
    await expect(choice(page, "Light")).toBeChecked();
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
  });

  test("a chosen dark theme beats the device, and is saved as one word", async ({ page }) => {
    await page.goto("/login");
    await choice(page, "Dark").check();
    expect(await themeMark(page)).toBe("dark");
    expect(await backgroundOf(page)).toBe(DARK_BACKGROUND);
    expect(await saved(page)).toBe("dark");
    expect(await page.evaluate(() => localStorage.length)).toBe(1);
  });

  test("the choice survives a reload and is on the page before it is painted", async ({ page }) => {
    await page.addInitScript(() => {
      // Records whether the page body existed yet at the moment the theme was put on the page.
      const seen: { bodyExisted: boolean | undefined } = { bodyExisted: undefined };
      (window as unknown as { __themeSeen: typeof seen }).__themeSeen = seen;
      new MutationObserver(() => {
        if (seen.bodyExisted === undefined && document.documentElement.hasAttribute("data-theme")) {
          seen.bodyExisted = document.body !== null;
        }
        // The root element does not exist yet when this runs, so the whole document is watched.
      }).observe(document, { attributes: true, subtree: true });
    });
    await page.goto("/login");
    await choice(page, "Dark").check();

    await page.reload();
    expect(await themeMark(page)).toBe("dark");
    expect(await backgroundOf(page)).toBe(DARK_BACKGROUND);
    await expect(choice(page, "Dark")).toBeChecked();
    const seen = await page.evaluate(
      () =>
        (window as unknown as { __themeSeen: { bodyExisted: boolean | undefined } }).__themeSeen,
    );
    // The early script runs in the head, before the body is parsed: no flash of the wrong colours.
    expect(seen.bodyExisted).toBe(false);
  });

  test("a saved word that means nothing is ignored, and so is an old saved 'system'", async ({
    page,
  }) => {
    for (const word of ["purple", "system"]) {
      await page.addInitScript(
        ([key, value]) => {
          localStorage.setItem(key as string, value as string);
        },
        [STORAGE_KEY, word],
      );
      await page.goto("/login");
      expect(await themeMark(page)).toBeNull();
      await expect(choice(page, "Light")).toBeChecked();
    }
  });

  test("follows the device changing while nothing is chosen, with no reload", async ({ page }) => {
    await page.goto("/login");
    await expect(choice(page, "Light")).toBeChecked();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(choice(page, "Dark")).toBeChecked();
    expect(await backgroundOf(page)).toBe(DARK_BACKGROUND);
    expect(await saved(page)).toBeNull();
  });

  test("a chosen theme is not changed by the device changing", async ({ page }) => {
    await page.goto("/login");
    await choice(page, "Dark").check();
    await choice(page, "Light").check();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(choice(page, "Light")).toBeChecked();
    expect(await backgroundOf(page)).toBe(LIGHT_BACKGROUND);
    expect(await saved(page)).toBe("light");
  });

  test("works from the keyboard", async ({ page }) => {
    await page.goto("/login");
    await choice(page, "Light").focus();
    await page.keyboard.press("ArrowRight");
    await expect(choice(page, "Dark")).toBeChecked();
    expect(await themeMark(page)).toBe("dark");
    await page.keyboard.press("ArrowLeft");
    await expect(choice(page, "Light")).toBeChecked();
    expect(await themeMark(page)).toBe("light");
  });

  test("the home page has the choice too", async ({ page }) => {
    await page.goto("/");
    await choice(page, "Dark").check();
    expect(await themeMark(page)).toBe("dark");
  });
});

// Each combination of the device's setting and a chosen theme (or none) must pass the colour checks.
for (const device of ["light", "dark"] as const) {
  for (const chosen of ["nothing", "Light", "Dark"] as const) {
    test.describe(`axe with a ${device} device and ${chosen} chosen (colour contrast included)`, () => {
      test.use({ colorScheme: device });

      test("the login screen", async ({ page }) => {
        await page.goto("/login");
        if (chosen !== "nothing") await choice(page, chosen).check();
        await expectNoAxeViolations(page);
      });

      test("the home page", async ({ page }) => {
        await page.goto("/");
        if (chosen !== "nothing") await choice(page, chosen).check();
        await expectNoAxeViolations(page);
      });
    });
  }
}
