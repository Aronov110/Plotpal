import { act, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../test-support/a11y.ts";
import { answerOutline } from "../test-support/documents-handlers.ts";
import { server } from "../test-support/msw-server.ts";
import { makeProject } from "../test-support/projects-handlers.ts";
import { renderApp } from "../test-support/render-app.tsx";
import { deferred } from "../test-support/session-harness.ts";

// The writing screen is loaded on demand. This holds its file back until the test lets it go, and
// counts how often the app asked for it.
const file = vi.hoisted(() => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release, asked: 0 };
});

vi.mock("../components/pages/WritingPage/WritingPage.tsx", async (importOriginal) => {
  file.asked += 1;
  await file.promise;
  return importOriginal<typeof import("../components/pages/WritingPage/WritingPage.tsx")>();
});

const PROJECT = makeProject({ id: "project-1", title: "The Lighthouse" });

describe("the writing screen is loaded on demand", () => {
  it.each([
    ["the landing page", "/", false],
    ["the login page", "/login", false],
    ["the sign-up page", "/register", false],
    ["the list of projects", "/app", true],
    ["a page that does not exist", "/nothing-here", false],
  ])("is not asked for by %s", async (_name, route, signedIn) => {
    const before = file.asked;
    server.use(http.get("/projects", () => HttpResponse.json({ items: [], nextCursor: null })));
    renderApp({ route, signedIn });
    await screen.findByRole("heading", { level: 1 });
    expect(file.asked).toBe(before);
  });

  it("shows the frame and a loading status while the file is on its way, then the screen, with the focus on its heading", async () => {
    const project = deferred<undefined>();
    server.use(
      http.get("/projects", () => HttpResponse.json({ items: [PROJECT], nextCursor: null })),
      http.get("/projects/:id", async () => {
        await project.promise;
        return HttpResponse.json(PROJECT);
      }),
    );
    answerOutline([]);
    // From the list of projects, as a person gets there: opening the app straight on an address leaves
    // the focus to the browser, so only a move inside the app shows what RouteFocus does.
    const { container, user } = renderApp({ route: "/app", signedIn: true });
    await user.click(await screen.findByRole("link", { name: "The Lighthouse" }));

    // The file has not arrived: the header of the app is there, and a status says what is going on.
    expect(await screen.findByRole("status")).toHaveTextContent("Opening your project");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    await expectNoA11yViolations(container);

    // The file arrives: the screen's own heading appears and takes the focus.
    await act(async () => {
      file.release();
    });
    const opening = await screen.findByRole("heading", { level: 1, name: "Opening your project" });
    await waitFor(() => expect(opening).toHaveFocus());

    await act(async () => {
      project.resolve(undefined);
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: "The Lighthouse" }),
    ).toBeInTheDocument();
  });

  it("asked for the file once the person went to a project", () => {
    expect(file.asked).toBeGreaterThanOrEqual(1);
  });
});
