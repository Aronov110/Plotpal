import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// jsdom does no layout, so the real position of the title is checked in a browser
// (e2e/toolbar-title.e2e.ts). These tests only pin the rules that make it work, so that nobody
// removes one by accident.
const css = readFileSync(
  join(process.cwd(), "src", "components", "organisms", "ItemToolbar", "ItemToolbar.css"),
  "utf8",
);

function ruleOf(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no rule for ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}

describe("the toolbar's title (a fieldset legend)", () => {
  it("is floated across the box, which puts it inside the border instead of cutting the border", () => {
    const rule = ruleOf(".item-toolbar__legend");
    expect(rule).toMatch(/float:\s*left/);
    expect(rule).toMatch(/width:\s*100%/);
  });

  it("has no padding of its own, so it lines up with the buttons under it", () => {
    expect(ruleOf(".item-toolbar__legend")).toMatch(/padding:\s*0;/);
  });

  it("is followed by content that starts below it, whatever the mode", () => {
    expect(ruleOf(".item-toolbar__legend + *")).toMatch(/clear:\s*both/);
  });
});

describe("the space under the buttons", () => {
  it("keeps one reserved line for the status, so that nothing jumps when 'Working…' appears", () => {
    expect(ruleOf(".item-toolbar__status")).toMatch(/min-height:\s*1\.5em/);
  });

  it("is smaller than before: no large bottom padding on the box", () => {
    expect(ruleOf(".item-toolbar")).toMatch(/padding:[^;]*var\(--space-2\);/);
  });
});
