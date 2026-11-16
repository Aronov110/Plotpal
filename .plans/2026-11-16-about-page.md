# An About page

Status: done (2026-11-16), as approved, with the two changes noted under "Outcome".

A public page at `/about`, open to anyone, signed in or not. It says what Plotpal is, what it does, and where
the writing goes when the AI is run. The text is written by the owner; only what is on the page is in scope
(no "how it is built", no names, no outside links).

Linked from the home page ("About Plotpal", under the buttons) and from the signed-in header ("About").

## Pieces

- `components/pages/AboutPage/AboutPage.tsx` and `.css`: one level-one heading, three sections, one link back
  to the home page. Page title "About – Plotpal". Same frame as the home page (a `main` and the theme switch).
- `routes.tsx`: `/about` outside `RequireAuth` and `RedirectIfSignedIn`, so everyone sees the same page.
  Not lazy: it is a few paragraphs.
- `HomePage.tsx`: the link, shown whether or not someone is signed in, and not while the login is being
  checked (the same rule as the other links on that page, so nothing flickers).
- `AppLayout.tsx`: an "About" link in the header, next to the theme switch.
- `e2e/accessibility.e2e.ts`: `/about` joins the list of signed-out screens, which already runs axe in light and
  dark, the title and language, a single heading, no sideways scroll at 320 px and the 24 px target size.
  `e2e/keyboard-and-focus.e2e.ts`: the link from the home page, from the header, the focus on the heading, and
  a signed-in reload of `/about`.

## Checked against the code before it went on the page

- Saves 2 seconds after typing and retries: `document-saver.ts`.
- Two tabs: the second save is stopped with `ConflictNotice` and the writer chooses.
- Quotes: every quote is checked against the manuscript (`verifyEvidence`, `quoteAppearsIn`). One that is not
  there is **kept and marked** "Not found in your text", it is not removed. The first draft of the page said
  "thrown away"; that was wrong, so the page says "clearly marked as not found".
- The text sent to the AI goes to Anthropic's Claude AI (`AiPrivacyNotice`), which says the same.

## Tests, written first

The page (heading, sections, one link, title, no violations as a page), the route for signed-out and signed-in
people and no redirect, the home page link in each state, the header link, and the browser list.

Mutation checks: remove the route, the home link or the header link, and break a sentence: a test must fail.

## Outcome

- Eight deliberate breaks (route removed, home link removed, header link removed, the false "thrown away"
  sentence, home link shown while the login is checked, the page put behind sign-in, an outside link added,
  header link after the sign-out button): all eight made a test fail, and every file was restored exactly.
- One of my own new tests was wrong, not the page: with no login cookie the app knows at once that nobody is
  signed in, so there is no "checking" moment. It now holds the server's answer back, as the existing
  home-page test does, and mutation 5 proves it can fail.
- No separate `about.e2e.ts` was needed: `/about` joined the list in `accessibility.e2e.ts`, and three tests
  for the link, focus and a signed-in reload went into `keyboard-and-focus.e2e.ts`.
- The README needed no change: its layout section lists folders, not pages.

## Not done on purpose

A section on the home page (makes the landing long), a pop-up (cannot be linked, harder to make accessible),
an About link on the login and sign-up screens (not asked for).
