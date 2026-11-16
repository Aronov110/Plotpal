import { act, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { expectNoPageA11yViolations } from "../../../../test-support/a11y.ts";
import { setCookie } from "../../../../test-support/cookies.ts";
import { server } from "../../../../test-support/msw-server.ts";
import {
  answerProjectList,
  makeProject,
  problemResponse,
  projectPage,
} from "../../../../test-support/projects-handlers.ts";
import { renderApp } from "../../../../test-support/render-app.tsx";
import { deferred } from "../../../../test-support/session-harness.ts";

const DEMO_USER = {
  id: "demo-user-1",
  email: "demo-0123456789abcdef01234567@demo.plotpal.invalid",
  displayName: "Demo visitor",
};
const SESSION = { user: DEMO_USER, accessToken: "demo-access", expiresIn: 900 };

/** The fake API makes a demo account, and the projects list shows the sample story in it. */
function demoWorks() {
  let calls = 0;
  server.use(
    http.post("/auth/demo", () => {
      calls += 1;
      return HttpResponse.json(SESSION, { status: 201 });
    }),
  );
  answerProjectList(projectPage([makeProject({ title: "The Last Light", format: "prose" })]));
  return { calls: () => calls };
}

function demoFails(status: number, headers: Record<string, string> = {}) {
  server.use(
    http.post("/auth/demo", () => problemResponse(status, "demo-unavailable", {}, headers)),
  );
}

const demoButton = () => screen.findByRole("button", { name: "Try the demo" });

/** The demo's own status line. The login page has another one, for its form, so it is looked up inside the demo's group. */
const demoStatus = () =>
  within(screen.getByRole("group", { name: "Demo account" })).getByRole("status");

describe.each([
  ["the home page", "/"],
  ["the login page", "/login"],
])("DemoButton on %s", (_name, route) => {
  it("offers a Try the demo button, and says what it means before it is pressed", async () => {
    renderApp({ route });
    const button = await demoButton();
    expect(button).toHaveAccessibleDescription(
      "No sign-up needed. A sample story is ready, and it is deleted after 24 hours.",
    );
  });

  it("signs the visitor in and opens their projects, with the sample story there", async () => {
    const { calls } = demoWorks();
    const { user } = renderApp({ route });
    await user.click(await demoButton());

    expect(
      await screen.findByRole("heading", { level: 1, name: "Your projects" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("The Last Light")).toBeInTheDocument();
    expect(screen.getByText("Demo visitor")).toBeInTheDocument();
    expect(calls()).toBe(1);
  });

  it("moves the focus to the heading of the projects screen", async () => {
    demoWorks();
    const { user } = renderApp({ route });
    await user.click(await demoButton());
    // The heading is in the page a moment before the app's own effect moves the focus onto it.
    const heading = await screen.findByRole("heading", { level: 1, name: "Your projects" });
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
  });

  it("says it is working, keeps its place, and sends only one request however often it is pressed", async () => {
    const gate = deferred<undefined>();
    let calls = 0;
    server.use(
      http.post("/auth/demo", async () => {
        calls += 1;
        await gate.promise;
        return HttpResponse.json(SESSION, { status: 201 });
      }),
    );
    answerProjectList(projectPage([]));
    const { user } = renderApp({ route });
    const button = await demoButton();

    await user.click(button);
    await user.click(button);
    await user.click(button);

    expect(await screen.findByText("Setting up your demo…")).toBeInTheDocument();
    expect(demoStatus()).toHaveTextContent("Setting up your demo…");
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAccessibleName("Try the demo");
    expect(calls).toBe(1);

    gate.resolve(undefined);
    expect(await screen.findByRole("heading", { name: "Your projects" })).toBeInTheDocument();
    expect(calls).toBe(1);
  });

  it("sends one request even when two presses arrive before the screen has updated", async () => {
    // Both presses run inside one batch, so the second one sees a button that does not look busy yet:
    // only the component's own guard stops it.
    const gate = deferred<undefined>();
    let calls = 0;
    server.use(
      http.post("/auth/demo", async () => {
        calls += 1;
        await gate.promise;
        return HttpResponse.json(SESSION, { status: 201 });
      }),
    );
    answerProjectList(projectPage([]));
    renderApp({ route });
    const button = await demoButton();

    act(() => {
      button.click();
      button.click();
    });
    await waitFor(() => {
      expect(calls).toBeGreaterThanOrEqual(1);
    });
    gate.resolve(undefined);
    expect(await screen.findByRole("heading", { name: "Your projects" })).toBeInTheDocument();
    expect(calls).toBe(1);
  });

  describe("when it fails", () => {
    it.each([
      [404, {}, "The demo is switched off at the moment. You can still create an account."],
      [503, {}, "The demo is full right now. Try again in a few minutes, or create an account."],
      [
        429,
        { "retry-after": "120" },
        "Too many demos were started just now. Try again in 2 minutes, or create an account.",
      ],
      [500, {}, "The demo could not be started. Please try again."],
    ])("tells the visitor in words for a %i", async (status, headers, words) => {
      demoFails(status, headers);
      const { user } = renderApp({ route });
      await user.click(await demoButton());

      expect(await screen.findByRole("alert")).toHaveTextContent(words);
    });

    it("says the connection is the problem when there is no answer at all", async () => {
      server.use(http.post("/auth/demo", () => HttpResponse.error()));
      const { user } = renderApp({ route });
      await user.click(await demoButton());
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Can't reach the server. Check your connection and try again.",
      );
    });

    it("keeps the visitor on the same screen, signed out, with the button ready to press again", async () => {
      demoFails(503);
      const { user } = renderApp({ route });
      const button = await demoButton();
      await user.click(button);
      await screen.findByRole("alert");

      expect(screen.queryByRole("heading", { name: "Your projects" })).not.toBeInTheDocument();
      expect(button).not.toHaveAttribute("aria-busy");
      expect(demoStatus()).toBeEmptyDOMElement();
      expect(button).toBeEnabled();
    });

    it("clears the message when the visitor tries again, and gets in if it works this time", async () => {
      demoFails(503);
      const { user } = renderApp({ route });
      await user.click(await demoButton());
      await screen.findByRole("alert");

      demoWorks();
      await user.click(screen.getByRole("button", { name: "Try the demo" }));

      expect(await screen.findByRole("heading", { name: "Your projects" })).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("gives the general message, and logs the cause, for an answer it does not understand", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      server.use(
        http.post("/auth/demo", () => HttpResponse.json({ nonsense: true }, { status: 201 })),
      );
      const { user } = renderApp({ route });
      await user.click(await demoButton());

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "The demo could not be started. Please try again.",
      );
      expect(log).toHaveBeenCalled();
      log.mockRestore();
    });

    it("never shows the server's own words", async () => {
      server.use(
        http.post("/auth/demo", () =>
          problemResponse(503, "demo-unavailable", { detail: "internal stack trace" }),
        ),
      );
      const { user } = renderApp({ route });
      await user.click(await demoButton());
      expect(await screen.findByRole("alert")).not.toHaveTextContent("internal");
    });

    it("has no accessibility violations while the message is shown", async () => {
      demoFails(503);
      const { user } = renderApp({ route });
      await user.click(await demoButton());
      await screen.findByRole("alert");
      await expectNoPageA11yViolations();
    });
  });

  it("has no accessibility violations before it is pressed", async () => {
    renderApp({ route });
    await demoButton();
    await expectNoPageA11yViolations();
  });
});

describe("DemoButton on the login page after being sent there", () => {
  it("goes to the projects, not to the saved address, which belongs to nobody in a new account", async () => {
    demoWorks();
    const { user } = renderApp({
      route: { pathname: "/login", state: { from: "/app/projects/not-in-this-account" } },
    });
    await user.click(await demoButton());

    expect(
      await screen.findByRole("heading", { level: 1, name: "Your projects" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("The Last Light")).toBeInTheDocument();
  });
});

describe("DemoButton for someone who is already signed in", () => {
  it("is not offered on the home page", async () => {
    renderApp({ signedIn: true });
    await screen.findByRole("link", { name: "Go to your projects" });
    expect(screen.queryByRole("button", { name: "Try the demo" })).not.toBeInTheDocument();
  });
});

describe("DemoButton while the app checks for a login", () => {
  it("is not shown yet on the home page, so nothing flickers", async () => {
    const gate = deferred<undefined>();
    setCookie("csrf_token", "code-1");
    server.use(
      http.post("/auth/refresh", async () => {
        await gate.promise;
        return HttpResponse.json({ user: DEMO_USER, accessToken: "t", expiresIn: 900 });
      }),
    );
    answerProjectList(projectPage([]));
    renderApp();
    expect(screen.getByRole("heading", { level: 1, name: "Plotpal" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try the demo" })).not.toBeInTheDocument();
    gate.resolve(undefined);
    await screen.findByRole("link", { name: "Go to your projects" });
  });
});

describe("DemoButton and the login page's own form", () => {
  it("does not take the place of the login form, which keeps its own button", async () => {
    renderApp({ route: "/login" });
    await demoButton();
    const form = screen.getByRole("button", { name: "Log in" }).closest("form");
    expect(form).not.toBeNull();
    expect(within(form as HTMLElement).queryByRole("button", { name: "Try the demo" })).toBeNull();
  });
});
