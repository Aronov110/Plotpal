# Two themes: remove the "System" choice

Status: done (2026-11-14), option B ("follow the device the first time") chosen.

Goal: the theme switch offers only Light and Dark. With nothing saved, the page still starts in the
theme the device prefers, and the switch shows that theme as selected; the first click saves a choice.
No "System" option remains in the UI, code, tests or docs. A stored `plotpal-theme` of `light` or `dark`
keeps working; any other stored value (including an old `system`) is ignored.

## Files
- `lib/theme/theme.ts`: type becomes `"light" | "dark"`; reading returns `undefined` when nothing valid is saved.
- `lib/theme/use-theme.ts`: also exposes the theme in effect now (saved choice, else the device's, via `matchMedia`) and follows the device while nothing is saved.
- `components/molecules/ThemeSwitch/ThemeSwitch.tsx` (+ CSS if it assumes three items): two options.
- `public/theme-init.js`, `index.html`, `ions/tokens.css`: comments only (behaviour unchanged).
- Tests: `theme.test.ts`, `use-theme.test.ts`, `ThemeSwitch.test.tsx`, `theme-init.test.ts`, `e2e/theme.e2e.ts` and the other e2e files that name "System".
- `README.md`: the theme paragraph.

## Tests and edge cases
Only two radios, none named "System"; nothing saved selects the device's theme (dark and light device);
choosing saves one word and beats the device; old `system` and garbage ignored; blocked storage works for
the session; another tab's change and a device change (while nothing is saved) update the switch; axe for
each device setting x each choice in both browsers; arrow keys move between the two; mutation check.

## Notes
Security: the stored value is still checked against an allow-list. A11y: labelled radio group, 24 px
targets and contrast checks unchanged. Risk: the switch must match the page on first paint (tested).
