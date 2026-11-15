import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../../../lib/auth/session.tsx";
import { expectNoPageA11yViolations } from "../../../../test-support/a11y.ts";
import { RouteErrorBoundary } from "../RouteErrorBoundary.tsx";

function Broken({ message = "kaboom" }: { readonly message?: string }): ReactElement {
  throw new Error(message);
}

function renderBoundary(children: ReactElement, onReload = vi.fn()) {
  const view = render(
    <AuthProvider>
      <MemoryRouter>
        <RouteErrorBoundary onReload={onReload}>{children}</RouteErrorBoundary>
      </MemoryRouter>
    </AuthProvider>,
  );
  return { ...view, onReload, user: userEvent.setup() };
}

describe("RouteErrorBoundary", () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // React reports an error that a boundary catches; the tests read that instead of printing it.
    logged = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows its children when nothing goes wrong", () => {
    renderBoundary(<p>All well</p>);
    expect(screen.getByText("All well")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("replaces a screen that fails to show with a message and a way to try again", () => {
    renderBoundary(<Broken />);
    expect(
      screen.getByRole("heading", { level: 1, name: "This screen could not load" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload the page" })).toBeInTheDocument();
  });

  it("explains in plain words, without the technical message", () => {
    renderBoundary(<Broken message="secret internal detail" />);
    expect(screen.getByText(/poor connection/i)).toBeInTheDocument();
    expect(screen.queryByText(/secret internal detail/)).toBeNull();
  });

  it("reloads the page when the button is pressed", async () => {
    const { user, onReload } = renderBoundary(<Broken />);
    await user.click(screen.getByRole("button", { name: "Reload the page" }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("puts the focus on the heading, because the screen that had it is gone", () => {
    renderBoundary(<Broken />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
  });

  it("keeps the way out: the app's header, with its link to the projects", () => {
    renderBoundary(<Broken />);
    expect(screen.getByRole("link", { name: /plotpal/i })).toHaveAttribute("href", "/app");
  });

  it("does not swallow the error: it writes it to the console itself, for whoever looks", () => {
    renderBoundary(<Broken message="kaboom" />);
    // React also reports a caught error, so the boundary's own line is what is looked for.
    const seen = logged.mock.calls.some(
      (call: unknown[]) =>
        call[0] === "A screen could not be shown:" &&
        call[1] instanceof Error &&
        call[1].message === "kaboom",
    );
    expect(seen).toBe(true);
  });

  it("is a page without accessibility problems", async () => {
    renderBoundary(<Broken />);
    await expectNoPageA11yViolations();
  });
});
