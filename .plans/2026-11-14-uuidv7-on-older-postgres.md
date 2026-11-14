# uuidv7() on a Postgres that does not have it

Status: done (2026-11-14), shim before the migrations, as proposed.

Found by the first real deploy: the migration failed on Supabase with `function uuidv7() does not exist`.
`uuidv7()` is built into Postgres 18 (the local Docker database); Supabase runs an older Postgres.

Fix: `runMigrations` first calls `ensureUuidv7`: if the server has no built-in `uuidv7()`
(`pg_catalog`), it creates `public.uuidv7()` (RFC 9562: 48-bit millisecond time, version 7, a 12-bit counter
from a sequence in `rand_a` so ids made in the same millisecond still sort in creation order, variant bits,
62 random bits from `gen_random_uuid()`) and the sequence behind the counter. On Postgres 18 nothing is
created. The migration files stay untouched (README: never edit a merged migration).

Tests first, on a real Postgres: valid version and variant bits, embedded time, uniqueness, strictly
increasing ids from one statement (same millisecond), idempotent, not created when the built-in function
exists, not replacing it. Then the strongest check: all migrations and the whole integration suite on a
throwaway Postgres 17 container (the `postgres:17.5-alpine` image is already local).

Risks: ids from different connections in the same millisecond are not ordered against each other (the
built-in function has the same limit across sessions only partly); the app does not rely on it.

## Outcome

Built as planned, with two corrections found by the tests: the first counter wrapped every 4096 calls, which
put ids of the same millisecond in the wrong order at each wrap (now a 42-bit counter that does not wrap in
practice), and its low bits came before its high bits (ids compare from the front: the most significant
bits now come first).

Verified: all 974 integration tests pass on Postgres 18 and on a throwaway Postgres 17 (no built-in
`uuidv7()`), 1293 API unit tests, lint, typecheck and `bun audit` clean, the production image's migration
command applied everything on Postgres 17 (tables, row security on, the function, a second run is a no-op),
9 of 9 deliberate breakages caught (the one that removes the call from `runMigrations` shows only on
Postgres 17, where the test database cannot even be built). No web change.
