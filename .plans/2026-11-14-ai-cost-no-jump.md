# AI panel: the cost line must not make the page jump

Status: done (2026-11-14), as proposed.

Cause (found by logging a failing 320 px browser run): when the drawer opens, the cost line first reads one
line ("Working out the cost...") and then becomes 2-3 lines. That moves "Run the scan" and the history list
down. If it lands between mouse down and mouse up, the click goes to whatever moved under the pointer and the
button never sees it (a lost "Run the scan" or "Open" click, about 1 run in 8-40 at 320 px).

Fix: while the estimate loads, the cost line keeps the height the finished text will have, by laying an
invisible sample sentence (hidden from assistive technology) under the visible "Working out the cost...".

Files: `CostHint.tsx`, `CostHint.css`, their tests, `e2e/ai-panel.e2e.ts` (a real-layout test that holds the
estimate back and checks "Run the scan" does not move, at 320 and 1200 px; and the tests that click Run or
Open now wait for the cost text first).

Checks: unit tests; mutation checks; axe in light and dark; the 320 px test repeated 40 times (expect 40/40,
it failed about 13 % before); full suite.

## Outcome

The cost-line fix removed a real jump (measured: 72 px at 320 px wide, 24 px at 1200) but did not on its own
cure the flaky 320 px test (3 of 40 still failed). A second cause, found with a page log of scroll and focus
events: at 320 px the drawer opens like a growing box and its contents are squeezed back while it grows (up
to about 140 px), and the tests clicked Run or Open about 100 ms after opening, in the middle of that. The AI
browser tests now wait for the drawer's finite animations to end after opening it (`e2e/support/motion.ts`,
also used by the axe helper). The 320 px test then passed 60 of 60 (it failed about 1 in 8 before).
Verified: 2424 unit tests, 597 browser tests (3 skipped for browser capability), lint, typecheck, build and
`bun audit` clean, 6 of 6 deliberate breakages caught.
