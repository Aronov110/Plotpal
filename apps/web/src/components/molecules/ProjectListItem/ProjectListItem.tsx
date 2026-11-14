import type { CSSProperties, ReactElement, ReactNode } from "react";
import "./ProjectListItem.css";

/** The id of a project's list item, so that the list can move the focus to it. */
export function projectItemId(projectId: string): string {
  return `project-${projectId}`;
}

export interface ProjectListItemProps {
  readonly projectId: string;
  /** What the card shows: the project's details, a form, a question. */
  readonly children: ReactNode;
  /**
   * Where the card comes in the first screenful, from 0. Cards rise in one after another, each a
   * little later than the one before; the list gives 0 to the ones further down, which come in at
   * once. (Only a card that has just appeared moves; one that is already there does not.)
   */
  readonly enterIndex?: number;
}

/**
 * The frame of one project in the list: a card that holds whatever the project is showing right
 * now. The card can be focused by code (not by the tab key), so that after "Load more" or a
 * delete a screen reader starts reading at the right project.
 */
export function ProjectListItem({
  projectId,
  children,
  enterIndex = 0,
}: ProjectListItemProps): ReactElement {
  return (
    <li
      id={projectItemId(projectId)}
      className="project-item"
      tabIndex={-1}
      style={{ "--enter-index": enterIndex } as CSSProperties}
    >
      {children}
    </li>
  );
}
