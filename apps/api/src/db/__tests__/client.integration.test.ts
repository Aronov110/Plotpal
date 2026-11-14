import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type DatabaseHandle } from "../client.ts";
import {
  createScratchDatabase,
  getTestDatabaseUrl,
  type ScratchDatabase,
} from "../test-support/test-database.ts";

// This block must stay first in the file: the driver warns only once per process, so a test that
// runs after another query would never see it.
describe("the time zone is set before a connection is used", () => {
  it("without the driver warning that two queries ran on one connection at once", async () => {
    // pg 8 only warns; pg 9 will refuse. Setting the zone in the background while the first real
    // query starts would trigger it.
    const warnings: string[] = [];
    const listener = (warning: Error) => warnings.push(`${warning.name}: ${warning.message}`);
    process.on("warning", listener);
    const handle = createDatabase(getTestDatabaseUrl().toString(), { max: 2 });
    try {
      await Promise.all([1, 2, 3, 4].map(() => handle.pool.query("select 1")));
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off("warning", listener);
      await handle.close();
    }
    expect(warnings.filter((text) => text.includes("already executing"))).toEqual([]);
  });
});

const NOT_UTC = "America/New_York";

describe("every connection runs in UTC, whatever the database would give it", () => {
  // The local database already defaults to UTC, which would hide a missing setting. So the test
  // database is told to default to New York time: only the code under test can make a connection UTC.
  let scratch: ScratchDatabase;
  let handle: DatabaseHandle;

  const zoneOf = async (client: { query: pg.Pool["query"] }): Promise<string | undefined> => {
    const { rows } = await client.query<{ timezone: string }>(
      "select current_setting('timezone') as timezone",
    );
    return rows[0]?.timezone;
  };

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    const setup = new pg.Client({ connectionString: scratch.url });
    await setup.connect();
    try {
      const name = new URL(scratch.url).pathname.slice(1);
      await setup.query(`ALTER DATABASE "${name}" SET timezone TO '${NOT_UTC}'`);
    } finally {
      await setup.end();
    }
    handle = createDatabase(scratch.url, { max: 3 });
  });
  afterAll(async () => {
    await handle.close();
    await scratch.drop();
  });

  it("(premise) a plain connection to this database is not in UTC", async () => {
    const plain = new pg.Client({ connectionString: scratch.url });
    await plain.connect();
    try {
      expect(await zoneOf(plain)).toBe(NOT_UTC);
    } finally {
      await plain.end();
    }
  });

  it("on the first connection of the pool", async () => {
    expect(await zoneOf(handle.pool)).toBe("UTC");
  });

  it("on connections opened side by side", async () => {
    const zones = await Promise.all([1, 2, 3].map(() => zoneOf(handle.pool)));
    expect(zones).toEqual(["UTC", "UTC", "UTC"]);
  });

  it("so a timestamptz is shown as UTC", async () => {
    const { rows } = await handle.pool.query<{ shown: string }>(
      "select to_char('2026-11-14 12:00:00+00'::timestamptz, 'HH24:MI TZ') as shown",
    );
    expect(rows[0]?.shown).toBe("12:00 UTC");
  });

  it("also when the connection class is used on its own (the form without a callback)", async () => {
    const Client = handle.pool.options.Client as unknown as typeof pg.Client | undefined;
    if (Client === undefined) throw new Error("the pool has no client class");
    const client = new Client({ connectionString: scratch.url });
    try {
      await client.connect();
      expect(await zoneOf(client)).toBe("UTC");
    } finally {
      await client.end();
    }
  });
});
