import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { DatabaseEnv } from "../config/env.ts";
import { aiAnalyses } from "./schema/ai-analyses.ts";
import { documents } from "./schema/documents.ts";
import { projects } from "./schema/projects.ts";
import { refreshSessions } from "./schema/refresh-sessions.ts";
import { users } from "./schema/users.ts";

export const schema = { users, refreshSessions, projects, documents, aiAnalyses };

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseHandle {
  readonly db: Database;
  readonly pool: pg.Pool;
  /** Closes every pooled connection. Call once on shutdown. */
  readonly close: () => Promise<void>;
}

export interface CreateDatabaseOptions {
  /**
   * Called when an idle pooled connection fails, for example because the database restarted.
   * Defaults to logging the message (never the connection string, which contains the password).
   */
  readonly onPoolError?: (error: Error) => void;
  /** Encrypts the connection. Without it the connection is plain, as for the local database. */
  readonly ssl?: pg.PoolConfig["ssl"];
  /** The most connections the pool opens. Defaults to 10. */
  readonly max?: number;
}

/**
 * What the database settings mean for the connection: TLS (always with the server's certificate
 * checked, never switched off, and optionally against a given certificate authority) and the pool
 * size.
 */
export function databaseOptions(
  env: Pick<DatabaseEnv, "DATABASE_SSL" | "DATABASE_SSL_CA" | "DATABASE_POOL_MAX">,
): CreateDatabaseOptions {
  return {
    max: env.DATABASE_POOL_MAX,
    ...(env.DATABASE_SSL === "on"
      ? {
          ssl:
            env.DATABASE_SSL_CA === undefined
              ? { rejectUnauthorized: true }
              : { rejectUnauthorized: true, ca: env.DATABASE_SSL_CA },
        }
      : {}),
  };
}

const DEFAULT_POOL_MAX = 10;

const SET_UTC = "SET TIME ZONE 'UTC'";

/**
 * A connection that puts itself in UTC before it is handed out, so `timestamptz` values behave the
 * same on every machine. It is a command, not a start-up option (a connection pooler such as
 * Supabase's refuses start-up options it does not know), and it finishes before the connection
 * counts as open, so it never runs alongside the first real query (pg 9 refuses that).
 */
class UtcClient extends pg.Client {
  override connect(): Promise<pg.Client>;
  override connect(
    callback: ((error: Error) => void) | ((error: null, client: pg.Client) => void),
  ): void;
  override connect(
    callback?: ((error: Error) => void) | ((error: null, client: pg.Client) => void),
  ): Promise<pg.Client> | undefined {
    if (callback === undefined) {
      return super.connect().then(async (client) => {
        await this.query(SET_UTC);
        return client;
      });
    }
    // The pool calls this form. At runtime its callback takes `(error)` or `(null, client)`.
    const done = callback as (error: Error | null, client?: pg.Client) => void;
    super.connect((connectError: Error | null) => {
      if (connectError) {
        done(connectError);
        return;
      }
      this.query(SET_UTC, (queryError: Error | null) => {
        if (queryError) done(queryError);
        else done(null, this);
      });
    });
    return undefined;
  }
}

function logPoolError(error: Error): void {
  console.error("Unexpected error on an idle database connection:", error.message);
}

/**
 * Creates a connection pool and a Drizzle instance. The session time zone is forced to UTC so
 * `timestamptz` values behave identically on every machine.
 *
 * The pool always has an `error` listener: `pg` emits `error` when an idle client breaks, and an
 * unhandled `error` event would crash the whole process. The pool discards the broken client and
 * opens a new one on the next query.
 */
export function createDatabase(
  databaseUrl: string,
  options: CreateDatabaseOptions = {},
): DatabaseHandle {
  const onPoolError = options.onPoolError ?? logPoolError;
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    Client: UtcClient,
    max: options.max ?? DEFAULT_POOL_MAX,
    ...(options.ssl === undefined ? {} : { ssl: options.ssl }),
  });
  pool.on("error", onPoolError);
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}
