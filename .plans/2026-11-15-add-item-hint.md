# The "Add to the outline" hint must not offer a scene that cannot be added

Status: done (2026-11-15), as proposed.

Reported on the live site: with no act or chapter open, the title field says "The name of the new act,
chapter or scene", while the note under it says a scene can only be added inside an act or a chapter.

Fix: the hint depends on what can be added. Nothing open (also a new project): "The name of the new act or
chapter." An act or chapter open (the form offers "inside" and "top level"): "The name of the new scene,
act or chapter." Tests first: the existing accessible-description test is updated and one test per case is
added, with an accessibility check. Only `AddItemForm.tsx` and its test change.

## Outcome

Built as planned. Verified: 28 form tests (3 failed first), 2 of 2 deliberate breakages caught, 2460 web unit
tests, lint, and 187 browser tests around the outline, writing screen and accessibility (Chromium and
WebKit, 1 skipped for browser capability).
