import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { FindingCard } from "../components/molecules/FindingCard/FindingCard.tsx";
import { IdeaCard } from "../components/molecules/IdeaCard/IdeaCard.tsx";
import { ProjectListItem } from "../components/molecules/ProjectListItem/ProjectListItem.tsx";
import { OUTLINE_ENTER_LIMIT, OutlineNav } from "../components/organisms/OutlineNav/OutlineNav.tsx";
import type { OutlineNode } from "../lib/documents/use-outline.ts";
import { makeFinding, makeIdea } from "../test-support/analyses-handlers.ts";
import { answerProjectList, makeProject, projectPage } from "../test-support/projects-handlers.ts";
import { renderApp } from "../test-support/render-app.tsx";

// Lists rise in one after another: each item carries its place in the first screenful as `--enter-index`
// and the stylesheet delays it by that many steps. These tests check the numbers, not the look.
const enterIndexOf = (element: Element | null): string =>
  (element as HTMLElement | null)?.style.getPropertyValue("--enter-index") ?? "";

describe("the cards of the projects list", () => {
  it("a card on its own comes in at once", () => {
    render(
      <ul>
        <ProjectListItem projectId="a">A</ProjectListItem>
      </ul>,
    );
    expect(enterIndexOf(screen.getByRole("listitem"))).toBe("0");
  });

  it("the first ten come in one after another, and the rest all at once", async () => {
    const projects = Array.from({ length: 13 }, (_, index) =>
      makeProject({ title: `Project ${index + 1}` }),
    );
    answerProjectList(projectPage(projects));
    renderApp({ route: "/app", signedIn: true });
    await screen.findByRole("heading", { level: 3, name: "Project 1" });

    const items = [...document.querySelectorAll(".project-item")];
    expect(items).toHaveLength(13);
    expect(items.map(enterIndexOf)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "0",
      "0",
      "0",
    ]);
  });

  it("keeps the order the server gave, whatever the delays", async () => {
    answerProjectList(
      projectPage([makeProject({ title: "First" }), makeProject({ title: "Second" })]),
    );
    renderApp({ route: "/app", signedIn: true });
    await screen.findByRole("heading", { level: 3, name: "First" });
    const titles = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(titles).toEqual(["First", "Second"]);
  });
});

function node(id: string, children: OutlineNode[] = []): OutlineNode {
  return { id, title: id, position: 0, wordCount: 0, children } as unknown as OutlineNode;
}

describe("the outline", () => {
  it("numbers the items in reading order: an act, its scenes, then the next act", () => {
    render(
      <MemoryRouter>
        <OutlineNav
          nodes={[node("act-1", [node("s-1"), node("s-2")]), node("act-2", [node("s-3")])]}
          selectedId={undefined}
          onSelect={() => undefined}
        />
      </MemoryRouter>,
    );
    const items = [...document.querySelectorAll(".outline-nav__item")];
    expect(items.map((item) => item.querySelector("a")?.textContent)).toEqual([
      "act-1",
      "s-1",
      "s-2",
      "act-2",
      "s-3",
    ]);
    expect(items.map(enterIndexOf)).toEqual(["0", "1", "2", "3", "4"]);
  });

  it("does not delay the items after the first screenful any further", () => {
    const acts = Array.from({ length: 15 }, (_, index) => node(`act-${index}`));
    render(
      <MemoryRouter>
        <OutlineNav nodes={acts} selectedId={undefined} onSelect={() => undefined} />
      </MemoryRouter>,
    );
    const indexes = [...document.querySelectorAll(".outline-nav__item")].map((item) =>
      Number(enterIndexOf(item)),
    );
    expect(Math.max(...indexes)).toBe(OUTLINE_ENTER_LIMIT - 1);
    expect(indexes.slice(0, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe("the cards of an AI result", () => {
  it("a finding comes in after the ones before it, up to a limit", () => {
    const { rerender } = render(
      <ul>
        <FindingCard
          finding={makeFinding()}
          titles={new Map()}
          onOpenItem={() => undefined}
          index={3}
        />
      </ul>,
    );
    expect(enterIndexOf(document.querySelector(".finding-card"))).toBe("3");
    rerender(
      <ul>
        <FindingCard
          finding={makeFinding()}
          titles={new Map()}
          onOpenItem={() => undefined}
          index={40}
        />
      </ul>,
    );
    expect(enterIndexOf(document.querySelector(".finding-card"))).toBe("7");
  });

  it("an idea does the same, and a card without a place comes in first", () => {
    const { rerender } = render(
      <MemoryRouter>
        <ul>
          <IdeaCard idea={makeIdea()} titles={new Map()} onOpenItem={() => undefined} index={2} />
        </ul>
      </MemoryRouter>,
    );
    expect(enterIndexOf(document.querySelector(".idea-card"))).toBe("2");
    rerender(
      <MemoryRouter>
        <ul>
          <IdeaCard idea={makeIdea()} titles={new Map()} onOpenItem={() => undefined} />
        </ul>
      </MemoryRouter>,
    );
    expect(enterIndexOf(document.querySelector(".idea-card"))).toBe("0");
  });
});
