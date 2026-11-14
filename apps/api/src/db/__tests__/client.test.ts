import { describe, expect, it, vi } from "vitest";
import type { DatabaseEnv } from "../../config/env.ts";
import { createDatabase, databaseOptions } from "../client.ts";

const url = "postgres://user:pw@127.0.0.1:5432/app_test";

describe("createDatabase", () => {
  it("attaches an error listener so a broken idle connection cannot crash the process", async () => {
    const { pool, close } = createDatabase(url, { onPoolError: () => {} });
    try {
      expect(pool.listenerCount("error")).toBeGreaterThan(0);
      expect(() => pool.emit("error", new Error("idle client broke"))).not.toThrow();
    } finally {
      await close();
    }
  });

  it("passes pool errors to the supplied handler", async () => {
    const onPoolError = vi.fn();
    const { pool, close } = createDatabase(url, { onPoolError });
    try {
      const failure = new Error("connection terminated");
      pool.emit("error", failure);

      expect(onPoolError).toHaveBeenCalledTimes(1);
      expect(onPoolError).toHaveBeenCalledWith(failure);
    } finally {
      await close();
    }
  });

  it("logs the message by default, and never the connection string", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { pool, close } = createDatabase(url);
    try {
      pool.emit("error", new Error("boom"));

      expect(spy).toHaveBeenCalledTimes(1);
      const logged = JSON.stringify(spy.mock.calls);
      expect(logged).toContain("boom");
      expect(logged).not.toContain("pw@");
      expect(logged).not.toContain(url);
    } finally {
      spy.mockRestore();
      await close();
    }
  });

  it("does not open a connection until the first query", async () => {
    const { pool, close } = createDatabase(url);
    try {
      expect(pool.totalCount).toBe(0);
    } finally {
      await close();
    }
  });
});

const PEM = "-----BEGIN CERTIFICATE-----\nMIIBszCCAVmgAwIBAgIUabc\n-----END CERTIFICATE-----\n";

function databaseEnv(overrides: Partial<DatabaseEnv> = {}): DatabaseEnv {
  return {
    NODE_ENV: "production",
    DATABASE_URL: url,
    DATABASE_SSL: "off",
    DATABASE_SSL_CA: undefined,
    DATABASE_POOL_MAX: 10,
    ...overrides,
  };
}

describe("databaseOptions (what the settings mean for the connection)", () => {
  it("has no TLS when it is off, so the local database works as before", () => {
    expect(databaseOptions(databaseEnv()).ssl).toBeUndefined();
  });

  it("checks the server's certificate when TLS is on", () => {
    expect(databaseOptions(databaseEnv({ DATABASE_SSL: "on" })).ssl).toEqual({
      rejectUnauthorized: true,
    });
  });

  it("trusts the given certificate authority, and still checks the certificate", () => {
    expect(databaseOptions(databaseEnv({ DATABASE_SSL: "on", DATABASE_SSL_CA: PEM })).ssl).toEqual({
      rejectUnauthorized: true,
      ca: PEM,
    });
  });

  it("never switches the certificate check off", () => {
    for (const env of [
      databaseEnv({ DATABASE_SSL: "on" }),
      databaseEnv({ DATABASE_SSL: "on", DATABASE_SSL_CA: PEM }),
    ]) {
      const ssl = databaseOptions(env).ssl;
      expect(ssl).toMatchObject({ rejectUnauthorized: true });
    }
  });

  it("passes the pool size on", () => {
    expect(databaseOptions(databaseEnv({ DATABASE_POOL_MAX: 3 })).max).toBe(3);
  });
});

describe("createDatabase: settings reach the pool", () => {
  it("uses the pool size and the TLS settings it is given", async () => {
    const { pool, close } = createDatabase(url, {
      max: 4,
      ssl: { rejectUnauthorized: true, ca: PEM },
    });
    try {
      expect(pool.options.max).toBe(4);
      expect(pool.options.ssl).toEqual({ rejectUnauthorized: true, ca: PEM });
    } finally {
      await close();
    }
  });

  it("has no TLS and the default pool size when it is given nothing", async () => {
    const { pool, close } = createDatabase(url);
    try {
      expect(pool.options.ssl).toBeUndefined();
      expect(pool.options.max).toBe(10);
    } finally {
      await close();
    }
  });

  it("sets the time zone before a connection is handed out, with no start-up option", async () => {
    // Connection poolers such as Supabase's refuse start-up options they do not know, and a command
    // sent in the background would run alongside the first real query (pg 9 refuses that).
    const { pool, close } = createDatabase(url);
    try {
      expect(pool.options.options).toBeUndefined();
      expect(pool.options.Client).toBeTypeOf("function");
      expect(pool.options.Client?.name).toBe("UtcClient");
    } finally {
      await close();
    }
  });
});
