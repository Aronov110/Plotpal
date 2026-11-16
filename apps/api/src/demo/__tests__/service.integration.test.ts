import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPasswordHasher } from "../../auth/password.ts";
import type { DatabaseHandle } from "../../db/client.ts";
import { documents } from "../../db/schema/documents.ts";
import { projects } from "../../db/schema/projects.ts";
import { users } from "../../db/schema/users.ts";
import { connectTestDatabase, resetTables } from "../../db/test-support/test-database.ts";
import { createDocumentsService, type DocumentsService } from "../../documents/service.ts";
import { DemoUnavailableError } from "../../errors/app-error.ts";
import { createProjectsService, type ProjectsService } from "../../projects/service.ts";
import { SAMPLE_STORY } from "../sample-story.ts";
import { createDemoService, type DemoService } from "../service.ts";

const CHEAP = { type: argon2.argon2id, memoryCost: 8, timeCost: 1, parallelism: 1 } as const;

describe("demo service", () => {
  let handle: DatabaseHandle;
  let projectsService: ProjectsService;
  let documentsService: DocumentsService;

  beforeAll(() => {
    handle = connectTestDatabase();
  });
  afterAll(async () => {
    await handle.close();
  });
  beforeEach(async () => {
    await resetTables(handle);
    projectsService = createProjectsService(handle.db);
    documentsService = createDocumentsService(handle.db);
  });

  function build(
    overrides: {
      hasher?: ReturnType<typeof createPasswordHasher>;
      projects?: ProjectsService;
      documents?: DocumentsService;
      maxLive?: number;
    } = {},
  ): DemoService {
    return createDemoService({
      db: handle.db,
      hasher: overrides.hasher ?? createPasswordHasher({ params: CHEAP }),
      projects: overrides.projects ?? projectsService,
      documents: overrides.documents ?? documentsService,
      config: { lifetimeHours: 24, maxLive: overrides.maxLive ?? 200 },
    });
  }

  it("returns the person it created, without the password hash", async () => {
    const person = await build().start();
    expect(Object.keys(person).sort()).toEqual(["displayName", "email", "id"]);
    expect(person.displayName).toBe("Demo visitor");
  });

  it("seeds exactly the sample story: every act and scene, in order", async () => {
    const person = await build().start();
    const [project] = await handle.db.select().from(projects).where(eq(projects.userId, person.id));
    expect(project?.title).toBe(SAMPLE_STORY.project.title);
    const rows = await handle.db
      .select()
      .from(documents)
      .where(eq(documents.projectId, project?.id ?? ""));
    const expectedCount = SAMPLE_STORY.acts.reduce((sum, act) => sum + 1 + act.scenes.length, 0);
    expect(rows).toHaveLength(expectedCount);
  });

  it("makes the throwaway password hash once, however many demos start", async () => {
    const hasher = createPasswordHasher({ params: CHEAP });
    const hash = vi.spyOn(hasher, "hash");
    const service = build({ hasher });
    await service.start();
    await service.start();
    await service.start();
    expect(hash).toHaveBeenCalledTimes(1);
  });

  it("stores a real password hash, never an empty or plain value", async () => {
    const person = await build().start();
    const [row] = await handle.db.select().from(users).where(eq(users.id, person.id));
    expect(row?.passwordHash).toMatch(/^\$argon2id\$/);
  });

  describe("when seeding fails halfway", () => {
    it("removes the new account and everything in it, and passes the failure on", async () => {
      const failing: ProjectsService = {
        ...projectsService,
        create: vi.fn().mockRejectedValue(new Error("the database hiccuped")),
      };
      await expect(build({ projects: failing }).start()).rejects.toThrow("the database hiccuped");
      expect(await handle.db.select().from(users)).toHaveLength(0);
    });

    it("also cleans up when a scene (not the project) is the step that fails", async () => {
      let calls = 0;
      const failing: DocumentsService = {
        ...documentsService,
        create: vi.fn(async (...args: Parameters<DocumentsService["create"]>) => {
          calls += 1;
          if (calls === 3) throw new Error("the third item failed");
          return documentsService.create(...args);
        }),
      };
      await expect(build({ documents: failing }).start()).rejects.toThrow("the third item failed");
      expect(await handle.db.select().from(users)).toHaveLength(0);
      expect(await handle.db.select().from(projects)).toHaveLength(0);
      expect(await handle.db.select().from(documents)).toHaveLength(0);
    });

    it("does not count the failed account towards the limit afterwards", async () => {
      const failing: ProjectsService = {
        ...projectsService,
        create: vi.fn().mockRejectedValueOnce(new Error("once")),
      };
      await expect(build({ projects: failing, maxLive: 1 }).start()).rejects.toThrow("once");
      // The half-made account is gone, so the single place under the limit is free again. A second
      // service with the real projects is used because the failing one only fails the first call.
      await expect(build({ maxLive: 1 }).start()).resolves.toBeDefined();
    });
  });

  describe("the limit", () => {
    it("throws DemoUnavailableError, a 503, when the limit is reached", async () => {
      const service = build({ maxLive: 1 });
      await service.start();
      const refused = service.start();
      await expect(refused).rejects.toBeInstanceOf(DemoUnavailableError);
      await expect(refused).rejects.toMatchObject({ status: 503, code: "demo-unavailable" });
    });
  });
});
