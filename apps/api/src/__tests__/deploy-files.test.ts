import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadEnv } from "../config/env.ts";

// The files that put the API on Fly.io. They cannot be run in a unit test, so these tests pin the
// rules they must follow (pinned images, non-root, no secrets baked in, one port everywhere) and
// check that the settings in fly.toml are ones the API really accepts. Vitest runs from apps/api.
const ROOT = join(process.cwd(), "..", "..");
const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");

const dockerfile = read("apps/api/Dockerfile");
const dockerignore = read(".dockerignore");
const flyToml = read("fly.toml");

/** The lines of a Dockerfile that are not comments or blank. */
const instructions = dockerfile
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"));

/** One `[section]` of the TOML file, as text. */
function section(name: string): string {
  const start = flyToml.indexOf(`[${name}]`);
  if (start === -1) throw new Error(`fly.toml has no [${name}]`);
  const rest = flyToml.slice(start + name.length + 2);
  const next = rest.search(/^\[/m);
  return next === -1 ? rest : rest.slice(0, next);
}

/** The `KEY = "value"` pairs of a section. */
function pairs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of text.matchAll(
    /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?([^"\n#]*?)"?\s*(?:#.*)?$/gm,
  )) {
    out[match[1] as string] = match[2] as string;
  }
  return out;
}

const topLevel = pairs(flyToml.slice(0, flyToml.search(/^\[/m)));
const env = pairs(section("env"));
const service = pairs(section("http_service"));

describe("the Dockerfile", () => {
  const fromLines = instructions.filter((line) => line.startsWith("FROM "));

  it("has a build stage and a run stage", () => {
    expect(fromLines.length).toBeGreaterThanOrEqual(2);
  });

  it.each(fromLines)("pins its base image to an exact digest (%s)", (line) => {
    expect(line).toMatch(/@sha256:[0-9a-f]{64}/);
  });

  it("runs as a user that is not root", () => {
    const user = instructions.filter((line) => line.startsWith("USER "));
    expect(user.at(-1)).toBe("USER node");
    // It is set before the command that starts the server.
    expect(instructions.indexOf("USER node")).toBeLessThan(
      instructions.findIndex((line) => line.startsWith("CMD ")),
    );
  });

  it("has a health check on the health route, on the port the API listens on", () => {
    const check = instructions.find((line) => line.startsWith("HEALTHCHECK "));
    expect(check).toBeDefined();
    expect(check).toContain("/health");
  });

  it("never copies the whole folder in, so nothing unplanned can get into the image", () => {
    expect(instructions.filter((line) => /^(COPY|ADD)\s+(--\S+\s+)*\.\s/.test(line))).toEqual([]);
    expect(instructions.filter((line) => line.startsWith("ADD "))).toEqual([]);
  });

  it("puts no secret in an ENV or ARG line", () => {
    const setters = instructions.filter((line) => /^(ENV|ARG)\s/.test(line));
    for (const line of setters) {
      expect(line).not.toMatch(/SECRET|PASSWORD|TOKEN|API_KEY|DATABASE_URL/i);
    }
  });

  it("installs exactly what the lock file says, and only what production needs", () => {
    const install = instructions.find((line) => line.includes("bun install"));
    expect(install).toBeDefined();
    expect(install).toContain("--frozen-lockfile");
    expect(install).toContain("--production");
  });

  it("starts the server directly, not through a script that wants a .env file", () => {
    const command = instructions.find((line) => line.startsWith("CMD "));
    expect(command).toBe('CMD ["node", "src/server.ts"]');
  });

  it("runs from the API folder, where the migration command in fly.toml expects to be", () => {
    expect(instructions).toContain("WORKDIR /app/apps/api");
  });

  it("leaves the tests out of the image", () => {
    expect(dockerignore).toMatch(/^\*\*\/__tests__$/m);
    expect(dockerignore).toMatch(/^\*\*\/test-support$/m);
  });
});

describe(".dockerignore", () => {
  const rules = dockerignore
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));

  it("starts by leaving everything out, and then names what is let in", () => {
    expect(rules[0]).toBe("*");
    expect(rules.filter((rule) => rule.startsWith("!")).length).toBeGreaterThan(0);
  });

  it("lets in only what the API needs", () => {
    const allowed = rules.filter((rule) => rule.startsWith("!"));
    expect(allowed).toEqual(
      expect.arrayContaining([
        "!package.json",
        "!bun.lock",
        "!apps/api/package.json",
        "!apps/api/src",
        "!apps/api/drizzle",
      ]),
    );
  });

  it.each([".env", ".git", "node_modules", ".plans", "apps/web/src"])(
    "never lets %s in",
    (name) => {
      expect(rules.filter((rule) => rule.startsWith("!") && rule.includes(name))).toEqual([]);
    },
  );
});

describe("fly.toml", () => {
  it("runs in Tokyo, the nearest Fly region to the database in Seoul (Fly has none in Seoul)", () => {
    expect(topLevel.primary_region).toBe("nrt");
  });

  it("builds from the API's Dockerfile", () => {
    expect(pairs(section("build")).dockerfile).toBe("apps/api/Dockerfile");
    expect(existsSync(join(ROOT, "apps/api/Dockerfile"))).toBe(true);
  });

  it("stops the old machine with a signal the API handles, and waits long enough for it", () => {
    expect(topLevel.kill_signal).toBe("SIGTERM");
    // The API gives up after 25 seconds (see shutdown.ts).
    expect(Number(topLevel.kill_timeout)).toBeGreaterThanOrEqual(30);
  });

  it("listens on all addresses, on the port the proxy sends to and the image exposes", () => {
    expect(env.API_HOST).toBe("0.0.0.0");
    expect(env.API_PORT).toBe(service.internal_port);
    expect(dockerfile).toContain(`EXPOSE ${env.API_PORT}`);
  });

  it("starts in production with the AI off, two proxies trusted and a TLS database", () => {
    expect(env.NODE_ENV).toBe("production");
    expect(env.AI_ENABLED).toBe("false");
    expect(env.TRUST_PROXY).toBe("2");
    expect(env.DATABASE_SSL).toBe("on");
  });

  it("keeps secrets out of the file: they are set with `fly secrets set`", () => {
    for (const name of [
      "DATABASE_URL",
      "JWT_ACCESS_SECRET",
      "ANTHROPIC_API_KEY",
      "DATABASE_SSL_CA",
    ]) {
      expect(Object.keys(env)).not.toContain(name);
    }
    expect(flyToml).not.toMatch(/postgres(ql)?:\/\//);
  });

  it("is accepted by the API's own settings check, once the secrets are added", () => {
    const accepted = loadEnv({
      ...env,
      DATABASE_URL: "postgresql://user:pw@db.example.com:5432/postgres",
      JWT_ACCESS_SECRET: "k3Y7mQ2vX9bR5tN8wZ1cL6hD4fJ0sA3gUe7Pq2OxVn8Rb5Tm",
      CORS_ORIGINS: "https://plotpal.vercel.app",
    });
    expect(accepted.NODE_ENV).toBe("production");
    expect(accepted.TRUST_PROXY).toBe(2);
    expect(accepted.AI_ENABLED).toBe(false);
    expect(accepted.DOCS_ENABLED).toBe(false);
  });

  it("keeps one machine always running, so AI runs that live in the process are not stopped", () => {
    expect(service.auto_stop_machines).toBe("off");
    expect(service.min_machines_running).toBe("1");
  });

  it("sends only https, and checks the health route", () => {
    expect(service.force_https).toBe("true");
    const check = pairs(section("[http_service.checks]".slice(1, -1)));
    expect(check.path).toBe("/health");
    expect(check.method).toBe("GET");
  });

  it("applies the database migrations before each deploy, so a failed one stops the deploy", () => {
    const deploy = pairs(section("deploy"));
    expect(deploy.release_command).toBe("node src/db/migrate-cli.ts");
    expect(existsSync(join(ROOT, "apps/api/src/db/migrate-cli.ts"))).toBe(true);
  });
});
