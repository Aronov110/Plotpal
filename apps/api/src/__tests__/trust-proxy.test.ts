import { afterEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../test-support/test-app.ts";

// Behind Vercel and Fly the connection comes from a proxy, so the API must read the visitor's
// address from X-Forwarded-For. It must read exactly as many hops from the right as there are
// proxies it trusts: an address the visitor makes up (on the left) must never be believed.

const apps: ReturnType<typeof buildTestApp>[] = [];

function appWith(trustProxy: string | undefined, extra: Record<string, string> = {}) {
  const app = buildTestApp({
    env: { ...(trustProxy === undefined ? {} : { TRUST_PROXY: trustProxy }), ...extra },
    routes: (scope) => {
      scope.get("/__ip", { config: { rateLimit: false } }, async (request) => ({
        ip: request.ip,
      }));
    },
  });
  apps.push(app);
  return app;
}

async function ipSeen(
  app: ReturnType<typeof buildTestApp>,
  forwardedFor: string | undefined,
  remoteAddress = "10.0.0.5",
): Promise<string> {
  const response = await app.inject({
    method: "GET",
    url: "/__ip",
    remoteAddress,
    ...(forwardedFor === undefined ? {} : { headers: { "x-forwarded-for": forwardedFor } }),
  });
  return (response.json() as { ip: string }).ip;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("the visitor's address", () => {
  it("is the address of the connection when no proxy is trusted (the default)", async () => {
    const app = appWith(undefined);
    expect(await ipSeen(app, "203.0.113.7")).toBe("10.0.0.5");
  });

  it("is the address of the connection with TRUST_PROXY=0 even when a header says otherwise", async () => {
    const app = appWith("0");
    expect(await ipSeen(app, "203.0.113.7, 198.51.100.9")).toBe("10.0.0.5");
  });

  it("is the one the last proxy saw with one trusted proxy", async () => {
    const app = appWith("1");
    expect(await ipSeen(app, "203.0.113.7")).toBe("203.0.113.7");
  });

  it("with one trusted proxy, ignores addresses the visitor put in front of it", async () => {
    const app = appWith("1");
    expect(await ipSeen(app, "1.2.3.4, 203.0.113.7")).toBe("203.0.113.7");
  });

  it("is the visitor, two proxies away, with two trusted proxies (Vercel, then Fly)", async () => {
    const app = appWith("2");
    expect(await ipSeen(app, "203.0.113.7, 198.51.100.9")).toBe("203.0.113.7");
  });

  it("with two trusted proxies, ignores an address made up in front of the real chain", async () => {
    const app = appWith("2");
    expect(await ipSeen(app, "1.1.1.1, 203.0.113.7, 198.51.100.9")).toBe("203.0.113.7");
    expect(await ipSeen(app, "9.9.9.9, 1.1.1.1, 203.0.113.7, 198.51.100.9")).toBe("203.0.113.7");
  });

  it("falls back to the connection when there is no header at all", async () => {
    const app = appWith("2");
    expect(await ipSeen(app, undefined)).toBe("10.0.0.5");
  });

  it("copes with a short chain: all of it trusted gives its first address", async () => {
    const app = appWith("2");
    expect(await ipSeen(app, "203.0.113.7")).toBe("203.0.113.7");
  });

  it("copes with an IPv6 visitor", async () => {
    const app = appWith("2");
    expect(await ipSeen(app, "2001:db8::1, 198.51.100.9")).toBe("2001:db8::1");
  });
});

describe("the rate limit is kept per visitor", () => {
  const limited = { RATE_LIMIT_MAX: "2", RATE_LIMIT_WINDOW_SECONDS: "60" };

  async function status(
    app: ReturnType<typeof buildTestApp>,
    forwardedFor: string,
  ): Promise<number> {
    const response = await app.inject({
      method: "GET",
      url: "/projects",
      remoteAddress: "10.0.0.5",
      headers: { "x-forwarded-for": forwardedFor },
    });
    return response.statusCode;
  }

  it("with proxies trusted, a second visitor still has their own allowance", async () => {
    const app = appWith("2", limited);
    const a = "203.0.113.7, 198.51.100.9";
    const b = "203.0.113.8, 198.51.100.9";
    expect([await status(app, a), await status(app, a), await status(app, a)]).toEqual([
      401, 401, 429,
    ]);
    expect(await status(app, b)).toBe(401);
  });

  it("without it, every visitor behind the proxy shares one allowance (the problem this fixes)", async () => {
    const app = appWith("0", limited);
    const a = "203.0.113.7, 198.51.100.9";
    const b = "203.0.113.8, 198.51.100.9";
    expect([await status(app, a), await status(app, a)]).toEqual([401, 401]);
    expect(await status(app, b)).toBe(429);
  });

  it("an address made up in front of the real chain does not get a fresh allowance", async () => {
    const app = appWith("2", limited);
    const real = "203.0.113.7, 198.51.100.9";
    await status(app, real);
    await status(app, real);
    expect(await status(app, `1.1.1.1, ${real}`)).toBe(429);
    expect(await status(app, `2.2.2.2, ${real}`)).toBe(429);
  });
});
