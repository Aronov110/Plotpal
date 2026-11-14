import { afterEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../../test-support/test-app.ts";

// The /docs page and the API description are for developers. A live API should not advertise
// itself, so they are off by default in production and on only when someone asks (DOCS_ENABLED).

const DOCS_URLS = ["/docs", "/docs/", "/docs/openapi.json", "/docs/openapi.yaml"] as const;
const production = { NODE_ENV: "production", CORS_ORIGINS: "https://app.example.com" } as const;

const apps: ReturnType<typeof buildTestApp>[] = [];
function appWith(env: Record<string, string>) {
  const app = buildTestApp({ env });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("with docs off (the default in production)", () => {
  it.each(DOCS_URLS)("%s is not there", async (url) => {
    const app = appWith(production);
    const response = await app.inject({ method: "GET", url });
    expect(response.statusCode).toBe(404);
  });

  it("answers with a plain 404, not with the API description or the docs page", async () => {
    const app = appWith(production);
    const response = await app.inject({ method: "GET", url: "/docs/openapi.json" });
    // The 404 repeats the address that was asked for, so the word "openapi" may appear; the
    // description itself (its version line, its list of paths) must not.
    expect(response.body.includes('"paths"')).toBe(false);
    expect(response.body.includes("3.1.0")).toBe(false);
    expect(response.body.includes("Plotpal API")).toBe(false);
    expect(JSON.stringify(response.headers).includes("scalar")).toBe(false);
    expect(response.headers["content-type"]).toContain("application/problem+json");
  });

  it("is also off when DOCS_ENABLED=false is set outside production", async () => {
    const app = appWith({ DOCS_ENABLED: "false" });
    expect((await app.inject({ method: "GET", url: "/docs/openapi.json" })).statusCode).toBe(404);
  });

  it("still serves the API itself", async () => {
    const app = appWith(production);
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
  });
});

describe("with docs on", () => {
  it.each(["/docs/", "/docs/openapi.json", "/docs/openapi.yaml"])(
    "%s works by default outside production",
    async (url) => {
      const app = appWith({});
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(200);
    },
  );

  it("works in production when it is switched on on purpose", async () => {
    const app = appWith({ ...production, DOCS_ENABLED: "true" });
    expect((await app.inject({ method: "GET", url: "/docs/openapi.json" })).statusCode).toBe(200);
  });
});
