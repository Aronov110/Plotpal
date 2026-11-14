import { type CSSProperties, type ReactElement, type Ref, useId } from "react";
import { Link } from "react-router";
import type { OutlineNode } from "../../../lib/documents/use-outline.ts";
import "./OutlineNav.css";

/** The query string that opens a document: `?document=<id>`. */
export function documentSearch(id: string): string {
  return `?document=${encodeURIComponent(id)}`;
}

export interface OutlineNavProps {
  readonly nodes: readonly OutlineNode[];
  /** The id of the document that is open, if any. It is marked as the current page. */
  readonly selectedId: string | undefined;
  /** Called when the writer picks an item, so the screen can move the focus into its text. */
  readonly onSelect: (id: string) => void;
  /**
   * Lets the screen move the focus to the heading, for example after the open item was deleted and
   * there is nothing left to focus.
   */
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

function words(count: number): string {
  return `${count.toLocaleString("en")} ${count === 1 ? "word" : "words"}`;
}

/** Only the first screenful of items comes in one after another; the rest come in together. */
export const OUTLINE_ENTER_LIMIT = 10;

/** The place of every item in reading order (an act, then its scenes, then the next act), from 0. */
function readingOrder(nodes: readonly OutlineNode[]): ReadonlyMap<string, number> {
  const order = new Map<string, number>();
  const visit = (list: readonly OutlineNode[]): void => {
    for (const node of list) {
      order.set(node.id, order.size);
      visit(node.children);
    }
  };
  visit(nodes);
  return order;
}

function OutlineList({
  nodes,
  selectedId,
  onSelect,
  order,
}: {
  readonly nodes: readonly OutlineNode[];
  readonly selectedId: string | undefined;
  readonly onSelect: (id: string) => void;
  readonly order: ReadonlyMap<string, number>;
}): ReactElement {
  return (
    // biome-ignore lint/a11y/noRedundantRoles: Safari drops the list meaning of a list with list-style: none
    <ul className="outline-nav__list" role="list">
      {nodes.map((node) => (
        <li
          key={node.id}
          className="outline-nav__item"
          style={
            {
              "--enter-index": Math.min(order.get(node.id) ?? 0, OUTLINE_ENTER_LIMIT - 1),
            } as CSSProperties
          }
        >
          <Link
            to={{ search: documentSearch(node.id) }}
            className="outline-nav__link"
            aria-current={node.id === selectedId ? "page" : undefined}
            onClick={() => {
              onSelect(node.id);
            }}
          >
            {node.title}
          </Link>
          <span className="outline-nav__words">{words(node.wordCount)}</span>
          {node.children.length === 0 ? null : (
            <OutlineList
              nodes={node.children}
              selectedId={selectedId}
              onSelect={onSelect}
              order={order}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The outline of the project as a navigation: acts and chapters with their scenes inside, each one a
 * link that opens its text. Links (not buttons) because choosing an item changes the address, so the
 * Back button works and a writer can bookmark the scene they are on.
 */
export function OutlineNav({
  nodes,
  selectedId,
  onSelect,
  headingRef,
}: OutlineNavProps): ReactElement {
  const headingId = useId();

  return (
    <nav aria-labelledby={headingId} className="outline-nav">
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className="outline-nav__heading">
        Outline
      </h2>
      {nodes.length === 0 ? (
        <p>
          This project has no outline yet. Add an act or a chapter below, then add scenes inside it.
        </p>
      ) : (
        <OutlineList
          nodes={nodes}
          selectedId={selectedId}
          onSelect={onSelect}
          order={readingOrder(nodes)}
        />
      )}
    </nav>
  );
}
