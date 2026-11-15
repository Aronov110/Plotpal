import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

/** Input types that take no typed text: a focused one is not a reason to keep the focus. */
const NOT_TEXT_INPUTS = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/**
 * Whether the focus is in something a person types into: a text field, a text area, a select or an
 * editable element. Taking the focus from there would send the next key press, or the text a test
 * is typing, into the heading, where it is lost.
 */
function isTypingInto(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element instanceof HTMLInputElement) return !NOT_TEXT_INPUTS.has(element.type);
  return (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    // `isContentEditable` is missing in some test environments, so the attribute is read as well.
    element.isContentEditable ||
    element.closest('[contenteditable]:not([contenteditable="false"])') !== null
  );
}

/**
 * How long to wait for the heading of a screen that arrives after the address changed (a screen
 * loaded on demand), in milliseconds. After that the focus is left alone.
 */
export const HEADING_WAIT_LIMIT_MS = 5000;

/**
 * Puts the focus on the heading of the screen, now if it is there and otherwise as soon as it
 * appears, for at most {@link HEADING_WAIT_LIMIT_MS}. It does nothing when the person is typing into
 * a field. Returns a function that stops waiting.
 */
function focusHeadingWhenReady(): () => void {
  /** Whether there is nothing more to wait for: the focus moved, or the person is typing. */
  const attempt = (): boolean => {
    if (isTypingInto(document.activeElement)) return true;
    const heading = document.querySelector<HTMLElement>("main h1");
    if (heading === null) return false;
    heading.focus();
    return true;
  };
  if (attempt()) return () => {};

  const stop = (): void => {
    observer.disconnect();
    window.clearTimeout(timer);
  };
  const observer = new MutationObserver(() => {
    if (attempt()) stop();
  });
  const timer = window.setTimeout(stop, HEADING_WAIT_LIMIT_MS);
  observer.observe(document.body, { childList: true, subtree: true });
  return stop;
}

/**
 * Moves the focus to the heading of the new screen after a navigation. A single-page app swaps
 * the screen without loading a page, so a screen reader would otherwise stay silent and a keyboard
 * user would stay wherever the old screen left them.
 *
 * It does nothing when the app first opens (the browser handles that), and nothing when only the
 * query or fragment changes on the same screen. It also leaves the focus alone when it is already in
 * a field (a login form that focuses its first field, or someone who has started typing): the
 * effect runs after the screen is painted, which on a slow machine is after typing has begun.
 *
 * A screen loaded on demand has no heading yet when the address changes, so it waits for one (see
 * {@link HEADING_WAIT_LIMIT_MS}) and stops if the person moves on first.
 * Place it once, inside the router.
 */
export function RouteFocus(): null {
  const { pathname } = useLocation();
  // Compared with the last path instead of "is this the first run": React's StrictMode runs every
  // effect twice when the app mounts, which would count as a navigation.
  const lastPath = useRef(pathname);

  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    return focusHeadingWhenReady();
  }, [pathname]);

  return null;
}
