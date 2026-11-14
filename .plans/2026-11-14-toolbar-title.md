# Item toolbar: the "Actions for ..." title inside the box

Status: done (2026-11-14), "title inside the box" as proposed.

Goal: the title of the item toolbar ("Actions for “The Vault”") sits inside the box, above the buttons,
with the border unbroken, instead of cut into the top border line. It stays the group's real label
(`<fieldset>` + `<legend>`), so nothing changes for screen readers. The reserved status line under the
buttons (kept so nothing jumps when "Working..." appears) is trimmed so the box fits snugly.

Files: `ItemToolbar.css` only (legend floated inside the box, the next element cleared; tighter bottom
spacing). Tests first: a real-layout browser test (`e2e/toolbar-title.e2e.ts`: legend inside the box and
above the content in the buttons, rename form and delete question; 320 px with a long title; gap under the
buttons; axe light and dark) and a small CSS test.

Risks: a floated legend is an old, well-known technique that works in current Chrome, Firefox and Safari;
the browser test runs it in Chromium and WebKit. Older Safari is not tested here.
