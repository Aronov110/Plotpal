import { expect, type Page, test } from "@playwright/test";
import {
  aiNext,
  createAccount,
  createProjectWithDocuments,
  releaseAi,
  type SeedDocument,
} from "./support/api-control.ts";
import { expectNoAxeViolations } from "./support/axe.ts";
import { logIn } from "./support/flows.ts";
import { uniqueUser } from "./support/users.ts";

// The API behind these tests answers with a fake AI model (see apps/api/src/test-support/e2e-server.ts):
// no key, no network, no cost. A test tells it what to do next with `aiNext`. The first poll of a
// run comes after two seconds, so waits for a result are generous.
const RESULT_TIMEOUT = 20_000;

const STORY: readonly SeedDocument[] = [
  { title: "Act One", content: "The lighthouse stands alone." },
  { title: "The Storm", inside: "Act One", content: "Waves crash on the rocks." },
];

const toggle = (page: Page) => page.getByRole("button", { name: /AI assistant/ });
const runButton = (page: Page) => page.getByRole("button", { name: "Run the scan" });
const findings = (page: Page) => page.getByRole("list", { name: "Findings" });

async function openStory(page: Page, request: Parameters<typeof createAccount>[0]) {
  const user = uniqueUser();
  await createAccount(request, user);
  const seeded = await createProjectWithDocuments(request, user, {
    title: "The Lighthouse",
    documents: STORY,
  });
  await page.goto("/login");
  await logIn(page, user);
  await page.goto(`/app/projects/${seeded.projectId}`);
  await expect(page.getByRole("heading", { level: 1, name: "The Lighthouse" })).toBeVisible();
  return { user, ...seeded };
}

test.describe("the plot-hole finder", () => {
  // A held run must never leak into the next test.
  test.afterEach(async ({ request }) => {
    await releaseAi(request);
  });

  test("is closed at first, and opens with the cost and the privacy notice beside Run", async ({
    page,
    request,
  }) => {
    await openStory(page, request);
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    await expect(runButton(page)).toBeHidden();

    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText(/Costs about/)).toBeVisible();
    await expect(page.getByText(/sent to Anthropic/)).toBeVisible();
    await expect(runButton(page)).toBeVisible();
    await expect(page.getByText("No earlier results.")).toBeVisible();
  });

  test("scans the whole project and shows findings whose quote links into the text", async ({
    page,
    request,
  }) => {
    await openStory(page, request);
    await toggle(page).click();
    await runButton(page).click();

    await expect(page.getByRole("progressbar", { name: "The scan is running" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel the scan" })).toBeVisible();

    await expect(findings(page)).toBeVisible({ timeout: RESULT_TIMEOUT });
    await expect(page.getByText("Found in your text.").first()).toBeVisible();
    await expect(page.getByText("The scan has finished.")).toBeAttached();

    // The quote is in "Act One": its link opens that item.
    await findings(page).getByRole("link", { name: "Act One" }).first().click();
    await expect(page).toHaveURL(/\?document=/);
    await expect(page.getByRole("textbox", { name: "Text of “Act One”" })).toHaveValue(
      "The lighthouse stands alone.",
    );
  });

  test("a finding's link moves the focus into the text, also when that item is already open", async ({
    page,
    request,
  }) => {
    await openStory(page, request);
    await page
      .getByRole("navigation", { name: "Outline" })
      .getByRole("link", { name: /Act One/ })
      .click();
    const text = page.getByRole("textbox", { name: "Text of “Act One”" });
    await expect(text).toBeFocused();

    await toggle(page).click();
    await runButton(page).click();
    await expect(findings(page)).toBeVisible({ timeout: RESULT_TIMEOUT });
    await expect(text).not.toBeFocused();

    // The fake quotes the start of "Act One", which is the item that is open.
    await findings(page).getByRole("link", { name: "Act One" }).first().click();
    await expect(page).toHaveURL(/\?document=/);
    await expect(text).toBeFocused();
  });

  test("reads the open item by default", async ({ page, request }) => {
    await openStory(page, request);
    await page
      .getByRole("navigation", { name: "Outline" })
      .getByRole("link", { name: /The Storm/ })
      .click();
    await expect(page.getByRole("textbox", { name: "Text of “The Storm”" })).toBeVisible();

    await toggle(page).click();
    await expect(page.getByRole("radio", { name: "The open item: “The Storm”" })).toBeChecked();
    await runButton(page).click();
    await expect(page.getByRole("heading", { level: 3, name: /^Scan of “The Storm”/ })).toBeVisible(
      { timeout: RESULT_TIMEOUT },
    );
  });

  test("can be cancelled while it runs", async ({ page, request }) => {
    await openStory(page, request);
    await aiNext(request, "hold");
    await toggle(page).click();
    await runButton(page).click();

    await page.getByRole("button", { name: "Cancel the scan" }).click();
    await expect(page.getByText("You cancelled this scan.")).toBeVisible();
    await expect(page.getByRole("progressbar")).toBeHidden();
    await expect(runButton(page)).toBeEnabled();
  });

  test("explains a scan the AI declined, in plain words", async ({ page, request }) => {
    await openStory(page, request);
    await aiNext(request, "refused");
    await toggle(page).click();
    await runButton(page).click();
    await expect(page.getByText(/The AI declined to read this text/)).toBeVisible({
      timeout: RESULT_TIMEOUT,
    });
  });

  test("finds a scan that is still running after the page is reloaded, and shows its result", async ({
    page,
    request,
  }) => {
    await openStory(page, request);
    await aiNext(request, "hold");
    await toggle(page).click();
    await runButton(page).click();
    await expect(page.getByRole("progressbar")).toBeVisible();

    await page.reload();
    await toggle(page).click();
    await expect(page.getByRole("progressbar")).toBeVisible();

    await releaseAi(request);
    await expect(findings(page)).toBeVisible({ timeout: RESULT_TIMEOUT });
  });

  test("keeps earlier results, which can be opened and deleted", async ({ page, request }) => {
    await openStory(page, request);
    await toggle(page).click();
    await runButton(page).click();
    await expect(findings(page)).toBeVisible({ timeout: RESULT_TIMEOUT });

    await page.reload();
    await toggle(page).click();
    await page.getByRole("button", { name: /^Open the scan of the whole project/ }).click();
    await expect(findings(page)).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: /^Scan of the whole project/ }),
    ).toBeFocused();

    await page.getByRole("button", { name: /^Delete the scan of the whole project/ }).click();
    await expect(page.getByRole("button", { name: "Keep scan" })).toBeFocused();
    await page.getByRole("button", { name: "Delete scan" }).click();
    await expect(page.getByText("No earlier results.")).toBeVisible();
  });

  test("works from the keyboard", async ({ page, request }) => {
    await openStory(page, request);
    await toggle(page).focus();
    await page.keyboard.press("Enter");
    await expect(runButton(page)).toBeVisible();
    await runButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(findings(page)).toBeVisible({ timeout: RESULT_TIMEOUT });
  });

  test("has no accessibility violations open, running and with a result", async ({
    page,
    request,
  }) => {
    await openStory(page, request);
    await aiNext(request, "hold");
    await toggle(page).click();
    await expectNoAxeViolations(page);

    await runButton(page).click();
    await expect(page.getByRole("progressbar")).toBeVisible();
    await expectNoAxeViolations(page);

    await releaseAi(request);
    await expect(findings(page)).toBeVisible({ timeout: RESULT_TIMEOUT });
    await expectNoAxeViolations(page);
  });
});

test.describe("an opened result leaves the list of earlier results", () => {
  test.afterEach(async ({ request }) => {
    await releaseAi(request);
  });

  const rows = (page: Page) => page.locator(".ai-panel__run");
  const topOfResult = (page: Page) => page.locator(".analysis-result__top");

  /** Two finished scans in the history, the panel open and no result shown. */
  async function withTwoEarlierResults(page: Page, request: Parameters<typeof createAccount>[0]) {
    await openStory(page, request);
    await toggle(page).click();
    for (let run = 0; run < 2; run += 1) {
      await runButton(page).click();
      await expect(findings(page)).toBeVisible({ timeout: RESULT_TIMEOUT });
      await page.getByRole("button", { name: "Close this result" }).click();
    }
    await page.reload();
    await toggle(page).click();
    await expect(rows(page)).toHaveCount(2);
  }

  test("Open takes the row out of the list and puts Delete beside Close; Close puts the row back", async ({
    page,
    request,
  }) => {
    await withTwoEarlierResults(page, request);
    const before = await rows(page).allTextContents();

    await page
      .getByRole("button", { name: /^Open the scan of/ })
      .first()
      .click();
    await expect(findings(page)).toBeVisible();
    await expect(rows(page)).toHaveCount(1);

    const close = topOfResult(page).getByRole("button", { name: "Close this result" });
    const remove = topOfResult(page).getByRole("button", { name: /^Delete the scan of/ });
    await expect(close).toBeVisible();
    await expect(remove).toBeVisible();
    // The other row keeps its own Delete, so two Delete buttons exist: one up here, one down there.
    await expect(page.getByRole("button", { name: /^Delete the scan of/ })).toHaveCount(2);

    await close.click();
    await expect(rows(page)).toHaveCount(2);
    expect(await rows(page).allTextContents()).toEqual(before);
    await expect(page.getByRole("button", { name: /^Open the scan of/ }).first()).toBeFocused();
  });

  test("Delete at the top asks first, Keep changes nothing, and Delete removes the result for good", async ({
    page,
    request,
  }) => {
    await withTwoEarlierResults(page, request);
    await page
      .getByRole("button", { name: /^Open the scan of/ })
      .first()
      .click();
    await expect(findings(page)).toBeVisible();

    await topOfResult(page)
      .getByRole("button", { name: /^Delete the scan of/ })
      .click();
    await expect(page.getByRole("button", { name: "Keep scan" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Keep scan" })).toHaveCount(0);
    await expect(
      topOfResult(page).getByRole("button", { name: /^Delete the scan of/ }),
    ).toBeFocused();
    await expect(findings(page)).toBeVisible();

    await topOfResult(page)
      .getByRole("button", { name: /^Delete the scan of/ })
      .click();
    await page.getByRole("button", { name: "Delete scan" }).click();
    await expect(findings(page)).toHaveCount(0);
    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 3, name: "Earlier results" })).toBeFocused();

    await page.reload();
    await toggle(page).click();
    await expect(rows(page)).toHaveCount(1);
  });

  test("works from the keyboard alone", async ({ page, request }) => {
    await withTwoEarlierResults(page, request);
    await page
      .getByRole("button", { name: /^Open the scan of/ })
      .first()
      .focus();
    await page.keyboard.press("Enter");
    await expect(findings(page)).toBeVisible();
    await topOfResult(page).getByRole("button", { name: "Close this result" }).focus();
    await page.keyboard.press("Enter");
    await expect(rows(page)).toHaveCount(2);
    await expect(page.getByRole("button", { name: /^Open the scan of/ }).first()).toBeFocused();
  });

  test.describe("on a phone-sized screen (320 px wide)", () => {
    test.use({ viewport: { width: 320, height: 700 } });

    test("the two buttons wrap without making the page scroll sideways", async ({
      page,
      request,
    }) => {
      await withTwoEarlierResults(page, request);
      await page
        .getByRole("button", { name: /^Open the scan of/ })
        .first()
        .click();
      await expect(findings(page)).toBeVisible();
      await expect(
        topOfResult(page).getByRole("button", { name: /^Delete the scan of/ }),
      ).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test.describe(`in ${colorScheme} mode`, () => {
      test.use({ colorScheme });

      test("has no accessibility violations with a result open and its delete question showing", async ({
        page,
        request,
      }) => {
        await withTwoEarlierResults(page, request);
        await page
          .getByRole("button", { name: /^Open the scan of/ })
          .first()
          .click();
        await expect(findings(page)).toBeVisible();
        await expectNoAxeViolations(page);

        await topOfResult(page)
          .getByRole("button", { name: /^Delete the scan of/ })
          .click();
        await expect(page.getByRole("button", { name: "Keep scan" })).toBeVisible();
        await expectNoAxeViolations(page);
      });
    });
  }
});
