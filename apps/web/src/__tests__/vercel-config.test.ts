import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import viteConfig from "../../vite.config.ts";
import { createApiProxy } from "../lib/dev-proxy.ts";

// vercel.json is what Vercel reads: where /auth and /projects go (to the API on Fly, so that the
// browser sees ONE address: the login cookies only work on one), how the page is protected, and how
// it is cached. It cannot run in a unit test, so these tests pin the rules, and the browser test
// csp.e2e.ts runs the real app under the same headers. Vitest runs from apps/web.
const WEB = process.cwd();
const ROOT = join(WEB, "..", "..");

interface Rewrite {
  readonly source: string;
  readonly destination: string;
}
interface HeaderRule {
  readonly source: string;
  readonly headers: readonly { readonly key: string; readonly value: string }[];
}
const config = JSON.parse(readFileSync(join(WEB, "vercel.json"), "utf8")) as {
  rewrites: Rewrite[];
  headers: HeaderRule[];
};

const flyApp = /^app\s*=\s*"([^"]+)"/m.exec(readFileSync(join(ROOT, "fly.toml"), "utf8"))?.[1];
const API_ORIGIN = `https://${flyApp}.fly.dev`;

function headersFor(source: string): Record<string, string> {
  const rule = config.headers.find((entry) => entry.source === source);
  if (rule === undefined) throw new Error(`no header rule for ${source}`);
  return Object.fromEntries(rule.headers.map((header) => [header.key, header.value]));
}

/** `default-src 'self'; script-src 'self'` as `{ "default-src": ["'self'"], ... }`. */
function directives(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part !== "")
      .map((part) => {
        const [name = "", ...sources] = part.split(/\s+/);
        return [name, sources];
      }),
  );
}

describe("the rewrites to the API", () => {
  const apiRewrites = config.rewrites.slice(0, -1);

  it("send each API area to the API on Fly, whose name is the one in fly.toml", () => {
    expect(flyApp).toBeTruthy();
    for (const rewrite of apiRewrites) {
      expect(rewrite.destination.startsWith(`${API_ORIGIN}/`)).toBe(true);
    }
  });

  it("keep the path as it is (the API has no /api prefix, and the cookies are for /)", () => {
    for (const rewrite of apiRewrites) {
      const area = rewrite.source.split("/")[1];
      expect(rewrite.source).toBe(`/${area}/:path*`);
      expect(rewrite.destination).toBe(`${API_ORIGIN}/${area}/:path*`);
    }
  });

  it("cover every area the development proxy forwards, so the two cannot drift apart", () => {
    const areas = Object.keys(createApiProxy(undefined)).map((key) => {
      const match = /^\^\/([a-z-]+)\(/.exec(key);
      if (match === null) throw new Error(`unexpected proxy key ${key}`);
      return match[1];
    });
    expect(areas.length).toBeGreaterThanOrEqual(2);
    expect(apiRewrites.map((rewrite) => rewrite.source.split("/")[1]).sort()).toEqual(
      [...areas].sort(),
    );
  });

  it("come before the fallback to the page, which would otherwise swallow them", () => {
    const fallback = config.rewrites.at(-1);
    expect(fallback).toEqual({ source: "/(.*)", destination: "/index.html" });
    expect(config.rewrites.length).toBeGreaterThanOrEqual(3);
  });

  it("do not swallow an address the page itself uses", () => {
    const routes = readFileSync(join(WEB, "src", "routes.tsx"), "utf8");
    const paths = [...routes.matchAll(/path="([^"]+)"/g)].map((match) => match[1] ?? "");
    expect(paths.length).toBeGreaterThanOrEqual(5);
    for (const rewrite of apiRewrites) {
      const area = `/${rewrite.source.split("/")[1]}`;
      expect(paths.filter((path) => path === area || path.startsWith(`${area}/`))).toEqual([]);
    }
  });
});

describe("the security headers", () => {
  const all = headersFor("/(.*)");

  it("has the policy that only lets the page load what it is made of", () => {
    const policy = directives(all["Content-Security-Policy"] ?? "");
    expect(policy["default-src"]).toEqual(["'self'"]);
    expect(policy["script-src"]).toEqual(["'self'"]);
    expect(policy["connect-src"]).toEqual(["'self'"]);
    expect(policy["font-src"]).toEqual(["'self'"]);
    expect(policy["object-src"]).toEqual(["'none'"]);
    expect(policy["base-uri"]).toEqual(["'none'"]);
    expect(policy["frame-ancestors"]).toEqual(["'none'"]);
    expect(policy["form-action"]).toEqual(["'self'"]);
  });

  it("never allows inline or evaluated scripts, or any source on the whole web", () => {
    const text = all["Content-Security-Policy"] ?? "";
    expect(text).not.toContain("'unsafe-eval'");
    expect(text).not.toMatch(/\*/);
    expect(text).not.toMatch(/https?:/);
    const scripts = directives(text)["script-src"] ?? [];
    expect(scripts).not.toContain("'unsafe-inline'");
  });

  it("allows inline style attributes only (the page sets a few through React), not style tags", () => {
    const policy = directives(all["Content-Security-Policy"] ?? "");
    expect(policy["style-src"]).toEqual(["'self'"]);
    expect(policy["style-src-attr"]).toEqual(["'unsafe-inline'"]);
  });

  it("is a policy the built page can satisfy: no inline script and no style tag in index.html", () => {
    const html = readFileSync(join(WEB, "index.html"), "utf8");
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((match) => match[1] ?? "");
    expect(scripts.length).toBeGreaterThan(0);
    for (const attributes of scripts) expect(attributes).toContain("src=");
    expect(html).not.toMatch(/<style\b/);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it("makes the browser use https for two years, and refuses framing and guessing types", () => {
    expect(all["Strict-Transport-Security"]).toMatch(/max-age=(\d+)/);
    const maxAge = Number(/max-age=(\d+)/.exec(all["Strict-Transport-Security"] ?? "")?.[1]);
    expect(maxAge).toBeGreaterThanOrEqual(31_536_000);
    expect(all["X-Content-Type-Options"]).toBe("nosniff");
    expect(all["X-Frame-Options"]).toBe("DENY");
    expect(all["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(all["Cross-Origin-Opener-Policy"]).toBe("same-origin");
  });

  it("switches off the browser features the app never uses", () => {
    const policy = all["Permissions-Policy"] ?? "";
    for (const feature of ["camera", "microphone", "geolocation", "payment", "usb"]) {
      expect(policy).toContain(`${feature}=()`);
    }
  });
});

describe("caching", () => {
  it("keeps the built files, whose names change with their content, for a year", () => {
    expect(headersFor("/assets/(.*)")["Cache-Control"]).toBe("public, max-age=31536000, immutable");
  });

  it("makes the browser check the page itself every time, so a new version is seen at once", () => {
    expect(headersFor("/(.*)")["Cache-Control"]).toBe("public, max-age=0, must-revalidate");
  });
});

describe("the same headers in the preview server the browser tests use", () => {
  it("are served by `vite preview`, so the end-to-end suite can run the app under them", () => {
    const resolved = (
      viteConfig as unknown as (env: { mode: string; command: string }) => {
        preview: { headers?: Record<string, string> };
      }
    )({ mode: "test", command: "serve" });
    expect(resolved.preview.headers).toEqual(headersFor("/(.*)"));
  });
});
