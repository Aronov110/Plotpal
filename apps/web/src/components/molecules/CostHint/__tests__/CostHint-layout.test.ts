import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// jsdom does no layout, so the real behaviour (the button under the hint does not move when the cost
// arrives) is checked in a browser (e2e/ai-panel.e2e.ts). These tests only pin the rules that make
// it work, so that nobody removes one by accident.
const css = readFileSync(
  join(process.cwd(), "src", "components", "molecules", "CostHint", "CostHint.css"),
  "utf8",
);

function ruleOf(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no rule for ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}

describe("the loading cost hint", () => {
  it("stacks the sample and the words in one place, so the sample sets the height", () => {
    expect(ruleOf(".cost-hint--loading")).toMatch(/display:\s*grid/);
    expect(ruleOf(".cost-hint--loading > *")).toMatch(/grid-area:\s*1\s*\/\s*1/);
  });

  it("keeps the sample invisible (but still taking room)", () => {
    expect(ruleOf(".cost-hint__sizer")).toMatch(/visibility:\s*hidden/);
  });
});
