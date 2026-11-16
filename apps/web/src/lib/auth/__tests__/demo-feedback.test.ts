import { describe, expect, it } from "vitest";
import { apiError } from "../../../test-support/session-harness.ts";
import { ApiError, NetworkError, ResponseShapeError } from "../../api/problem.ts";
import { describeDemoError } from "../demo-feedback.ts";

const GENERAL = "The demo could not be started. Please try again.";

const withRetry = (status: number, retryAfterSeconds: number | undefined) =>
  new ApiError({ status, code: undefined, detail: undefined, issues: [], retryAfterSeconds });

describe("describeDemoError", () => {
  it("says the demo is switched off for a 404, and points to sign-up", () => {
    expect(describeDemoError(apiError(404))).toBe(
      "The demo is switched off at the moment. You can still create an account.",
    );
  });

  it("says the demo is full for a 503, and points to sign-up", () => {
    expect(describeDemoError(apiError(503))).toBe(
      "The demo is full right now. Try again in a few minutes, or create an account.",
    );
  });

  it.each([
    [1, "1 second"],
    [45, "45 seconds"],
    [60, "1 minute"],
    [90, "2 minutes"],
    [600, "10 minutes"],
  ])("says how long to wait for a 429 with a Retry-After of %i seconds", (seconds, words) => {
    expect(describeDemoError(withRetry(429, seconds))).toBe(
      `Too many demos were started just now. Try again in ${words}, or create an account.`,
    );
  });

  it("does not invent a wait for a 429 without a Retry-After", () => {
    expect(describeDemoError(withRetry(429, undefined))).toBe(
      "Too many demos were started just now. Try again in a few minutes, or create an account.",
    );
  });

  it("says the connection is the problem when there is no answer", () => {
    expect(describeDemoError(new NetworkError())).toBe(
      "Can't reach the server. Check your connection and try again.",
    );
  });

  it.each([400, 401, 403, 500, 502])("gives the general message for a %i", (status) => {
    expect(describeDemoError(apiError(status))).toBe(GENERAL);
  });

  it("gives the general message for anything unexpected, and never its own text", () => {
    expect(describeDemoError(new ResponseShapeError("secret detail"))).toBe(GENERAL);
    expect(describeDemoError(new Error("secret detail"))).toBe(GENERAL);
    expect(describeDemoError("a string")).toBe(GENERAL);
  });

  it.each([400, 401, 403, 404, 429, 500, 502, 503])(
    "never shows the server's own detail, whatever the status (%i)",
    (status) => {
      const error = new ApiError({
        status,
        code: "something-internal",
        detail: "internal stack trace here",
        issues: [{ pointer: "/secret", message: "internal field message" }],
        retryAfterSeconds: undefined,
      });
      const words = describeDemoError(error);
      expect(words).not.toContain("internal");
      expect(words).not.toContain("stack");
    },
  );

  it("never shows the server's own detail", () => {
    const error = new ApiError({
      status: 503,
      code: "demo-unavailable",
      detail: "internal stack trace here",
      issues: [],
      retryAfterSeconds: undefined,
    });
    expect(describeDemoError(error)).not.toContain("internal");
  });
});
