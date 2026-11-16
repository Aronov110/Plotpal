import { sql } from "drizzle-orm";
import { check, index, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, primaryKey, timestamptz, updatedAt } from "./columns.ts";

export const users = pgTable(
  "users",
  {
    id: primaryKey(),
    /** Always stored lowercase; the API normalizes before insert and the CHECK enforces it. */
    email: text("email").notNull().unique(),
    /** Full argon2id encoded hash string. Never log or return this column. */
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name"),
    /**
     * Set only for a throwaway demo account (see `demo/service.ts`): the moment after which it may be
     * deleted. `null` for every real account, and that is what keeps the clean-up away from them.
     */
    demoExpiresAt: timestamptz("demo_expires_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // Only demo accounts have a value, so the index stays tiny and the clean-up never scans real users.
    index("users_demo_expires_at_idx")
      .on(table.demoExpiresAt)
      .where(sql`${table.demoExpiresAt} is not null`),
    check("users_email_lowercase", sql`${table.email} = lower(${table.email})`),
    check("users_email_length", sql`char_length(${table.email}) between 3 and 254`),
    check("users_password_hash_not_empty", sql`char_length(${table.passwordHash}) > 0`),
    check(
      "users_display_name_length",
      sql`${table.displayName} is null or char_length(${table.displayName}) between 1 and 80`,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
