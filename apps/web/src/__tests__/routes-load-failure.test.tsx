import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../test-support/render-app.tsx";

// The file of the writing screen cannot be loaded (the network is down, or the file is gone after a
// new version went live): what the person sees.
vi.mock("../components/pages/WritingPage/WritingPage.tsx", () => ({
  // Reading the screen from the file fails, as loading a file that is gone does.
  get WritingPage(): never {
    throw new Error("the file is gone");
  },
}));

describe("when the file of the writing screen cannot be loaded", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a message with a way to try again, instead of a blank page", async () => {
    renderApp({ route: "/app/projects/project-1", signedIn: true });
    expect(
      await screen.findByRole("heading", { level: 1, name: "This screen could not load" }),
    ).toHaveFocus();
    expect(screen.getByRole("button", { name: "Reload the page" })).toBeInTheDocument();
  });

  it("keeps the header, so the person can still leave or sign out", async () => {
    const { user } = renderApp({ route: "/app/projects/project-1", signedIn: true });
    await screen.findByRole("heading", { level: 1, name: "This screen could not load" });
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: /plotpal/i }));
    expect(
      await screen.findByRole("heading", { level: 1, name: /your projects/i }),
    ).toBeInTheDocument();
  });

  it("leaves the other screens alone", async () => {
    renderApp({ route: "/login" });
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByText("This screen could not load")).toBeNull();
  });
});
