import { expect, type Locator, type Page, test } from "@playwright/test";
import { createAccount, createProjectWithDocuments } from "./support/api-control.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import { logIn } from "./support/flows.ts";
import { uniqueUser } from "./support/users.ts";

// The title of the item toolbar ("Actions for “…”") is the legend of a fieldset. By default a browser
// draws a legend ON the top border and cuts the border around it. Here it must sit inside the box.

const LONG_TITLE = "A very long title that has to wrap onto several lines on a small screen";

async function openItem(
  page: Page,
  request: Parameters<typeof createAccount>[0],
  title: string,
): Promise<Locator> {
  const user = uniqueUser();
  await createAccount(request, user);
  const seeded = await createProjectWithDocuments(request, user, {
    title: "The Lighthouse",
    documents: [
      { title: "Act One", content: "The lighthouse stands alone." },
      { title: "Scene A", inside: "Act One", content: "The keeper climbs the stairs." },
      { title, inside: "Act One", content: "Waves crash on the rocks." },
    ],
  });
  await page.goto("/login");
  await logIn(page, user);
  await page.goto(`/app/projects/${seeded.projectId}`);
  await page
    .getByRole("navigation", { name: "Outline" })
    .getByRole("link", { name: title, exact: true })
    .click();
  const toolbar = page.getByRole("group", { name: `Actions for “${title}”` });
  await expect(toolbar).toBeVisible();
  return toolbar;
}

/** Where the title is, compared with the box around it and with what comes after it. */
async function geometry(toolbar: Locator) {
  return toolbar.evaluate((box) => {
    const legend = box.querySelector(".item-toolbar__legend");
    const next = legend?.nextElementSibling;
    if (legend === null || legend === undefined || next === null || next === undefined) {
      throw new Error("no title or no content after it");
    }
    const style = getComputedStyle(box);
    const b = box.getBoundingClientRect();
    const l = legend.getBoundingClientRect();
    const n = next.getBoundingClientRect();
    return {
      insideTop: l.top - (b.top + Number.parseFloat(style.borderTopWidth)),
      insideLeft: l.left - (b.left + Number.parseFloat(style.borderLeftWidth)),
      insideRight: b.right - Number.parseFloat(style.borderRightWidth) - l.right,
      gapToContent: n.top - l.bottom,
      // Where the first letter of the title starts, compared with where the content under it starts.
      indent: l.left + Number.parseFloat(getComputedStyle(legend).paddingLeft) - n.left,
    };
  });
}

function expectInsideAndAbove(g: Awaited<ReturnType<typeof geometry>>): void {
  // Inside: below the top border line (a legend on the border has its top above that line).
  expect(g.insideTop).toBeGreaterThanOrEqual(0);
  expect(g.insideLeft).toBeGreaterThanOrEqual(0);
  expect(g.insideRight).toBeGreaterThanOrEqual(0);
  // Above what comes after it, without overlapping.
  expect(g.gapToContent).toBeGreaterThanOrEqual(0);
  // Lined up with the content under it, not pushed in.
  expect(Math.abs(g.indent)).toBeLessThanOrEqual(1);
}

test.describe("the toolbar's title", () => {
  test.use({ viewport: { width: 1200, height: 800 } });

  test("sits inside the box, above the buttons", async ({ page, request }) => {
    const toolbar = await openItem(page, request, "The Vault");
    expectInsideAndAbove(await geometry(toolbar));
  });

  test("sits inside the box above the rename form too", async ({ page, request }) => {
    const toolbar = await openItem(page, request, "The Vault");
    await toolbar.getByRole("button", { name: "Rename", exact: true }).click();
    await expect(toolbar.getByRole("textbox")).toBeVisible();
    expectInsideAndAbove(await geometry(toolbar));
  });

  test("sits inside the box above the delete question too", async ({ page, request }) => {
    const toolbar = await openItem(page, request, "The Vault");
    await toolbar.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(toolbar.getByRole("button", { name: "Keep item" })).toBeVisible();
    expectInsideAndAbove(await geometry(toolbar));
  });

  test("leaves no big empty strip under the buttons", async ({ page, request }) => {
    const toolbar = await openItem(page, request, "The Vault");
    const gap = await toolbar.evaluate((box) => {
      const buttons = box.querySelector(".item-toolbar__buttons")?.getBoundingClientRect();
      if (buttons === undefined) throw new Error("no buttons");
      return box.getBoundingClientRect().bottom - buttons.bottom;
    });
    expect(gap).toBeLessThanOrEqual(40);
  });

  test("keeps its height when 'Working…' shows and goes", async ({ page, request }) => {
    const toolbar = await openItem(page, request, "The Vault");
    const height = (await toolbar.boundingBox())?.height ?? 0;
    await toolbar.getByRole("button", { name: "Move up", exact: true }).click();
    await page.waitForTimeout(200);
    expect(Math.abs(((await toolbar.boundingBox())?.height ?? 0) - height)).toBeLessThanOrEqual(1);
  });
});

test.describe("on a phone-sized screen (320 px wide)", () => {
  test.use({ viewport: { width: 320, height: 700 } });

  test("a long title wraps inside the box and the page does not scroll sideways", async ({
    page,
    request,
  }) => {
    const toolbar = await openItem(page, request, LONG_TITLE);
    expectInsideAndAbove(await geometry(toolbar));
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`in ${colorScheme} mode`, () => {
    test.use({ colorScheme, viewport: { width: 1200, height: 800 } });

    test("has no accessibility violations with the buttons and with the delete question", async ({
      page,
      request,
    }) => {
      const toolbar = await openItem(page, request, "The Vault");
      await expectNoAxeViolations(page);
      await toolbar.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(toolbar.getByRole("button", { name: "Keep item" })).toBeVisible();
      await expectNoAxeViolations(page);
    });
  });
}
