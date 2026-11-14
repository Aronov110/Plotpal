import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../../../test-support/a11y.ts";
import { LoadingState } from "../LoadingState.tsx";

describe("LoadingState", () => {
  it("says in words what is loading, as a status, so that a screen reader is told", () => {
    render(<LoadingState label="Loading your projects…" shape="cards" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading your projects…");
    expect(screen.getByText("Loading your projects…")).toBeInTheDocument();
  });

  it("keeps the words out of sight, because the skeleton shows that something is loading", () => {
    render(<LoadingState label="Loading the outline…" shape="outline" />);
    expect(screen.getByText("Loading the outline…")).toHaveClass("visually-hidden");
  });

  it("hides the skeleton from screen readers", () => {
    const { container } = render(<LoadingState label="Loading…" shape="lines" />);
    expect(container.querySelector(".skeleton")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("status")).toHaveTextContent(/^Loading…$/);
  });

  it("passes the shape and the count on", () => {
    const { container } = render(<LoadingState label="Loading…" shape="outline" count={4} />);
    expect(container.querySelectorAll(".skeleton__row")).toHaveLength(4);
  });

  it("marks the area as busy", () => {
    render(<LoadingState label="Loading…" shape="lines" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("shows the label as plain text", () => {
    const { container } = render(<LoadingState label="<b>x</b>" shape="lines" />);
    expect(container.querySelector("b")).toBeNull();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<LoadingState label="Loading…" shape="paper" />);
    await expectNoA11yViolations(container);
  });
});
