import { describe, expect, it } from "vitest";
import { EnvValidationError, loadDatabaseEnv, loadEnv } from "../config/env.ts";

const databaseUrl = "postgres://user:pass@127.0.0.1:5432/db";
const secret = "k3Y7mQ2vX9bR5tN8wZ1cL6hD4fJ0sA3gUe7Pq2OxVn8Rb5Tm";
const base = { NODE_ENV: "development", JWT_ACCESS_SECRET: secret, DATABASE_URL: databaseUrl };
const production = {
  ...base,
  NODE_ENV: "production",
  CORS_ORIGINS: "https://app.example.com",
};
const PEM = "-----BEGIN CERTIFICATE-----\nMIIBszCCAVmgAwIBAgIUabc\n-----END CERTIFICATE-----\n";

describe("TRUST_PROXY (how many proxies stand between the visitor and the API)", () => {
  it("is 0 by default: the address of the connection is the visitor", () => {
    expect(loadEnv(base).TRUST_PROXY).toBe(0);
  });

  it.each([
    ["1", 1],
    ["2", 2],
    ["10", 10],
  ])("accepts %s", (value, expected) => {
    expect(loadEnv({ ...base, TRUST_PROXY: value }).TRUST_PROXY).toBe(expected);
  });

  it.each(["-1", "abc", "1.5", "", " 2", "2 ", "11", "true", "0x2"])("rejects %j", (value) => {
    expect(() => loadEnv({ ...base, TRUST_PROXY: value })).toThrow(EnvValidationError);
  });

  it("names the setting in the problem", () => {
    try {
      loadEnv({ ...base, TRUST_PROXY: "abc" });
      expect.unreachable();
    } catch (error) {
      expect((error as EnvValidationError).issues.join(" ")).toContain("TRUST_PROXY");
    }
  });
});

describe("DOCS_ENABLED (the /docs page and the API description)", () => {
  it.each(["development", "test"])("is on by default in %s", (nodeEnv) => {
    expect(loadEnv({ ...base, NODE_ENV: nodeEnv }).DOCS_ENABLED).toBe(true);
  });

  it("is off by default in production", () => {
    expect(loadEnv(production).DOCS_ENABLED).toBe(false);
  });

  it("can be switched on in production on purpose", () => {
    expect(loadEnv({ ...production, DOCS_ENABLED: "true" }).DOCS_ENABLED).toBe(true);
  });

  it("can be switched off in development", () => {
    expect(loadEnv({ ...base, DOCS_ENABLED: "false" }).DOCS_ENABLED).toBe(false);
  });

  it.each(["yes", "1", "TRUE", ""])("rejects %j", (value) => {
    expect(() => loadEnv({ ...base, DOCS_ENABLED: value })).toThrow(EnvValidationError);
  });
});

describe("database TLS (Supabase only talks encrypted)", () => {
  it("is off by default, so the local database works as before", () => {
    const env = loadEnv(base);
    expect(env.DATABASE_SSL).toBe("off");
    expect(env.DATABASE_SSL_CA).toBeUndefined();
  });

  it("can be switched on", () => {
    expect(loadEnv({ ...base, DATABASE_SSL: "on" }).DATABASE_SSL).toBe("on");
  });

  it.each(["true", "require", "ON", "verify-full", ""])("rejects DATABASE_SSL=%j", (value) => {
    expect(() => loadEnv({ ...base, DATABASE_SSL: value })).toThrow(EnvValidationError);
  });

  it("takes the certificate authority as pasted text", () => {
    const env = loadEnv({ ...base, DATABASE_SSL: "on", DATABASE_SSL_CA: PEM });
    expect(env.DATABASE_SSL_CA).toBe(PEM);
  });

  it("turns the two-character sequence backslash-n into a real new line, as a pasted secret has", () => {
    const pasted = PEM.replaceAll("\n", "\\n");
    expect(loadEnv({ ...base, DATABASE_SSL: "on", DATABASE_SSL_CA: pasted }).DATABASE_SSL_CA).toBe(
      PEM,
    );
  });

  it("treats an empty certificate setting as none", () => {
    expect(loadEnv({ ...base, DATABASE_SSL: "on", DATABASE_SSL_CA: "" }).DATABASE_SSL_CA).toBe(
      undefined,
    );
  });

  it.each([
    "not a certificate",
    "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
    "-----BEGIN CERTIFICATE-----\nno end",
  ])("rejects text that is not a certificate (%j)", (value) => {
    expect(() => loadEnv({ ...base, DATABASE_SSL: "on", DATABASE_SSL_CA: value })).toThrow(
      EnvValidationError,
    );
  });

  it("refuses a certificate when TLS is off, because it would be ignored without a word", () => {
    expect(() => loadEnv({ ...base, DATABASE_SSL: "off", DATABASE_SSL_CA: PEM })).toThrow(
      /DATABASE_SSL_CA/,
    );
  });

  it.each(["?sslmode=require", "?ssl=true", "?foo=1&sslmode=disable"])(
    "refuses an address that carries its own TLS settings (%s), so there is one way to set it",
    (query) => {
      expect(() => loadEnv({ ...base, DATABASE_URL: `${databaseUrl}${query}` })).toThrow(
        /DATABASE_SSL/,
      );
    },
  );

  it("never puts the certificate or the address into a problem message", () => {
    try {
      loadEnv({ ...base, DATABASE_SSL: "off", DATABASE_SSL_CA: PEM });
      expect.unreachable();
    } catch (error) {
      const text = (error as EnvValidationError).message;
      expect(text).not.toContain("MIIB");
      expect(text).not.toContain("pass@");
    }
  });
});

describe("DATABASE_POOL_MAX (how many connections the API may open)", () => {
  it("is 10 by default", () => {
    expect(loadEnv(base).DATABASE_POOL_MAX).toBe(10);
  });

  it("accepts 1 and 50", () => {
    expect(loadEnv({ ...base, DATABASE_POOL_MAX: "1" }).DATABASE_POOL_MAX).toBe(1);
    expect(loadEnv({ ...base, DATABASE_POOL_MAX: "50" }).DATABASE_POOL_MAX).toBe(50);
  });

  it.each(["0", "51", "-1", "1.5", "abc", ""])("rejects %j", (value) => {
    expect(() => loadEnv({ ...base, DATABASE_POOL_MAX: value })).toThrow(EnvValidationError);
  });
});

describe("loadDatabaseEnv (the migration command) reads the same database settings", () => {
  it("takes TLS, the certificate and the pool size", () => {
    const env = loadDatabaseEnv({
      NODE_ENV: "production",
      DATABASE_URL: databaseUrl,
      DATABASE_SSL: "on",
      DATABASE_SSL_CA: PEM,
      DATABASE_POOL_MAX: "2",
    });
    expect(env).toEqual({
      NODE_ENV: "production",
      DATABASE_URL: databaseUrl,
      DATABASE_SSL: "on",
      DATABASE_SSL_CA: PEM,
      DATABASE_POOL_MAX: 2,
    });
  });

  it("has the same defaults and the same refusals", () => {
    expect(loadDatabaseEnv({ NODE_ENV: "development", DATABASE_URL: databaseUrl })).toEqual({
      NODE_ENV: "development",
      DATABASE_URL: databaseUrl,
      DATABASE_SSL: "off",
      DATABASE_SSL_CA: undefined,
      DATABASE_POOL_MAX: 10,
    });
    expect(() =>
      loadDatabaseEnv({ NODE_ENV: "development", DATABASE_URL: `${databaseUrl}?sslmode=require` }),
    ).toThrow(/DATABASE_SSL/);
    expect(() =>
      loadDatabaseEnv({ NODE_ENV: "development", DATABASE_URL: databaseUrl, DATABASE_SSL_CA: PEM }),
    ).toThrow(/DATABASE_SSL_CA/);
  });

  it("does not ask for the secrets the migration command never uses", () => {
    expect(() =>
      loadDatabaseEnv({ NODE_ENV: "production", DATABASE_URL: databaseUrl }),
    ).not.toThrow();
  });
});
