import { sql } from "drizzle-orm";
import type { Database } from "./client.ts";

/**
 * `uuidv7()` is built into PostgreSQL 18. The migrations use it as the default of every id, and older
 * servers (Supabase runs one) do not have it: the migration would stop with
 * `function uuidv7() does not exist`. This gives such a server an equivalent, and does nothing where
 * the built-in function exists. It runs before the migrations, so the migration files themselves stay
 * untouched (a merged migration is never edited).
 */

/** Whether the server has the built-in `uuidv7()`. */
export async function hasBuiltInUuidv7(db: Database): Promise<boolean> {
  const result = await db.execute<{ present: boolean }>(
    sql`select exists (
          select 1
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'pg_catalog' and p.proname = 'uuidv7' and p.pronargs = 0
        ) as present`,
  );
  return result.rows[0]?.present === true;
}

const CREATE_COUNTER = "CREATE SEQUENCE IF NOT EXISTS public.uuidv7_counter_seq AS bigint";

/**
 * A UUID version 7 as RFC 9562 describes it, from the parts PostgreSQL 13 and later have:
 *
 * - 48 bits: the time in milliseconds since 1970, so ids sort by creation time;
 * - 4 bits: the version, 7;
 * - 12 bits: the top part of a counter from a sequence (the standard's "fixed-length counter"
 *   method, here made longer);
 * - 2 bits: the variant, 10;
 * - 30 bits: the lower part of the same counter;
 * - 32 bits: random, from `gen_random_uuid()`.
 *
 * Ids are compared from the front, so the more significant part of the counter comes first.
 *
 * The counter has 42 bits (over four trillion values) and counts every call, so it does not wrap
 * in practice. That is what keeps ids in the order they were made, even within one millisecond:
 * a counter that wrapped every 4096 calls would put two ids of the same millisecond in the wrong
 * order each time it wrapped.
 *
 * Not PARALLEL SAFE: `nextval` is not.
 */
const CREATE_FUNCTION = `
CREATE OR REPLACE FUNCTION public.uuidv7() RETURNS uuid
LANGUAGE plpgsql VOLATILE AS $fn$
DECLARE
  ms bigint := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  counter bigint := nextval('public.uuidv7_counter_seq') % 4398046511104;
  top integer := (counter >> 30)::integer;
  lower bigint := counter & 1073741823;
  random_bytes bytea := uuid_send(gen_random_uuid());
BEGIN
  RETURN encode(
    substring(int8send(ms) FROM 3 FOR 6)
    || set_byte(set_byte(decode('0000', 'hex'), 0, 112 | (top >> 8)), 1, top & 255)
    || set_byte(
         set_byte(
           set_byte(
             set_byte(decode('00000000', 'hex'), 0, 128 | (((lower >> 24)::integer) & 63)),
             1, ((lower >> 16)::integer) & 255
           ),
           2, ((lower >> 8)::integer) & 255
         ),
         3, (lower::integer) & 255
       )
    || substring(random_bytes FROM 13 FOR 4),
    'hex'
  )::uuid;
END
$fn$`;

export interface EnsureUuidv7Options {
  /**
   * Whether the server has the built-in function. Left out, the server is asked. Tests pass `false` to
   * make the copy on a server that does have it.
   */
  readonly builtIn?: boolean;
}

/** Makes `public.uuidv7()` where the server has no built-in one. Safe to run again and again. */
export async function ensureUuidv7(db: Database, options: EnsureUuidv7Options = {}): Promise<void> {
  const builtIn = options.builtIn ?? (await hasBuiltInUuidv7(db));
  if (builtIn) return;
  // One statement at a time: the driver does not run several in one call.
  await db.execute(sql.raw(CREATE_COUNTER));
  await db.execute(sql.raw(CREATE_FUNCTION));
}
