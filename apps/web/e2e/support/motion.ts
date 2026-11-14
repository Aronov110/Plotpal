import type { Page } from "@playwright/test";

/**
 * Waits until every animation and transition that has an end has ended. Ones that never end (a
 * spinner, a progress bar) are left running.
 *
 * Use it after something opens or slides in, before clicking inside it: while a panel is still
 * growing, what is inside it is moving, and a press can land on something that moved by the time the
 * button is released (the click then goes to the wrong element). A person cannot click that fast;
 * a test can.
 */
export async function waitForAnimationsToEnd(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter((animation) => {
      const iterations = animation.effect?.getComputedTiming().iterations;
      return iterations !== undefined && Number.isFinite(iterations);
    });
    await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
  });
}
