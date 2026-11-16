import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoPageA11yViolations } from "../../../../test-support/a11y.ts";
import { renderApp } from "../../../../test-support/render-app.tsx";

const SECTIONS = ["What Plotpal is", "What it does", "Your writing and the AI"] as const;

const THINGS_IT_DOES = [
  /Outline and write\./,
  /No lost work between tabs\./,
  /Plot-hole finder and idea generator\./,
] as const;

async function openAbout(options: { signedIn?: boolean } = {}) {
  const view = renderApp({ route: "/about", ...options });
  await screen.findByRole("heading", { level: 1, name: "About Plotpal" });
  return view;
}

describe("AboutPage", () => {
  it("has one level-one heading and one main landmark", async () => {
    await openAbout();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("is titled in the tab", async () => {
    await openAbout();
    expect(document.title).toBe("About – Plotpal");
  });

  it("has the three sections, in order, as level-two headings", async () => {
    await openAbout();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([...SECTIONS]);
  });

  it("says what Plotpal is", async () => {
    await openAbout();
    expect(
      screen.getByText(/a place to plan and write a story/i, { exact: false }),
    ).toBeInTheDocument();
  });

  it.each(THINGS_IT_DOES)("lists what it does: %s", async (lead) => {
    await openAbout();
    const list = screen.getByRole("list");
    expect(list).toHaveTextContent(lead);
  });

  it("lists exactly three things it does", async () => {
    await openAbout();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("says that a quote that is not in the manuscript is marked, because that is what the app does", async () => {
    await openAbout();
    expect(document.body).toHaveTextContent(/not really there is clearly marked as not found/i);
    // The app keeps such a quote and labels it; it never removes it, so the page must not say it does.
    expect(document.body).not.toHaveTextContent(/thrown away/i);
  });

  it("says where the text goes when the AI is run", async () => {
    await openAbout();
    expect(document.body).toHaveTextContent(
      /Your projects belong to your account\. When you run an AI scan, the text you pick is sent to the AI provider to produce the result\./,
    );
  });

  it("offers one link, back to the home page, and none that leave the site", async () => {
    await openAbout();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("Go to the home page");
    expect(links[0]).toHaveAttribute("href", "/");
  });

  it("offers the colour theme choice", async () => {
    await openAbout();
    expect(screen.getByRole("group", { name: "Colour theme" })).toBeInTheDocument();
  });

  it("has no accessibility violations as a page", async () => {
    await openAbout();
    await expectNoPageA11yViolations();
  });

  describe("for someone who is signed in", () => {
    it("shows the same page, and does not send them to their projects", async () => {
      await openAbout({ signedIn: true });
      expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(SECTIONS.length);
    });

    it("has no accessibility violations as a page", async () => {
      await openAbout({ signedIn: true });
      await expectNoPageA11yViolations();
    });
  });
});
