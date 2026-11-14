import { expect, type Page, test } from "@playwright/test";
import {
  createAccount,
  createProjects,
  createProjectWithDocuments,
} from "./support/api-control.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import { logIn } from "./support/flows.ts";
import { uniqueUser } from "./support/users.ts";

// Motion in a real browser: screens fade in, lists settle in, loading shows a skeleton, and everything
// stops for people who ask for less movement.

test.describe("screens fade in", () => {
  test("the main part of a screen starts a fade-in when the screen opens", async ({ page }) => {
    await page.addInitScript(() => {
      // Records the animation name of the main part the moment it appears.
      new MutationObserver(() => {
        const main = document.querySelector("main");
        const w = window as unknown as { __entered?: string };
        if (main !== null && w.__entered === undefined) {
          w.__entered = getComputedStyle(main).animationName;
        }
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "Log in" })).toBeVisible();
    const name = await page.evaluate(() => (window as unknown as { __entered?: string }).__entered);
    expect(name).toBe("page-enter");
  });

  test("with reduced motion nothing is left playing, and nothing loops", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "Log in" })).toBeVisible();
    const durations = await page.evaluate(() =>
      [...document.querySelectorAll("*")].map((element) => {
        const style = getComputedStyle(element);
        return {
          duration: Number.parseFloat(style.animationDuration),
          iterations: style.animationIterationCount,
        };
      }),
    );
    for (const entry of durations) {
      expect(entry.duration).toBeLessThan(0.001);
      expect(entry.iterations).toBe("1");
    }
  });
});

test.describe("moving between screens", () => {
  test("a link goes straight there, focus lands on the new heading, and text typed at once is kept", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Create one" }).click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Create your account" }),
    ).toBeFocused();
    await page.getByLabel("Email").fill("someone@example.com");
    await expect(page.getByLabel("Email")).toHaveValue("someone@example.com");

    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { level: 1, name: "Log in" })).toBeVisible();
  });

  test("the page does not use the browser's cross-fade between screens", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __vt: number }).__vt = 0;
      const original = document.startViewTransition?.bind(document);
      if (original === undefined) return;
      document.startViewTransition = ((callback?: ViewTransitionUpdateCallback) => {
        (window as unknown as { __vt: number }).__vt += 1;
        return original(callback);
      }) as typeof document.startViewTransition;
    });
    await page.goto("/login");
    await page.getByRole("link", { name: "Create one" }).click();
    await expect(page).toHaveURL(/\/register$/);
    expect(await page.evaluate(() => (window as unknown as { __vt: number }).__vt)).toBe(0);
  });
});

test.describe("lists and loading", () => {
  test.use({ viewport: { width: 1200, height: 800 } });

  async function signedInWithProjects(
    page: Page,
    request: Parameters<typeof createAccount>[0],
    count: number,
  ) {
    const user = uniqueUser();
    await createAccount(request, user);
    await createProjects(
      request,
      user,
      Array.from({ length: count }, (_, index) => ({ title: `Story ${index + 1}` })),
    );
    await page.goto("/login");
    await logIn(page, user);
    return user;
  }

  test("project cards come in one after another, each a little later", async ({
    page,
    request,
  }) => {
    await signedInWithProjects(page, request, 3);
    await expect(page.getByRole("heading", { level: 3, name: "Story 3" })).toBeVisible();
    const delays = await page
      .locator(".project-item")
      .evaluateAll((items) =>
        items.map((item) => Number.parseFloat(getComputedStyle(item).animationDelay)),
      );
    expect(delays).toHaveLength(3);
    expect(delays[1] ?? 0).toBeGreaterThan(delays[0] ?? 0);
    expect(delays[2] ?? 0).toBeGreaterThan(delays[1] ?? 0);
  });

  test("a slow answer shows a skeleton, hidden from screen readers, then the projects", async ({
    page,
    request,
  }) => {
    const user = uniqueUser();
    await createAccount(request, user);
    await createProjects(request, user, [{ title: "Story 1" }, { title: "Story 2" }]);
    await page.goto("/login");
    await logIn(page, user);
    await page.getByRole("link", { name: "Plotpal" }).click();

    // Hold the next list request back for a moment, and look at what the screen shows meanwhile.
    await page.route(/\/projects(\?|$)/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.reload();
    const skeleton = page.locator(".skeleton--cards");
    await expect(skeleton).toBeAttached();
    await expect(skeleton).toHaveAttribute("aria-hidden", "true");
    await expect(page.getByText("Loading your projects…")).toBeAttached();
    await expect
      .poll(() => skeleton.evaluate((element) => getComputedStyle(element).opacity))
      .toBe("1");

    await expect(page.getByRole("heading", { level: 3, name: "Story 1" })).toBeVisible();
    await expect(skeleton).toHaveCount(0);
  });

  test("a fast answer never shows the skeleton", async ({ page, request }) => {
    await page.addInitScript(() => {
      // Notes whether the skeleton was ever visible (opacity above zero) for even a moment.
      (window as unknown as { __skeletonShown: boolean }).__skeletonShown = false;
      const check = () => {
        for (const element of document.querySelectorAll(".skeleton")) {
          if (Number.parseFloat(getComputedStyle(element).opacity) > 0.05) {
            (window as unknown as { __skeletonShown: boolean }).__skeletonShown = true;
          }
        }
      };
      new MutationObserver(check).observe(document, { childList: true, subtree: true });
      setInterval(check, 16);
    });
    await signedInWithProjects(page, request, 2);
    await expect(page.getByRole("heading", { level: 3, name: "Story 2" })).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as unknown as { __skeletonShown: boolean }).__skeletonShown,
      ),
    ).toBe(false);
  });

  test("the writing screen loads without the page jumping", async ({
    page,
    request,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "Only Chromium reports layout shifts.");
    await page.addInitScript(() => {
      const state = { score: 0 };
      (window as unknown as { __cls: typeof state }).__cls = state;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
        }[]) {
          if (!entry.hadRecentInput) state.score += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    const user = uniqueUser();
    await createAccount(request, user);
    const seeded = await createProjectWithDocuments(request, user, {
      title: "The Lighthouse",
      documents: [
        { title: "Act One", content: "The lighthouse stands alone." },
        { title: "The Storm", inside: "Act One", content: "Waves crash on the rocks." },
      ],
    });
    await page.goto("/login");
    await logIn(page, user);
    await page.goto(`/app/projects/${seeded.projectId}?document=${seeded.ids["The Storm"]}`);
    await expect(page.getByRole("textbox", { name: "Text of “The Storm”" })).toBeVisible();
    await page.waitForTimeout(1500);
    const score = await page.evaluate(
      () => (window as unknown as { __cls: { score: number } }).__cls.score,
    );
    expect(score).toBeLessThan(0.1);
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`axe during motion in ${colorScheme} mode (colour contrast included)`, () => {
    test.use({ colorScheme, viewport: { width: 1200, height: 800 } });

    test("the projects screen while it loads, and after", async ({ page, request }) => {
      const user = uniqueUser();
      await createAccount(request, user);
      await createProjects(request, user, [{ title: "Story 1" }]);
      await page.goto("/login");
      await logIn(page, user);
      await page.route(/\/projects(\?|$)/, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        await route.continue();
      });
      await page.reload();
      await expect(page.locator(".skeleton--cards")).toBeAttached();
      await expectNoAxeViolations(page);
      await expect(page.getByRole("heading", { level: 3, name: "Story 1" })).toBeVisible();
      await expectNoAxeViolations(page);
    });
  });
}
