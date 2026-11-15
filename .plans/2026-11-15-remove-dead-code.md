# Remove two functions the app never calls

Status: done (2026-11-15), as proposed.

A read-only scan of the whole project (unused files, unused exports, unused dependencies, unused CSS and
design tokens) found no orphan files, no unused packages and no unused CSS. It found two functions that
production code never calls and that only their own tests keep alive:

- `countNodes` in `apps/web/src/lib/documents/use-outline.ts`: deleted, with its one test ("counts every
  item, scenes included"). The `findNode` tests stay as they were.
- `findLiveSession` in `apps/api/src/auth/sessions.ts`: the app never asks "is this token live?" (a refresh
  looks the token up and rotates it in one step). The rotate and revoke tests do use it, 16 times, to see
  what happened to a session, so it moves into `sessions.integration.test.ts` as a local helper with the
  same name, signature and query. No test line changes, and its own four tests stay.

Not changed on purpose: about 200 exported `Props` and option types (erased at build time, and the
repository's convention) and two packages that look unused but are required by others
(`openapi-types`, `@testing-library/dom`).

Checks: the related tests were green first (30 web, 56 API), no reference is left, `tsc` and Biome are
clean, and a mutation check breaks the moved helper two ways (ignoring expiry, ignoring revocation) and
both are caught by the sessions tests.

## Outcome

Built as planned. Verified: 2 of 2 deliberate breakages caught, 2459 web unit tests (one fewer: the deleted
`countNodes` test), 1293 API unit tests, 974 API integration tests, lint and typecheck clean.
