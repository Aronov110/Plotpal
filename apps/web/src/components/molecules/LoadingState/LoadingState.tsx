import type { ReactElement } from "react";
import { Skeleton, type SkeletonShape } from "../../atoms/Skeleton/Skeleton.tsx";

export interface LoadingStateProps {
  /** What is loading, in words: "Loading your projects…". Read out by a screen reader. */
  readonly label: string;
  readonly shape: SkeletonShape;
  readonly count?: number;
}

/**
 * What a screen shows while its content loads: grey shapes in the size of what is coming, for the
 * eye, and the same thing in words, for a screen reader (a status, kept out of sight because the
 * shapes already show it). The shapes are decoration and hidden from assistive technology.
 */
export function LoadingState({ label, shape, count }: LoadingStateProps): ReactElement {
  return (
    <div role="status" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      <Skeleton shape={shape} {...(count === undefined ? {} : { count })} />
    </div>
  );
}
