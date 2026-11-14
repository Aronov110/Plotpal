import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../../../test-support/a11y.ts";
import { Skeleton } from "../Skeleton.tsx";

describe("Skeleton", () => {
  it("is decoration: hidden from screen readers, with no text of its own", () => {
    const { container } = render(<Skeleton shape="lines" />);
    const root = container.firstElementChild;
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root).toHaveTextContent("");
  });

  it.each([
    ["lines", 3, ".skeleton__bar"],
    ["cards", 3, ".skeleton__card"],
    ["outline", 5, ".skeleton__row"],
  ] as const)("draws %s the number of times asked for", (shape, count, selector) => {
    const { container } = render(<Skeleton shape={shape} count={count} />);
    expect(container.querySelectorAll(selector)).toHaveLength(count);
    expect(container.firstElementChild).toHaveClass(`skeleton--${shape}`);
  });

  it("draws the paper of the editor with a title and some lines", () => {
    const { container } = render(<Skeleton shape="paper" />);
    expect(container.querySelector(".skeleton__title")).not.toBeNull();
    expect(container.querySelectorAll(".skeleton__bar").length).toBeGreaterThanOrEqual(4);
  });

  it("has a few of each by default, and never a huge number even when asked for one", () => {
    const { container, rerender } = render(<Skeleton shape="lines" />);
    expect(container.querySelectorAll(".skeleton__bar").length).toBeGreaterThan(0);
    rerender(<Skeleton shape="lines" count={500} />);
    expect(container.querySelectorAll(".skeleton__bar").length).toBeLessThanOrEqual(12);
    rerender(<Skeleton shape="lines" count={0} />);
    expect(container.querySelectorAll(".skeleton__bar")).toHaveLength(1);
  });

  it("does not shimmer for people who ask for less motion, and appears only after a short wait", () => {
    // Vitest blanks CSS files other than tokens.css, so the stylesheet is read directly.
    const css = readFileSync(
      join(process.cwd(), "src", "components", "atoms", "Skeleton", "Skeleton.css"),
      "utf8",
    );
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none/);
    // A fast answer never shows it: it fades in after a delay.
    expect(css).toMatch(/animation:[^;]*skeleton-reveal[^;]*\b150ms\b/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<Skeleton shape="cards" count={2} />);
    await expectNoA11yViolations(container);
  });
});
