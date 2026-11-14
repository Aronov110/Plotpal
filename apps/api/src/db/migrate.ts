import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Database } from "./client.ts";
import { ensureUuidv7 } from "./uuidv7-shim.ts";

/** Absolute path of the folder holding the generated SQL migrations. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));

/**
 * Applies every pending migration in order, inside Drizzle's own bookkeeping.
 * Errors propagate to the caller; a failed migration is never swallowed.
 *
 * First, a server without the built-in `uuidv7()` (anything older than PostgreSQL 18, such as
 * Supabase's) gets an equivalent, because the migrations use it as the default of every id.
 */
export async function runMigrations(db: Database): Promise<void> {
  await ensureUuidv7(db);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
