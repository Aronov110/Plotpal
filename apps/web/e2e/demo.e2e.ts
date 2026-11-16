import { expect, type Page, test } from "@playwright/test";
import { expectNoAxeViolations } from "./support/axe.ts";
import { PROJECTS_HEADING } from "./support/flows.ts";

const outline = (page: Page) => page.getByRole("navigation", { name: "Outline" });
const textBox = (page: Page, title: string) =>
  page.getByRole("textbox", { name: `Text of “${title}”` });
const saved = (page: Page) => page.getByText("Saved", { exact: true });

const demoButton = (page: Page) => page.getByRole("button", { name: "Try the demo" });

for (const start of [
  { name: "the home page", path: "/" },
  { name: "the login page", path: "/login" },
] as const) {
  test.describe(`Try the demo from ${start.name}`, () => {
    test("one press signs in and shows the sample story, with the focus on the heading", async ({
      page,
    }) => {
      await page.goto(start.path);
      await expect(demoButton(page)).toBeVisible();
      await demoButton(page).click();

      await expect(page).toHaveURL(/\/app$/);
      await expect(page.getByRole("heading", PROJECTS_HEADING)).toBeFocused();
      await expect(page.getByRole("link", { name: "The Last Light" })).toBeVisible();
      await expect(page.getByText("Signed in as")).toBeVisible();
      await expect(page.getByText("Demo visitor")).toBeVisible();
    });

    test("is still signed in after a reload, like any other login", async ({ page }) => {
      await page.goto(start.path);
      await demoButton(page).click();
      await expect(page.getByRole("heading", PROJECTS_HEADING)).toBeVisible();
      await page.reload();
      await expect(page.getByRole("heading", PROJECTS_HEADING)).toBeVisible();
      await expect(page.getByRole("link", { name: "The Last Light" })).toBeVisible();
    });
  });
}

test.describe("the sample story", () => {
  test("opens on the writing screen with its acts, its scenes and their text", async ({ page }) => {
    await page.goto("/");
    await demoButton(page).click();
    await page.getByRole("link", { name: "The Last Light" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "The Last Light" })).toBeVisible();
    await expect(outline(page).getByRole("link")).toHaveText([
      "Act 1: The Storm",
      "The last boat",
      "The lamp",
      "Act 2: The Visitor",
      "A knock at midnight",
      "The logbook",
    ]);

    await outline(page).getByRole("link", { name: "The last boat" }).click();
    await expect(textBox(page, "The last boat")).toHaveValue(
      /By five the sea had taken the causeway/,
    );
    await outline(page).getByRole("link", { name: "A knock at midnight" }).click();
    await expect(textBox(page, "A knock at midnight")).toHaveValue(/Dry all the way/);
  });

  test("can be edited and saved like any project", async ({ page }) => {
    await page.goto("/");
    await demoButton(page).click();
    await page.getByRole("link", { name: "The Last Light" }).click();
    await outline(page).getByRole("link", { name: "The lamp" }).click();

    // Ctrl+End (Cmd+Down on a Mac) goes to the end of the whole text; plain End only to the end of the line.
    await textBox(page, "The lamp").press("ControlOrMeta+End");
    await page.keyboard.type(" A gull cried once.");
    await expect(saved(page)).toBeVisible();
    await page.reload();
    await expect(textBox(page, "The lamp")).toHaveValue(/A gull cried once\.$/);
  });

  test("is the visitor's own: another visitor never sees their changes", async ({
    page,
    browser,
  }) => {
    await page.goto("/");
    await demoButton(page).click();
    await page.getByRole("link", { name: "The Last Light" }).click();
    await outline(page).getByRole("link", { name: "The lamp" }).click();
    await textBox(page, "The lamp").press("ControlOrMeta+End");
    await page.keyboard.type(" Only the first visitor wrote this.");
    await expect(saved(page)).toBeVisible();

    const other = await browser.newContext();
    try {
      const second = await other.newPage();
      await second.goto("/");
      await demoButton(second).click();
      await second.getByRole("link", { name: "The Last Light" }).click();
      await outline(second).getByRole("link", { name: "The lamp" }).click();
      await expect(textBox(second, "The lamp")).toHaveValue(/At dusk Mara lit the lamp/);
      await expect(textBox(second, "The lamp")).not.toHaveValue(/Only the first visitor/);
    } finally {
      await other.close();
    }
  });
});

test.describe("leaving and coming back", () => {
  test("after signing out, the demo can be started again from the login page", async ({ page }) => {
    await page.goto("/");
    await demoButton(page).click();
    await expect(page.getByRole("heading", PROJECTS_HEADING)).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await demoButton(page).click();

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("link", { name: "The Last Light" })).toBeVisible();
  });

  test("a demo started from the login page after being sent there goes to the projects, not to the saved address", async ({
    page,
  }) => {
    // A project address that belongs to nobody: a signed-out visitor is sent to the login page with
    // it saved. A demo must still land on the demo's own projects.
    await page.goto("/app/projects/00000000-0000-7000-8000-000000000000");
    await expect(page).toHaveURL(/\/login$/);
    await demoButton(page).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", PROJECTS_HEADING)).toBeVisible();
  });
});

test.describe("when the server says no", () => {
  test("a full demo is explained in words, and the visitor can try again", async ({ page }) => {
    await page.route("**/auth/demo", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/problem+json",
        headers: { "retry-after": "300" },
        body: JSON.stringify({ type: "urn:plotpal:problem:demo-unavailable", status: 503 }),
      }),
    );
    await page.goto("/");
    await demoButton(page).click();

    await expect(page.getByRole("alert")).toContainText(
      "The demo is full right now. Try again in a few minutes, or create an account.",
    );
    await expect(page).toHaveURL(/\/$/);
    await expect(demoButton(page)).toBeEnabled();
  });

  test("a demo that is switched off says so, and sign-up still works", async ({ page }) => {
    await page.route("**/auth/demo", (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/problem+json",
        body: JSON.stringify({ type: "urn:plotpal:problem:not-found", status: 404 }),
      }),
    );
    await page.goto("/");
    await demoButton(page).click();
    await expect(page.getByRole("alert")).toContainText("The demo is switched off at the moment.");
    await page.getByRole("link", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/register$/);
  });

  test("a lost connection is explained, and has no accessibility violations", async ({ page }) => {
    await page.route("**/auth/demo", (route) => route.abort("failed"));
    await page.goto("/");
    await demoButton(page).click();
    await expect(page.getByRole("alert")).toContainText("Can't reach the server.");
    await expectNoAxeViolations(page);
  });
});

test.describe("the screen while the demo is being made", () => {
  test("says it is working, shows no second press, and has no violations", async ({ page }) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/auth/demo", async (route) => {
      await held;
      await route.continue();
    });
    await page.goto("/");
    await demoButton(page).click();
    await expect(page.getByText("Setting up your demo…")).toBeVisible();
    await expect(demoButton(page)).toHaveAttribute("aria-busy", "true");
    await expectNoAxeViolations(page);
    release();
    await expect(page.getByRole("heading", PROJECTS_HEADING)).toBeVisible();
  });
});
