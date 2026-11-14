import type { ReactElement } from "react";
import {
  describeAllowance,
  describeCost,
  describeSize,
} from "../../../lib/analyses/format-cost.ts";
import type { EstimateView } from "../../../lib/analyses/use-analysis-panel.ts";
import { Button } from "../../atoms/Button/Button.tsx";
import "./CostHint.css";

export interface CostHintProps {
  readonly view: EstimateView;
  readonly onRetry: () => void;
}

/**
 * A typical finished hint. While the real one is worked out it is laid, invisible, under the words
 * "Working out the cost…" so the line already takes the room the finished text will take. Without it
 * everything below (the Run button, the history) would jump down when the answer arrives.
 */
export const LOADING_SAMPLE =
  "Less than a page of text. Costs about $0.09 to $0.33. You have 10 AI requests left in the last 24 hours.";

/**
 * What a run would cost, before it is run: the size of the text, a rough price and what is left of
 * the day's allowance. It makes no AI call. A text that is too long for one go says so here.
 */
export function CostHint({ view, onRetry }: CostHintProps): ReactElement | null {
  switch (view.status) {
    case "idle":
      return null;
    case "loading":
      return (
        <p role="status" className="cost-hint cost-hint--loading">
          <span className="cost-hint__sizer" aria-hidden="true">
            {LOADING_SAMPLE}
          </span>
          <span>Working out the cost…</span>
        </p>
      );
    case "failed":
      return (
        <div className="cost-hint cost-hint--problem">
          <p>{view.message}</p>
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      );
    case "ready": {
      const { estimate } = view;
      return (
        <div role="status" className="cost-hint">
          <p>
            {describeSize(estimate.characters)} {describeCost(estimate)}{" "}
            {describeAllowance(estimate.remaining)}
          </p>
          {estimate.fits ? null : (
            <p className="cost-hint__warning">
              This text is too long for the AI to read in one go. Choose a single act or scene.
            </p>
          )}
        </div>
      );
    }
  }
}
