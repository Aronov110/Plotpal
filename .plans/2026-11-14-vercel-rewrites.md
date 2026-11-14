# Vercel rewrites: /projects must not become /projects/

Status: done (2026-11-14), as proposed.

Found on the live site by the first real sign-up: through Vercel, `GET /projects` reached the API as
`/projects/` (a trailing slash), which the API reads as `/projects/:id` with an empty id: 400. So the projects
screen cannot list or create projects. `/auth/login` and `/auth/register` have a second segment and work.
Cause: the rewrite `/projects/:path*` gives `/projects/` when nothing follows. My earlier checks used no token
(401 comes before the id check) and the test only compared the text of the rewrite.

Fix: two rewrites per API area, the bare path (`/projects` -> `/projects`) and `/projects/:path+` (one or
more segments), before the page fallback. Tests first: a small interpreter applies the rewrites to real
addresses (`/projects`, `/projects/abc`, `/projects/abc/documents/1`, `/auth/login`, `/auth`) and to page
addresses that must stay pages (`/login`, `/app/projects/x`, `/projectsfoo`, `/authors`), and the API
destinations must have no stray trailing slash. Vercel redeploys on its own when this is merged; then the
real behaviour is checked in the live API log with a signed-in request.

Not covered by the unit test: Vercel's own matching. It is checked live after the deploy.

## Outcome

Built as planned. Verified: 30 rewrite tests (the one that reproduces the bug failed first), 6 of 6
deliberate breakages caught, web unit tests (2458), lint, typecheck, and the 8 policy browser tests, which
load vercel.json through the preview server. Still to do after the merge: check the live API log with a
signed-in request that `/projects` now arrives without the trailing slash (Vercel's own matching is not
covered by the unit test).
