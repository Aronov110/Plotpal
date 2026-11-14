import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { Analysis } from "../../../../lib/api/analyses-api.ts";
import { expectNoA11yViolations } from "../../../../test-support/a11y.ts";
import {
  makeAnalysis,
  makeFailed,
  makeFinding,
  makeSucceeded,
} from "../../../../test-support/analyses-handlers.ts";
import { AnalysisResult, type AnalysisResultProps } from "../AnalysisResult.tsx";

const TITLES = new Map([["doc-1", "The harbour"]]);

function renderResult(
  analysis: Analysis,
  onClose: () => void = () => undefined,
  onOpenItem: (id: string) => void = () => undefined,
) {
  return render(
    <MemoryRouter>
      <AnalysisResult
        analysis={analysis}
        titles={TITLES}
        onClose={onClose}
        onOpenItem={onOpenItem}
      />
    </MemoryRouter>,
  );
}

describe("AnalysisResult", () => {
  it("names what was read and when, in the heading", () => {
    renderResult(
      makeSucceeded([makeFinding()], {
        scope: "document",
        documentId: "doc-1",
        createdAt: "2026-11-12T10:05:00.000Z",
      }),
    );
    expect(
      screen.getByRole("heading", { level: 3, name: /^Scan of “The harbour”, / }),
    ).toBeInTheDocument();
  });

  it("says the whole project for a run on everything", () => {
    renderResult(makeSucceeded([makeFinding()]));
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
      "Scan of the whole project",
    );
  });

  it("shows the summary, the facts, a caution and the findings in a list", () => {
    renderResult(
      makeSucceeded(
        [
          makeFinding({ title: "First", severity: "major" }),
          makeFinding({ title: "Second", severity: "minor" }),
        ],
        {
          result: {
            summary: "Two things do not add up.",
            findings: [
              makeFinding({ title: "First", severity: "major" }),
              makeFinding({ title: "Second", severity: "minor" }),
            ],
            read: { items: 2, characters: 525 },
          },
        },
      ),
    );
    expect(screen.getByText("Two things do not add up.")).toBeInTheDocument();
    expect(
      screen.getByText(/Less than a page of text\. 2 findings: 1 major, 1 minor\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/The AI can be wrong\. Check each finding/)).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Findings" });
    expect(list.querySelectorAll(":scope > li")).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 4, name: "First" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Second" })).toBeInTheDocument();
  });

  it("keeps the order the AI gave, most serious first", () => {
    renderResult(makeSucceeded([makeFinding({ title: "Zebra" }), makeFinding({ title: "Apple" })]));
    const titles = screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent);
    expect(titles).toEqual(["Zebra", "Apple"]);
  });

  it("says plainly that nothing was found, without promising the story is sound", () => {
    renderResult(makeSucceeded([]));
    expect(screen.getByText(/No plot holes were found\./)).toHaveTextContent(
      "The AI can miss things, so this is not a promise that the story is sound.",
    );
    expect(screen.queryByRole("list", { name: "Findings" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Check each finding/)).not.toBeInTheDocument();
  });

  it("says what happened to a run that did not finish, in its own words", () => {
    renderResult(makeFailed("timeout"));
    expect(screen.getByText(/The scan took too long and was stopped\./)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Findings" })).not.toBeInTheDocument();
  });

  it("says you cancelled a cancelled run", () => {
    renderResult(makeFailed("canceled"));
    expect(screen.getByText("You cancelled this scan.")).toBeInTheDocument();
  });

  it("does not show the code of a failure", () => {
    renderResult(makeFailed("overloaded"));
    expect(screen.queryByText(/overloaded/)).not.toBeInTheDocument();
  });

  it("closes when the button is pressed", async () => {
    const onClose = vi.fn();
    renderResult(makeSucceeded([]), onClose);
    await userEvent.click(screen.getByRole("button", { name: "Close this result" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("passes on which item a finding's link opens", async () => {
    const onOpenItem = vi.fn();
    renderResult(
      makeSucceeded([
        makeFinding({ evidence: [{ documentId: "doc-1", quote: "A quote.", verified: true }] }),
      ]),
      () => undefined,
      onOpenItem,
    );
    await userEvent.click(screen.getByRole("link", { name: "The harbour" }));
    expect(onOpenItem).toHaveBeenCalledWith("doc-1");
  });

  it("does not show a run that is still going as finished", () => {
    renderResult(makeAnalysis());
    expect(screen.getByText("The scan did not finish. Please try again.")).toBeInTheDocument();
  });

  it("has a heading that can take the focus", () => {
    renderResult(makeSucceeded([]));
    expect(screen.getByRole("heading", { level: 3 })).toHaveAttribute("tabindex", "-1");
  });

  it("has no accessibility violations", async () => {
    const { container } = renderResult(makeSucceeded([makeFinding(), makeFinding()]));
    await expectNoA11yViolations(container);
    const failed = renderResult(makeFailed("refused"));
    await expectNoA11yViolations(failed.container);
  });
});

describe("AnalysisResult: deleting from the top", () => {
  function renderWith(extra: Partial<AnalysisResultProps>) {
    return render(
      <MemoryRouter>
        <AnalysisResult
          analysis={makeSucceeded([])}
          titles={TITLES}
          onClose={() => undefined}
          onOpenItem={() => undefined}
          {...extra}
        />
      </MemoryRouter>,
    );
  }

  const top = (): HTMLElement => {
    const element = screen.getByRole("heading", { level: 3 }).closest(".analysis-result__top");
    if (!(element instanceof HTMLElement)) throw new Error("no top part");
    return element;
  };

  it("has no Delete button when nobody can delete it", () => {
    renderWith({});
    expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
  });

  it("puts Delete next to Close at the top, named for the result", () => {
    renderWith({ onDelete: () => undefined, deleteLabel: "Delete the scan of the whole project" });
    expect(within(top()).getByRole("button", { name: "Close this result" })).toBeVisible();
    expect(
      within(top()).getByRole("button", { name: "Delete the scan of the whole project" }),
    ).toBeVisible();
    expect(within(top()).getByRole("button", { name: /Delete/ })).toHaveTextContent("Delete");
  });

  it("asks to delete when the button is pressed", async () => {
    const onDelete = vi.fn();
    renderWith({ onDelete, deleteLabel: "Delete the scan" });
    await userEvent.click(screen.getByRole("button", { name: "Delete the scan" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("hands its Delete button to the panel, so that focus can come back to it", () => {
    const deleteRef = { current: null as HTMLButtonElement | null };
    renderWith({ onDelete: () => undefined, deleteLabel: "Delete the scan", deleteRef });
    expect(deleteRef.current).toBe(screen.getByRole("button", { name: "Delete the scan" }));
  });

  it("shows a question under the buttons, not among them", () => {
    renderWith({
      onDelete: () => undefined,
      deleteLabel: "Delete the scan",
      confirmation: <p>Are you sure?</p>,
    });
    const question = screen.getByText("Are you sure?");
    expect(top()).not.toContainElement(question);
    expect(top().compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
