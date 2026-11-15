# Load the writing screen only when a project is opened

Status: done (2026-11-15), as proposed.

The web app is one JavaScript file of 454.74 kB (137.10 kB compressed), and the landing, login and sign-up
pages download the whole writing screen too. Plan: the writing screen's code is fetched when a project is
opened (`React.lazy` and `Suspense`, nothing new to install).

**Go/no-go gate:** build before and after. If the compressed size of the first file dropped by less than
10 kB, stop and report that it is not worth the extra moving parts.

## Pieces

- `routes.tsx`: the project route loads `WritingPage` on demand. While it loads, the frame of the app and a
  loading status show, with no heading (the screen brings its own).
- `RouteFocus`: after a navigation it focused `main h1` once. A screen loaded on demand has no heading yet,
  so it now waits for one (at most 5 seconds), leaves a field the person is typing in alone, and stops when
  the person moves on or the app goes away.
- `reload-on-stale-chunk.ts`: a tab opened before a new version went live asks for files that no longer
  exist. Vite reports `vite:preloadError`; the page reloads once, guarded by a time in `sessionStorage` so
  it can never loop, and never when the storage cannot be used.
- `RouteErrorBoundary`: a safety net so a screen that cannot load shows a message and a Reload button instead
  of a blank page. React only supports this as a class, the one such place in the app.

Not done on purpose: lazy-loading every screen (more flashes for little gain), `zod/mini` (a big change for a
modest gain), preloading the file after sign-in (a possible follow-up).

## Tests, written first

Focus (a late heading, StrictMode, typing, moving on, going back, giving up, unmounting), the reload guard
(15 cases, including a failing or missing storage and bad stored values), the boundary (message, button,
focus, console, accessibility), the routes (not requested by the other pages, loading status, focus, a
failing load), and a browser test against the built app (files not downloaded before a project is opened,
not downloaded twice, a missing file reloads once and then shows the message, the button recovers).

Two of my own first versions were wrong and were corrected before this plan was closed: a test counted
timers and so also counted React's own (replaced by a behavioural check), and the first `RouteFocus` design
missed a person who went back before the late heading arrived (found by a mutation that survived; a test was
added first, then the code changed).

## Outcome

Gate passed: the first JavaScript file went from 454.74 kB to 394.71 kB (137.10 kB to 121.33 kB compressed,
15.8 kB less, against the 10 kB bar), and the first stylesheet from 35.36 kB to 21.50 kB (6.60 kB to 4.62 kB
compressed). The writing screen is its own 63.87 kB file (18.53 kB compressed) and 13.97 kB stylesheet
(2.79 kB compressed), fetched when a project is first opened. A first visit to the landing or login page
downloads about 17.8 kB less (compressed): 143.70 kB before, 125.95 kB after.

Verified: 2500 web unit tests (41 new), 1293 API unit tests, 18 mutation checks run (the 12 planned and a
second round for the redesigned focus code), all caught in the end; one of them showed the design flaw
described above. Browser suite in Chromium and WebKit: 611 passed, 3 skipped, 2 failed. One failure was my own
new test (a faked 404 that WebKit cached; changed to a failed request, 8 of 8 lazy-loading tests pass in both
browsers). The other, a colour-contrast check of the theme switch on the login screen in WebKit, passed 20 of
20 on its own and is a timing flake under the full run's load; it is not part of this change.
