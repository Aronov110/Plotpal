import { expect, type Page, test } from "@playwright/test";
import { createAccount, createProjectWithDocuments } from "./support/api-control.ts";
import { logIn } from "./support/flows.ts";
import { uniqueUser } from "./support/users.ts";

// The built app, served with the production headers of vercel.json (see vite.config.ts), with the
// browser really ENFORCING the Content Security Policy: nothing in the app may break under it. Every
// other test bypasses the policy (the accessibility checker has to inject a script); this file turns
// the enforcement back on.
test.use({ bypassCSP: false });

interface Watch {
  violations: string[];
  problems: string[];
}

/** Records every policy violation and every console error the page produces. */
async function watch(page: Page): Promise<Watch> {
  const seen: Watch = { violations: [], problems: [] };
  await page.addInitScript(() => {
    (window as unknown as { __violations: string[] }).__violations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { __violations: string[] }).__violations.push(
        `${event.violatedDirective}: ${event.blockedURI}`,
      );
    });
  });
  page.on("console", (message) => {
    if (message.type() === "error") seen.problems.push(message.text());
  });
  page.on("pageerror", (error) => {
    seen.problems.push(error.message);
  });
  return seen;
}

const violationsOf = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __violations?: string[] }).__violations ?? []);

test.describe("the headers", () => {
  test("every page carries the production headers", async ({ page }) => {
    const response = await page.goto("/login");
    const headers = response?.headers() ?? {};
    expect(headers["content-security-policy"]).toContain("default-src 'self'");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["strict-transport-security"]).toContain("max-age=");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  });
});

test.describe("the policy is enforced here, so a break in the app would show", () => {
  test("a script put into the page by something else does not run, and is reported", async ({
    page,
  }) => {
    const seen = await watch(page);
    await page.goto("/login");
    await page.evaluate(() => {
      const script = document.createElement("script");
      script.textContent = "window.__injected = true";
      document.head.append(script);
    });
    expect(await page.evaluate(() => "__injected" in window)).toBe(false);
    await expect
      .poll(() => violationsOf(page))
      .toContainEqual(expect.stringContaining("script-src"));
    expect(seen.problems.length).toBeGreaterThan(0);
  });
});

test.describe("the whole app works under it", () => {
  test.use({ viewport: { width: 1200, height: 800 } });

  test("sign in, the projects list, the writing screen, the AI drawer and the theme switch", async ({
    page,
    request,
  }) => {
    const seen = await watch(page);
    const user = uniqueUser();
    await createAccount(request, user);
    const seeded = await createProjectWithDocuments(request, user, {
      title: "The Lighthouse",
      documents: [
        { title: "Act One", content: "The lighthouse stands alone." },
        { title: "The Storm", inside: "Act One", content: "Waves crash on the rocks." },
      ],
    });

    await page.goto("/");
    await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
    await page.goto("/login");
    await logIn(page, user);
    await expect(page.getByRole("heading", { level: 1, name: "Your projects" })).toBeVisible();

    await page.goto(`/app/projects/${seeded.projectId}`);
    await expect(page.getByRole("heading", { level: 1, name: "The Lighthouse" })).toBeVisible();
    await page.getByRole("link", { name: "The Storm", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Text of “The Storm”" })).toBeVisible();

    // Things that use inline style attributes, fonts, animations and the drawer.
    await page.getByRole("button", { name: /AI assistant/ }).click();
    await expect(page.getByRole("button", { name: "Run the scan" })).toBeVisible();
    await page.getByRole("radio", { name: "Dark" }).check();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // The fonts are served by the app itself and the policy lets them in.
    const fontsLoaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((font) => font.status === "loaded").length;
    });
    expect(fontsLoaded).toBeGreaterThan(0);

    expect(await violationsOf(page)).toEqual([]);
    expect(seen.problems).toEqual([]);
  });

  test("the login screen's own script (the theme, set before the first paint) is allowed", async ({
    page,
  }) => {
    const seen = await watch(page);
    await page.addInitScript(() => {
      localStorage.setItem("plotpal-theme", "dark");
    });
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await violationsOf(page)).toEqual([]);
    expect(seen.problems).toEqual([]);
  });
});
