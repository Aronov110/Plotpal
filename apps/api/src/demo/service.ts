import { randomBytes } from "node:crypto";
import { and, count, eq, isNotNull, lte, sql } from "drizzle-orm";
import type { PasswordHasher } from "../auth/password.ts";
import { createUser, type PublicUser, toPublicUser } from "../auth/users.ts";
import type { Database } from "../db/client.ts";
import { users } from "../db/schema/users.ts";
import type { DocumentsService } from "../documents/service.ts";
import { DemoUnavailableError } from "../errors/app-error.ts";
import type { ProjectsService } from "../projects/service.ts";
import { SAMPLE_STORY } from "./sample-story.ts";

export interface DemoConfig {
  /** How long a demo account lives before it may be deleted. */
  readonly lifetimeHours: number;
  /** The most demo accounts that may be alive at once. */
  readonly maxLive: number;
}

export const DEFAULT_DEMO_CONFIG: DemoConfig = { lifetimeHours: 24, maxLive: 200 };

/** Shown next to the visitor's name in the header, so it is clear whose account this is. */
const DEMO_DISPLAY_NAME = "Demo visitor";
/** `.invalid` is reserved (RFC 2606) and can never receive mail or belong to a real person. */
const DEMO_EMAIL_DOMAIN = "demo.plotpal.invalid";
const HOUR_MS = 60 * 60 * 1000;

export interface DemoServiceDeps {
  readonly db: Database;
  readonly hasher: PasswordHasher;
  readonly projects: ProjectsService;
  readonly documents: DocumentsService;
  readonly config: DemoConfig;
}

export interface DemoService {
  /**
   * Makes a fresh throwaway account with the sample story in it and returns who it is. The caller
   * signs that person in. Also deletes the demo accounts that have expired.
   * @throws DemoUnavailableError (503) when too many demo accounts are alive.
   */
  start(): Promise<PublicUser>;
}

/**
 * The demo for people who want to look around without signing up: every visitor gets their own
 * account, so nobody sees or breaks anybody else's copy, and each has their own AI allowance.
 *
 * There is no scheduler. Expired accounts are deleted when the next demo starts, which is also when
 * the table could grow. The database removes an account's projects, documents, logins and AI results
 * together with it (`on delete cascade`). Only rows with a `demo_expires_at` are ever touched, so a
 * real account can never be deleted by this code.
 */
export function createDemoService(deps: DemoServiceDeps): DemoService {
  const { db, hasher, projects, documents, config } = deps;

  // Every demo account needs some password hash (the column cannot be empty), but nobody may ever
  // know the password behind it. One hash of a random value, made once and thrown away, is shared by
  // all of them: it costs the server's memory-hungry hashing only one time, not once per visitor.
  let throwawayHash: Promise<string> | undefined;
  function unknowablePasswordHash(): Promise<string> {
    throwawayHash ??= hasher.hash(randomBytes(32).toString("hex")).catch((error: unknown) => {
      throwawayHash = undefined; // try again next time instead of failing forever
      throw error;
    });
    return throwawayHash;
  }

  async function removeExpired(): Promise<void> {
    await db
      .delete(users)
      .where(and(isNotNull(users.demoExpiresAt), lte(users.demoExpiresAt, sql`now()`)));
  }

  async function countLive(): Promise<number> {
    const [row] = await db
      .select({ live: count() })
      .from(users)
      .where(isNotNull(users.demoExpiresAt));
    return row?.live ?? 0;
  }

  async function seedSampleStory(userId: string): Promise<void> {
    const { project, acts } = SAMPLE_STORY;
    const created = await projects.create(userId, {
      title: project.title,
      format: "prose",
      logline: project.logline,
    });
    for (const act of acts) {
      const actItem = await documents.create(userId, created.id, {
        title: act.title,
        parentId: null,
      });
      if (actItem === undefined)
        throw new Error("The sample project was not found after creating it.");
      for (const scene of act.scenes) {
        await documents.create(userId, created.id, {
          title: scene.title,
          parentId: actItem.id,
          content: scene.text,
        });
      }
    }
  }

  return {
    async start() {
      await removeExpired();
      // A soft limit: two starts at the same moment can both pass it, which costs one extra account.
      if ((await countLive()) >= config.maxLive) throw new DemoUnavailableError();

      const user = await createUser(db, {
        email: `demo-${randomBytes(12).toString("hex")}@${DEMO_EMAIL_DOMAIN}`,
        passwordHash: await unknowablePasswordHash(),
        displayName: DEMO_DISPLAY_NAME,
        demoExpiresAt: new Date(Date.now() + config.lifetimeHours * HOUR_MS),
      });

      try {
        await seedSampleStory(user.id);
      } catch (error) {
        // A half-made demo is worse than none. If even the clean-up fails, the account is still marked
        // as a demo, so the expiry removes it later; both failures are reported together.
        try {
          await db.delete(users).where(eq(users.id, user.id));
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            "Seeding the demo failed, and the half-made account could not be removed.",
          );
        }
        throw error;
      }
      return toPublicUser(user);
    },
  };
}
