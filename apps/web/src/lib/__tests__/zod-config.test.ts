import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// The page is served under a Content Security Policy without 'unsafe-eval'. Zod would otherwise probe
// whether it may compile fast validators with `new Function`, and the browser reports that probe as a
// violation even though Zod catches the error. `jitless` makes it skip the probe.

describe("Zod without run-time compiling", () => {
  it("is switched on by the module the app loads first", async () => {
    await import("../zod-config.ts");
    expect(z.config().jitless).toBe(true);
  });

  it("still validates", async () => {
    await import("../zod-config.ts");
    const schema = z.object({ name: z.string().min(1), age: z.number().int().optional() });
    expect(schema.safeParse({ name: "Ada", age: 36 }).success).toBe(true);
    expect(schema.safeParse({ name: "" }).success).toBe(false);
    expect(schema.safeParse({ name: "Ada", age: 1.5 }).success).toBe(false);
  });

  it("never compiles code from a string while it validates", async () => {
    await import("../zod-config.ts");
    const calls: unknown[][] = [];
    const real = globalThis.Function;
    globalThis.Function = new Proxy(real, {
      construct(target, args, newTarget) {
        calls.push(args);
        return Reflect.construct(target, args, newTarget);
      },
    });
    try {
      z.object({ a: z.string(), b: z.array(z.number()) }).parse({ a: "x", b: [1, 2, 3] });
    } finally {
      globalThis.Function = real;
    }
    expect(calls).toEqual([]);
  });
});

describe("main.tsx", () => {
  it("loads that module before the app, so it is set before the first schema is made", () => {
    const main = readFileSync(join(process.cwd(), "src", "main.tsx"), "utf8");
    const config = main.indexOf('"./lib/zod-config.ts"');
    const app = main.indexOf('"./App.tsx"');
    expect(config).toBeGreaterThan(-1);
    expect(app).toBeGreaterThan(-1);
    expect(config).toBeLessThan(app);
  });
});
