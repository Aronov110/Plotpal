# A demo account for recruiters

Status: done (2026-11-16), as approved, with the additions listed under "Outcome".

A visitor presses **Try the demo** on the home page or the login page and is signed in at once, with a sample
story already in place, without creating an account. Each visitor gets their own throwaway account that is
deleted 24 hours later. AI limits are the same as for a real account.

## Decisions (approved)

- Option A: one fresh account per visitor, not one shared login. Nobody sees or breaks anybody else's copy,
  each visitor has their own AI runs, and there is no password to publish.
- Lifetime 24 hours. A recruiter who comes back presses the button again.
- Same AI limits as real accounts (5 runs a day each; the 300,000-token daily total still caps the bill).
- The button is on the home page and the login page.
- No uptime check (declined). If the Supabase free plan has paused, the button fails until the database wakes.

## Pieces

- **Migration `0006`**: `users.demo_expires_at timestamptz` (null for real accounts) and a partial index on it.
  A column marks a demo account; a special email domain would let a real person register with it and be
  deleted. Written with `drizzle-kit generate`.
- **`demo/sample-story.ts`**: the sample project, "The Last Light": a project, two acts, four scenes, with two
  deliberate plot holes (the flooded causeway; the lamp lit at dusk and at midnight) so the AI has something
  real to find.
- **`demo/service.ts`**: `start()` removes expired demo accounts, refuses when too many are alive (cap 200),
  creates the account (random unguessable email, display name "Demo visitor", expiry now + 24 hours, a hash of
  a random password that is thrown away, computed once and reused), seeds the story through the normal
  projects and documents services, and removes the account again if seeding fails.
- **`auth/service.ts`**: `signInAs(user)`, the one way to start a login for a user the server has already
  decided on (only the demo uses it).
- **`routes/auth.ts`**: `POST /auth/demo`, no body, the same Origin check as sign-up, its own rate limit (20 an
  hour), answers 201 with the same body and cookies as sign-up. Registered only when `DEMO_ENABLED` is true, so
  switching it off makes the address answer 404.
- **`config/env.ts`**: `DEMO_ENABLED` (default true), a kill switch like `AI_ENABLED`:
  `flyctl secrets set --stage DEMO_ENABLED=false`, then `flyctl secrets deploy`.
- **Web**: `authApi.demo()`, `SessionManager.startDemo`, `useAuth().startDemo`, the pure
  `describeDemoError`, and a `DemoButton` organism (busy state, status text, an alert with words for 404, 429,
  503 and no connection). It goes to `/app` on success; the focus then moves to that heading as usual.
- **README**: the demo, its limits, the kill switch.

## Known limits (accepted)

- The API sees Vercel's address for everybody (the open visitor-address bug), so the demo rate limit is shared
  by all visitors. That also means a bot could use it up and block recruiters until the hour passes. The cap
  and the 24-hour expiry bound the damage.
- The cap is soft: two starts at the same instant can both pass it.
- A demo that is deleted while someone is still using it fails on its next write (the access token lives up to
  15 minutes), then the session ends cleanly. Cleanup only runs when a new demo starts.
- A demo account has no usable password, so it can only be reached through its own session.

## Tests, written first

- API, real PostgreSQL: the account is marked and expires in 24 hours; the sample story's outline and text; the
  cookies, CSRF and a refresh work; expired demos are removed with their projects, documents and sessions;
  **real accounts are never removed** (mutation: drop the "is a demo" condition); the cap; the rate limit; the
  Origin check; no body accepted; the demo email cannot be used to log in; a failed seed leaves nothing behind;
  `DEMO_ENABLED=false` answers 404; a refresh for a removed demo says "session expired".
- Web: the API call, `startDemo` in the session manager, the error words, the button on both screens (busy,
  once only, errors, goes to the projects), accessibility, 320 px.
- Browser, both engines: one press lands on "Your projects" with the sample, and the writing screen shows its
  text.
- Mutation checks, as always.

## Outcome

- **Mutation checks:** 35 deliberate breaks (the clean-up deleting too much or nothing, the cap, the lifetime,
  the throwaway hash, the rollback, the Origin check, the rate limit, the kill switch, the log line, the sample
  text, the button's behaviour and words). 33 were caught on the first run. Two survived and exposed missing
  tests: the guard against two presses that arrive before the screen updates, and the "shared computer"
  warning not being cleared by a demo. Both now have tests and were caught on a second run. Every file was
  restored exactly after each break.
- **Added beyond the plan:** `DEMO_ENABLED` (the kill switch, like `AI_ENABLED`) and the `DemoUnavailableError`
  (503, `demo-unavailable`, `Retry-After`); the demo limit relaxed in the end-to-end server like the other
  per-address limits (without it, WebKit hit the real limit of 20 an hour after Chromium had used it, and
  the failures said so in words).
- **Decided while building:** the button navigates to `/app` with `replace`, like the login guard, so a demo
  started from the login page never lands on a saved address that belongs to somebody else's account.
- **Mistakes in my own new tests, fixed (never to make a failing check pass):** a wrong address for the API
  description, `getByRole("status")` finding two status lines on the login page, a synchronous lookup of a
  list that loads a moment later, and a focus check that did not wait for the effect that moves the focus.

## Not done on purpose

An uptime check (declined, so the button fails while a paused Supabase project wakes); a scheduler for the
clean-up; a banner inside the app saying "you are in a demo" (the display name "Demo visitor" and the
project's logline say it); lower AI limits for demo accounts (same limits, as approved).
