import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type DatabaseHandle } from "../client.ts";
import { runMigrations } from "../migrate.ts";
import { createScratchDatabase, type ScratchDatabase } from "../test-support/test-database.ts";
import { ensureUuidv7, hasBuiltInUuidv7 } from "../uuidv7-shim.ts";

// Postgres 18 has uuidv7() built in; older servers (Supabase's) do not, and the migrations use it as the
// default of every id. The shim gives such a server an equivalent, and does nothing where the real
// one exists.

const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("the uuidv7 shim", () => {
  let scratch: ScratchDatabase;
  let handle: DatabaseHandle;

  /** Postgres 18 and later have the built-in function; the tests also run on older servers. */
  let serverHasBuiltIn = false;

  const ownFunctions = async (): Promise<number> => {
    const { rows } = await handle.pool.query<{ count: string }>(
      "select count(*)::text as count from pg_proc where proname = 'uuidv7' and pronamespace = 'public'::regnamespace",
    );
    return Number(rows[0]?.count);
  };

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    handle = createDatabase(scratch.url);
    const { rows } = await handle.pool.query<{ version: string }>(
      "select current_setting('server_version_num') as version",
    );
    serverHasBuiltIn = Number(rows[0]?.version) >= 180_000;
  });
  afterAll(async () => {
    await handle.close();
    await scratch.drop();
  });

  it("sees whether the server has the built-in function (Postgres 18 and later)", async () => {
    expect(await hasBuiltInUuidv7(handle.db)).toBe(serverHasBuiltIn);
  });

  it("creates its own function only where the built-in one is missing", async () => {
    await ensureUuidv7(handle.db);
    expect(await ownFunctions()).toBe(serverHasBuiltIn ? 0 : 1);
  });

  it("creates its own function when told the built-in one is missing", async () => {
    await ensureUuidv7(handle.db, { builtIn: false });
    expect(await ownFunctions()).toBe(1);
  });

  it("can be run again and again", async () => {
    await ensureUuidv7(handle.db, { builtIn: false });
    await ensureUuidv7(handle.db, { builtIn: false });
    expect(await ownFunctions()).toBe(1);
  });

  it("makes ids with version 7 and the RFC 9562 variant", async () => {
    const { rows } = await handle.pool.query<{ id: string }>(
      "select public.uuidv7()::text as id from generate_series(1, 200)",
    );
    for (const { id } of rows) expect(id).toMatch(V7);
  });

  it("puts the current time in the first 48 bits", async () => {
    const before = Date.now();
    const { rows } = await handle.pool.query<{ id: string }>("select public.uuidv7()::text as id");
    const after = Date.now();
    const embedded = Number.parseInt((rows[0]?.id ?? "").replace(/-/g, "").slice(0, 12), 16);
    expect(embedded).toBeGreaterThanOrEqual(before - 2_000);
    expect(embedded).toBeLessThanOrEqual(after + 2_000);
  });

  it("makes unique ids", async () => {
    const { rows } = await handle.pool.query<{ id: string }>(
      "select public.uuidv7()::text as id from generate_series(1, 10000)",
    );
    expect(new Set(rows.map((row) => row.id)).size).toBe(10_000);
  });

  it("fills the last 32 bits with random bits, so ids from different servers do not collide", async () => {
    // Within one database the counter alone makes ids unique; the random bits are what keeps two
    // databases (or a reset counter) from making the same id.
    const { rows } = await handle.pool.query<{ tail: string }>(
      "select right(public.uuidv7()::text, 8) as tail from generate_series(1, 200)",
    );
    expect(new Set(rows.map((row) => row.tail)).size).toBeGreaterThan(190);
  });

  it("keeps creation order, even for ids made in the same millisecond (one statement makes thousands)", async () => {
    const { rows } = await handle.pool.query<{ n: number; id: string }>(
      "select n, public.uuidv7()::text as id from generate_series(1, 5000) as n order by n",
    );
    const ids = rows.map((row) => row.id);
    expect([...ids].sort()).toEqual(ids);
  });

  it("keeps creation order across milliseconds too", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) {
      const { rows } = await handle.pool.query<{ id: string }>(
        "select public.uuidv7()::text as id",
      );
      ids.push(rows[0]?.id ?? "");
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect([...ids].sort()).toEqual(ids);
  });

  it("works as the default of a column, like the migrations use it", async () => {
    await handle.pool.query(
      "create table shim_demo (id uuid primary key default public.uuidv7(), note text)",
    );
    await handle.pool.query("insert into shim_demo (note) values ('a'), ('b'), ('c')");
    const { rows } = await handle.pool.query<{ id: string }>("select id::text from shim_demo");
    expect(rows).toHaveLength(3);
    for (const { id } of rows) expect(id).toMatch(V7);
  });

  it("does not touch the built-in function when it is there", async () => {
    if (!serverHasBuiltIn) return;
    const native = await handle.pool.query<{ shown: string }>(
      "select pg_catalog.uuidv7()::text as shown",
    );
    expect(native.rows[0]?.shown).toMatch(V7);
  });
});

describe("runMigrations and the shim", () => {
  it("makes a copy only on a server without the built-in function, and then the migrations work", async () => {
    const scratch = await createScratchDatabase();
    const handle = createDatabase(scratch.url);
    try {
      const version = await handle.pool.query<{ version: string }>(
        "select current_setting('server_version_num') as version",
      );
      const hasBuiltIn = Number(version.rows[0]?.version) >= 180_000;
      await runMigrations(handle.db);
      const { rows } = await handle.pool.query<{ count: string }>(
        "select count(*)::text as count from pg_proc where proname = 'uuidv7' and pronamespace = 'public'::regnamespace",
      );
      expect(rows[0]?.count).toBe(hasBuiltIn ? "0" : "1");
      // Every table's id default works, which is what failed on Supabase.
      const inserted = await handle.pool.query<{ id: string }>(
        "insert into users (email, password_hash) values ('shim@example.com', 'x') returning id::text as id",
      );
      expect(inserted.rows[0]?.id).toMatch(V7);
      await handle.db.execute(sql`select 1`);
    } finally {
      await handle.close();
      await scratch.drop();
    }
  });
});
