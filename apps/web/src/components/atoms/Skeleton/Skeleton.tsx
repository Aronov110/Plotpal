import type { ReactElement } from "react";
import "./Skeleton.css";

export type SkeletonShape = "lines" | "cards" | "outline" | "paper";

export interface SkeletonProps {
  /**
   * What is being loaded: lines of text, cards (a title and two lines each), rows of an outline with
   * an act and its scenes, or the paper of the editor (a title and a page of text).
   */
  readonly shape: SkeletonShape;
  /** How many lines, cards or rows. A few by default; never more than twelve. */
  readonly count?: number;
}

const MAX = 12;
const DEFAULTS: Readonly<Record<SkeletonShape, number>> = {
  lines: 3,
  cards: 3,
  outline: 5,
  paper: 6,
};
/** Lines get shorter as they go, like the ragged end of a paragraph. */
const WIDTHS = [92, 78, 64, 86, 70, 54] as const;

function widthOf(index: number): string {
  return `${WIDTHS[index % WIDTHS.length] ?? 80}%`;
}

/**
 * Grey shapes where something is loading, in the size of what will arrive, so that nothing jumps
 * when it does. It is decoration only: hidden from screen readers, which are told in words by
 * `LoadingState`. It appears after a short wait (a fast answer never shows it), shimmers slowly,
 * and stands still for people who ask for less movement.
 */
export function Skeleton({ shape, count }: SkeletonProps): ReactElement {
  const n = Math.min(MAX, Math.max(1, Math.floor(count ?? DEFAULTS[shape])));
  const indexes = Array.from({ length: n }, (_, index) => index);

  return (
    <div className={`skeleton skeleton--${shape}`} aria-hidden="true">
      {shape === "lines"
        ? indexes.map((index) => (
            <span key={index} className="skeleton__bar" style={{ width: widthOf(index) }} />
          ))
        : null}
      {shape === "cards"
        ? indexes.map((index) => (
            <div key={index} className="skeleton__card">
              <span className="skeleton__bar skeleton__bar--title" />
              <span className="skeleton__bar" style={{ width: widthOf(index) }} />
              <span className="skeleton__bar" style={{ width: widthOf(index + 2) }} />
            </div>
          ))
        : null}
      {shape === "outline"
        ? indexes.map((index) => (
            <span
              key={index}
              className={`skeleton__row${index % 3 === 0 ? "" : " skeleton__row--child"}`}
            />
          ))
        : null}
      {shape === "paper" ? (
        <>
          <span className="skeleton__bar skeleton__title" />
          {indexes.map((index) => (
            <span key={index} className="skeleton__bar" style={{ width: widthOf(index) }} />
          ))}
        </>
      ) : null}
    </div>
  );
}
