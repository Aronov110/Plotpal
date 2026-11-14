# AI panel: an opened result leaves "Earlier results", Delete moves next to Close

Status: done (2026-11-14), decisions 1-5 as proposed.

Goal: pressing Open removes that result from the "Earlier results" list and shows Delete next to
"Close this result" at the top of the result; closing the result puts its row back in the same place.
The delete safety question is kept. Replaces the earlier "Showing/Watching" label idea.

## Decisions
1. Every result on screen leaves the list (also one that has just finished), one rule.
2. If the only result is open, the list says "No other earlier results." until it is closed.
3. After Close, focus goes to that row's Open button.
4. Delete at the top asks the same question (Keep focused first, Escape keeps); confirming deletes,
   closes the result and focuses the "Earlier results" heading.
5. A run still going ("Watch") is unchanged.

## Files
`AiPanel.tsx`, `AnalysisResult.tsx` + `.css`, a small shared helper for the words describing a result,
and the AiPanel / AnalysisResult unit tests plus `e2e/ai-panel.e2e.ts`.

## Tests and edge cases
Open removes the row (others keep their order); Close returns it in its old slot (first, last, only);
opening another swaps which row is hidden; Delete beside Close; Keep / Escape / Confirm; failed delete
keeps the result and shows the error; focus after Close, Keep, confirmed delete; "Show older results"
works while a result is open; 320 px wrap; axe light and dark; mutation check.

## Notes
No new data path (same delete request). Real buttons with clear names, 44 px targets. Risk: existing
tests that delete from a row while its result is open need updating (requested behaviour change).
