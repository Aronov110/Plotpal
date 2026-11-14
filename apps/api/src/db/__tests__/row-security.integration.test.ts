import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type DatabaseHandle } from "../client.ts";
import { runMigrations } from "../migrate.ts";
import {
  connectTestDatabase,
  createScratchDatabase,
  getTestDatabaseUrl,
} from "../test-support/test-database.ts";

// Supabase can publish the tables of the `public` schema as a REST API for anyone holding its public
// key. This app never uses that, and switches it off, but a table without Row Level Security would be
// wide open the day somebody switches it on. With RLS on and no policy, those roles see nothing. The
// app's own connection is the table owner and is not affected.

interface TableRow {
  table_name: string;
  row_security: boolean;
}

describe("row level security", () => {
  let handle: DatabaseHandle;
  let tables: TableRow[];

  beforeAll(async () => {
    handle = connectTestDatabase();
    const result = await handle.pool.query<TableRow>(
      `select c.relname as table_name, c.relrowsecurity as row_security
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')
        order by c.relname`,
    );
    tables = result.rows;
  });
  afterAll(async () => {
    await handle.close();
  });

  it("finds the tables to check", () => {
    expect(tables.length).toBeGreaterThanOrEqual(5);
  });

  it("is on for every table in the public schema, so a new table cannot be forgotten", () => {
    const without = tables.filter((table) => !table.row_security).map((t) => t.table_name);
    expect(without).toEqual([]);
  });

  it("has no policy that lets anyone in: the app does not need one", async () => {
    const { rows } = await handle.pool.query<{ count: string }>(
      "select count(*)::text as count from pg_policies where schemaname = 'public'",
    );
    expect(rows[0]?.count).toBe("0");
  });

  it("does not stop the app's own connection (the table owner) from reading and writing", async () => {
    const { rows } = await handle.pool.query<{ ok: number }>("select 1 as ok from users limit 1");
    expect(Array.isArray(rows)).toBe(true);
  });
});

describe("where Supabase's roles exist (anon and authenticated)", () => {
  // Roles belong to the whole server, not to one database, so the test makes them when they are not
  // there and removes only the ones it made.
  const ROLES = ["anon", "authenticated"] as const;
  const created: string[] = [];

  async function withServer<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
    const client = new pg.Client({ connectionString: getTestDatabaseUrl().toString() });
    await client.connect();
    try {
      return await run(client);
    } finally {
      await client.end();
    }
  }

  afterAll(async () => {
    await withServer(async (client) => {
      for (const role of created) await client.query(`DROP ROLE IF EXISTS "${role}"`);
    });
  });

  it("takes their privileges away, on the tables there are and on tables made later", async () => {
    await withServer(async (client) => {
      for (const role of ROLES) {
        const { rowCount } = await client.query("select 1 from pg_roles where rolname = $1", [
          role,
        ]);
        if (rowCount === 0) {
          await client.query(`CREATE ROLE "${role}" NOLOGIN`);
          created.push(role);
        }
      }
    });

    const scratch = await createScratchDatabase();
    const handle = createDatabase(scratch.url);
    try {
      // Supabase hands these roles every new table by default. Do the same before the migrations,
      // so there is something for the migration to take away.
      await handle.pool.query(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated",
      );
      await runMigrations(handle.db);

      const privileges = await handle.pool.query<{
        role: string;
        table_name: string;
        has: boolean;
      }>(
        `select r.role, t.tablename as table_name,
                has_table_privilege(r.role, format('public.%I', t.tablename), 'SELECT') as has
           from (values ('anon'), ('authenticated')) as r(role)
           cross join pg_tables t
          where t.schemaname = 'public'`,
      );
      expect(privileges.rows.length).toBeGreaterThanOrEqual(10);
      expect(privileges.rows.filter((row) => row.has)).toEqual([]);

      await handle.pool.query("create table made_later (id int)");
      const later = await handle.pool.query<{ role: string; has: boolean }>(
        `select r.role, has_table_privilege(r.role, 'public.made_later', 'SELECT') as has
           from (values ('anon'), ('authenticated')) as r(role)`,
      );
      expect(later.rows.filter((row) => row.has)).toEqual([]);
    } finally {
      await handle.close();
      await scratch.drop();
    }
  });
});
