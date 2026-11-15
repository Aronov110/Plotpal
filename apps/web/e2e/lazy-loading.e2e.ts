import { expect, type Page, test } from "@playwright/test";
import { createAccount, createProjectWithDocuments } from "./support/api-control.ts";
import { logIn, PROJECTS_HEADING } from "./support/flows.ts";
import { uniqueUser } from "./support/users.ts";

// The writing screen is the biggest screen and is loaded when a project is opened, not with the
// pages before it. These tests run against the built app, in a real browser.

/** The files of the writing screen in the built app (their names carry a hash of the contents). */
const WRITING_FILE = /\/assets\/WritingPage-[^/]+\.(js|css)$/;

/** Collects the addresses of the writing screen's files that the page asks for. */
function watchWritingFiles(page: Page): string[] {
  const asked: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (WRITING_FILE.test(pathname)) asked.push(pathname);
  });
  return asked;
}

async function seedProject(request: Parameters<typeof createAccount>[0]) {
  const user = uniqueUser();
  await createAccount(request, user);
  const seeded = await createProjectWithDocuments(request, user, {
    title: "The Lighthouse",
    documents: [{ title: "Act One", content: "The lighthouse stands alone." }],
  });
  return { user, seeded };
}

test.describe("the writing screen's files", () => {
  test.use({ viewport: { width: 1200, height: 800 } });

  test("are not downloaded before a project is opened, and are when one is", async ({
    page,
    request,
  }) => {
    const { user } = await seedProject(request);
    const asked = watchWritingFiles(page);

    await page.goto("/");
    await page.goto("/login");
    await logIn(page, user);
    await expect(page.getByRole("heading", PROJECTS_HEADING)).toBeVisible();
    expect(asked).toEqual([]);

    await page.getByRole("link", { name: "The Lighthouse" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "The Lighthouse" })).toBeVisible();
    expect(asked.some((path) => path.endsWith(".js"))).toBe(true);
  });

  test("are not downloaded a second time", async ({ page, request }) => {
    const { user } = await seedProject(request);
    await page.goto("/login");
    await logIn(page, user);
    await page.getByRole("link", { name: "The Lighthouse" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "The Lighthouse" })).toBeVisible();

    const asked = watchWritingFiles(page);
    await page.getByRole("link", { name: "Back to your projects" }).click();
    await expect(page.getByRole("heading", PROJECTS_HEADING)).toBeVisible();
    await page.getByRole("link", { name: "The Lighthouse" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "The Lighthouse" })).toBeVisible();
    expect(asked).toEqual([]);
  });
});

test.describe("when the files of the writing screen are gone (a new version went live)", () => {
  test.use({ viewport: { width: 1200, height: 800 } });

  test("the page reloads once, and then says the screen could not load, without reloading again", async ({
    page,
    request,
  }) => {
    const { user } = await seedProject(request);
    await page.goto("/login");
    await logIn(page, user);
    await expect(page.getByRole("heading", PROJECTS_HEADING)).toBeVisible();

    let refused = 0;
    await page.route(WRITING_FILE, (route) => {
      refused += 1;
      return route.fulfill({ status: 404, body: "gone" });
    });
    let loads = 0;
    page.on("load", () => {
      loads += 1;
    });

    await page.getByRole("link", { name: "The Lighthouse" }).click();

    // The first failure reloads the page; the file is still gone, and the second failure does not.
    const heading = page.getByRole("heading", { level: 1, name: "This screen could not load" });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(page.getByRole("button", { name: "Reload the page" })).toBeVisible();
    // Time for a loop to show itself, were there one.
    await page.waitForTimeout(1500);
    expect(loads).toBe(1);
    expect(refused).toBeGreaterThanOrEqual(2);

    // The header is still there, and the way back works.
    await page.getByRole("link", { name: /plotpal/i }).click();
    await expect(page.getByRole("heading", PROJECTS_HEADING)).toBeVisible();
  });

  test("after a poor connection, once it is back, the button brings the screen", async ({
    page,
    request,
  }) => {
    const { user } = await seedProject(request);
    await page.goto("/login");
    await logIn(page, user);
    await expect(page.getByRole("heading", PROJECTS_HEADING)).toBeVisible();

    // The request fails outright (nothing is answered, so nothing can be remembered by the browser),
    // as on a connection that drops, and later works again.
    let connectionIsDown = true;
    await page.route(WRITING_FILE, (route) =>
      connectionIsDown ? route.abort("failed") : route.continue(),
    );
    await page.getByRole("link", { name: "The Lighthouse" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "This screen could not load" }),
    ).toBeVisible();

    connectionIsDown = false;
    // The guard against loops holds for ten seconds after the first reload; the button is the
    // person's own choice and is not held back by it.
    await page.getByRole("button", { name: "Reload the page" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "The Lighthouse" })).toBeVisible();
  });
});
