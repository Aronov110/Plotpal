import { type ReactElement, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ApiError, NetworkError } from "../../../lib/api/problem.ts";
import { describeDemoError } from "../../../lib/auth/demo-feedback.ts";
import { useAuth } from "../../../lib/auth/session.tsx";
import { Button } from "../../atoms/Button/Button.tsx";
import { InlineError } from "../../atoms/InlineError/InlineError.tsx";
import "./DemoButton.css";

/**
 * "Try the demo": one press makes a throwaway account with a sample story and signs the visitor in,
 * so a recruiter or a curious reader can look around without signing up. It says what will happen
 * before it is pressed, says it is working while it works, and says in words why it failed and what
 * else to do. A second press while the first request runs does nothing.
 *
 * On success it goes to the projects screen, replacing the current history entry like the login
 * guard does, so a demo started from the login screen never lands on a saved address that belongs
 * to somebody else's account.
 */
export function DemoButton(): ReactElement {
  const { startDemo } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  // A ref as well as state: two clicks in a row can arrive before React has re-rendered the button.
  const running = useRef(false);
  const noteId = useId();
  const problemId = useId();

  const press = async (): Promise<void> => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setProblem(undefined);
    try {
      await startDemo();
      navigate("/app", { replace: true });
    } catch (error) {
      // Anything but a refused request or a missing connection is a bug or a changed API: the
      // visitor sees a general message, and the cause goes to the console.
      if (!(error instanceof ApiError) && !(error instanceof NetworkError)) console.error(error);
      setProblem(describeDemoError(error));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <fieldset className="demo-button">
      <legend className="visually-hidden">Demo account</legend>
      <Button
        variant="secondary"
        busy={busy}
        aria-describedby={noteId}
        onClick={() => {
          void press();
        }}
      >
        Try the demo
      </Button>
      <p id={noteId} className="demo-button__note">
        No sign-up needed. A sample story is ready, and it is deleted after 24 hours.
      </p>
      <p role="status" className="demo-button__status">
        {busy ? "Setting up your demo…" : null}
      </p>
      {problem === undefined ? null : (
        <div role="alert">
          <InlineError id={problemId}>{problem}</InlineError>
        </div>
      )}
    </fieldset>
  );
}
