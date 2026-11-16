import { ApiError, NetworkError } from "../api/problem.ts";

const GENERAL = "The demo could not be started. Please try again.";
const SIGN_UP_HINT = "or create an account";

/** "45 seconds", "1 minute", "10 minutes": whole numbers a person can plan around. */
function waitWords(seconds: number): string {
  if (seconds < 60) return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/**
 * Turns what went wrong when starting the demo into words for a person, and always points to
 * sign-up as the other way in. Only the fixed sentences below are ever shown: the server's own
 * `detail`, and the text of an unknown error, never are.
 */
export function describeDemoError(error: unknown): string {
  if (error instanceof NetworkError) {
    return "Can't reach the server. Check your connection and try again.";
  }
  if (!(error instanceof ApiError)) return GENERAL;

  switch (error.status) {
    case 404:
      return "The demo is switched off at the moment. You can still create an account.";
    case 429:
      return error.retryAfterSeconds === undefined
        ? `Too many demos were started just now. Try again in a few minutes, ${SIGN_UP_HINT}.`
        : `Too many demos were started just now. Try again in ${waitWords(error.retryAfterSeconds)}, ${SIGN_UP_HINT}.`;
    case 503:
      return `The demo is full right now. Try again in a few minutes, ${SIGN_UP_HINT}.`;
    default:
      return GENERAL;
  }
}
