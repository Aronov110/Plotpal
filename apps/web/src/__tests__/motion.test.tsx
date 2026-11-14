import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CheckingSession } from "../components/molecules/CheckingSession/CheckingSession.tsx";
import { AuthLayout } from "../components/templates/AuthLayout/AuthLayout.tsx";
import { renderApp } from "../test-support/render-app.tsx";

// How screens arrive: every screen's main part carries the fade-in class. Links between screens are
// plain links: no cross-fade of the whole page, which lost typed text in WebKit.
describe("every screen fades in", () => {
  it("the landing page", async () => {
    renderApp();
    expect(await screen.findByRole("main")).toHaveClass("page-enter");
  });

  it("the login and sign-up screens", () => {
    render(
      <AuthLayout title="Log in">
        <p>Form</p>
      </AuthLayout>,
    );
    expect(screen.getByRole("main")).toHaveClass("page-enter");
  });

  it("the page that waits for the login to be checked", () => {
    render(<CheckingSession />);
    expect(screen.getByRole("main")).toHaveClass("page-enter");
  });

  it("the page that is not found", async () => {
    renderApp({ route: "/nowhere" });
    expect(await screen.findByRole("main")).toHaveClass("page-enter");
  });

  it("the signed-in screens, with the frame around them", async () => {
    renderApp({ route: "/app", signedIn: true });
    expect(await screen.findByRole("heading", { level: 1, name: "Your projects" })).toBeVisible();
    expect(screen.getByRole("main")).toHaveClass("page-enter");
  });
});

describe("links between screens", () => {
  it("the landing page's links to log in and sign up are real links with real addresses", async () => {
    renderApp();
    expect(await screen.findByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute(
      "href",
      "/register",
    );
  });

  it("the signed-in frame's name of the app links home, and the project title opens the writing screen", async () => {
    renderApp({ route: "/app", signedIn: true });
    expect(await screen.findByRole("link", { name: "Plotpal" })).toHaveAttribute("href", "/app");
  });
});
