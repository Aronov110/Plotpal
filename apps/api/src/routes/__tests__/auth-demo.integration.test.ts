import { asc, count, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { documents } from "../../db/schema/documents.ts";
import { projects } from "../../db/schema/projects.ts";
import { refreshSessions } from "../../db/schema/refresh-sessions.ts";
import { users } from "../../db/schema/users.ts";
import {
  insertDocument,
  insertProject,
  insertRefreshSession,
  insertUser,
} from "../../db/test-support/factories.ts";
import {
  type AuthTestApp,
  buildAuthTestApp,
  CookieJar,
  findCookie,
  logIn,
  ORIGIN,
  PASSWORD,
  refresh,
  type SessionJson,
  signUp,
} from "../../test-support/auth-app.ts";

const PROBLEM = /^application\/problem\+json/;
const HOUR_MS = 60 * 60 * 1000;

let t: AuthTestApp;
afterEach(async () => {
  await t.close();
});

/** Presses "Try the demo" the way the web app does: a POST with an Origin and no body. */
async function startDemo(headers: Record<string, string> = { origin: ORIGIN }) {
  const response = await t.app.inject({ method: "POST", url: "/auth/demo", headers });
  const jar = new CookieJar();
  jar.update(response);
  return { response, jar, body: response.json<SessionJson>() };
}

async function demoUsers() {
  const rows = await t.handle.db.select().from(users).orderBy(asc(users.createdAt));
  return rows.filter((row) => row.demoExpiresAt !== null);
}

describe("POST /auth/demo", () => {
  it("signs a visitor in at once and answers 201 with the same shape as sign-up", async () => {
    t = await buildAuthTestApp();
    const { response, body } = await startDemo();

    expect(response.statusCode).toBe(201);
    expect(response.headers["content-type"]).toMatch(/^application\/json/);
    expect(body).toEqual({
      user: {
        id: expect.any(String),
        email: expect.stringMatching(/^demo-[0-9a-f]{24}@demo\.plotpal\.invalid$/),
        displayName: "Demo visitor",
      },
      accessToken: expect.any(String),
      expiresIn: 900,
    });
  });

  it("works with no body and no content type, which is what the web app sends", async () => {
    t = await buildAuthTestApp();
    const response = await t.app.inject({
      method: "POST",
      url: "/auth/demo",
      headers: { origin: ORIGIN },
    });
    expect(response.statusCode).toBe(201);
  });

  it("sets the same locked refresh cookie and readable CSRF cookie as sign-up", async () => {
    t = await buildAuthTestApp();
    const { response } = await startDemo();
    expect(findCookie(response, "refresh_token")?.attributes).toMatchObject({
      httponly: true,
      samesite: "Strict",
      path: "/auth",
    });
    const csrf = findCookie(response, "csrf_token");
    expect(csrf?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(csrf?.attributes).not.toHaveProperty("httponly");
  });

  it("never puts the refresh token or the CSRF code in the body", async () => {
    t = await buildAuthTestApp();
    const { response, jar } = await startDemo();
    expect(response.body).not.toContain(jar.get("refresh_token") ?? "never");
    expect(response.body).not.toContain(jar.get("csrf_token") ?? "never");
  });

  it("gives the access token the power to act as the demo person", async () => {
    t = await buildAuthTestApp();
    const { body } = await startDemo();
    const me = await t.app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${body.accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({ user: body.user });

    const list = await t.app.inject({
      method: "GET",
      url: "/projects",
      headers: { authorization: `Bearer ${body.accessToken}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ items: { title: string }[] }>().items.map((p) => p.title)).toEqual([
      "The Last Light",
    ]);
  });

  it("lets the login be renewed with the refresh cookie, like any other login", async () => {
    t = await buildAuthTestApp();
    const { jar } = await startDemo();
    const renewed = await refresh(t.app, jar);
    expect(renewed.statusCode).toBe(200);
  });

  describe("the account it creates", () => {
    it("is marked as a demo and expires 24 hours from now", async () => {
      t = await buildAuthTestApp();
      const before = Date.now();
      await startDemo();
      const [demo] = await demoUsers();
      const expires = demo?.demoExpiresAt?.getTime() ?? 0;
      expect(Math.abs(expires - (before + 24 * HOUR_MS))).toBeLessThan(2 * 60 * 1000);
    });

    it("is different every time, so visitors never share an account", async () => {
      t = await buildAuthTestApp();
      const first = await startDemo();
      const second = await startDemo();
      expect(first.body.user.id).not.toBe(second.body.user.id);
      expect(first.body.user.email).not.toBe(second.body.user.email);
      expect(await demoUsers()).toHaveLength(2);
    });

    it("is not marked as a demo when a real person signs up", async () => {
      t = await buildAuthTestApp();
      await signUp(t.app);
      expect(await demoUsers()).toHaveLength(0);
    });

    it("cannot be signed in to with a password, whatever is tried", async () => {
      t = await buildAuthTestApp();
      const { body } = await startDemo();
      for (const password of [PASSWORD, "", "demo", "Demo visitor", "a".repeat(40)]) {
        const response = await logIn(t.app, body.user.email, password);
        expect(response.statusCode).toBe(401);
      }
    });
  });

  describe("the sample story", () => {
    it("is one prose project, owned by the visitor, with a note that it is a demo", async () => {
      t = await buildAuthTestApp();
      const { body } = await startDemo();
      const rows = await t.handle.db
        .select()
        .from(projects)
        .where(eq(projects.userId, body.user.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ title: "The Last Light", format: "prose" });
      expect(rows[0]?.logline).toMatch(/demo story/i);
      expect(rows[0]?.logline).toMatch(/deleted automatically after 24 hours/i);
    });

    it("has two acts with two scenes each, in order", async () => {
      t = await buildAuthTestApp();
      const { body } = await startDemo();
      const [project] = await t.handle.db
        .select()
        .from(projects)
        .where(eq(projects.userId, body.user.id));
      const rows = await t.handle.db
        .select()
        .from(documents)
        .where(eq(documents.projectId, project?.id ?? ""))
        .orderBy(asc(documents.position));
      const byId = new Map(rows.map((row) => [row.id, row.title]));
      const tree = rows
        .filter((row) => row.parentId === null)
        .map((act) => ({
          act: act.title,
          scenes: rows
            .filter((row) => row.parentId === act.id)
            .sort((a, b) => a.position - b.position)
            .map((scene) => scene.title),
        }));
      expect(byId.size).toBe(6);
      expect(tree).toEqual([
        { act: "Act 1: The Storm", scenes: ["The last boat", "The lamp"] },
        { act: "Act 2: The Visitor", scenes: ["A knock at midnight", "The logbook"] },
      ]);
    });

    it("has written text in every scene, and the two planted plot holes are in it", async () => {
      t = await buildAuthTestApp();
      const { body } = await startDemo();
      const [project] = await t.handle.db
        .select()
        .from(projects)
        .where(eq(projects.userId, body.user.id));
      const rows = await t.handle.db
        .select()
        .from(documents)
        .where(eq(documents.projectId, project?.id ?? ""));
      const scenes = rows.filter((row) => row.parentId !== null);
      expect(scenes).toHaveLength(4);
      for (const scene of scenes) expect(scene.content.length).toBeGreaterThan(200);

      const text = (title: string) => rows.find((row) => row.title === title)?.content ?? "";
      // The causeway is under water from five o'clock, yet the brother walks across it dry.
      expect(text("The last boat")).toMatch(/By five the sea had taken the causeway/);
      expect(text("A knock at midnight")).toMatch(/Dry all the way/);
      // The lamp is lit at dusk in one scene, and at midnight according to the logbook.
      expect(text("The lamp")).toMatch(/At dusk Mara lit the lamp/);
      expect(text("The logbook")).toMatch(/lit the lamp at midnight/);
    });

    it("counts the words of each scene, like text typed in the editor", async () => {
      t = await buildAuthTestApp();
      const { body } = await startDemo();
      const [project] = await t.handle.db
        .select()
        .from(projects)
        .where(eq(projects.userId, body.user.id));
      const rows = await t.handle.db
        .select()
        .from(documents)
        .where(eq(documents.projectId, project?.id ?? ""));
      for (const row of rows.filter((r) => r.parentId !== null)) {
        expect(row.wordCount).toBeGreaterThan(30);
      }
    });
  });

  describe("cleaning up", () => {
    it("removes an expired demo, with its project, documents and logins, when a new demo starts", async () => {
      t = await buildAuthTestApp();
      const db = t.handle.db;
      const old = await insertUser(db, { demoExpiresAt: new Date(Date.now() - HOUR_MS) });
      const project = await insertProject(db, old.id);
      await insertDocument(db, project.id);
      await insertRefreshSession(db, old.id);

      await startDemo();

      expect(await db.select().from(users).where(eq(users.id, old.id))).toHaveLength(0);
      expect(
        await db.select({ n: count() }).from(projects).where(eq(projects.id, project.id)),
      ).toEqual([{ n: 0 }]);
      expect(
        await db.select().from(documents).where(eq(documents.projectId, project.id)),
      ).toHaveLength(0);
      expect(
        await db.select().from(refreshSessions).where(eq(refreshSessions.userId, old.id)),
      ).toHaveLength(0);
    });

    it("never removes a real account, however old", async () => {
      t = await buildAuthTestApp();
      const db = t.handle.db;
      const real = await insertUser(db, { createdAt: new Date("2020-01-01T00:00:00Z") });
      const project = await insertProject(db, real.id);

      await startDemo();

      expect(await db.select().from(users).where(eq(users.id, real.id))).toHaveLength(1);
      expect(await db.select().from(projects).where(eq(projects.id, project.id))).toHaveLength(1);
    });

    it("keeps a demo that has not expired yet", async () => {
      t = await buildAuthTestApp();
      const db = t.handle.db;
      const live = await insertUser(db, { demoExpiresAt: new Date(Date.now() + HOUR_MS) });

      await startDemo();

      expect(await db.select().from(users).where(eq(users.id, live.id))).toHaveLength(1);
    });

    it("tells a removed demo that its session has ended, not that something broke", async () => {
      t = await buildAuthTestApp();
      const { body, jar } = await startDemo();
      await t.handle.db
        .update(users)
        .set({ demoExpiresAt: new Date(Date.now() - HOUR_MS) })
        .where(eq(users.id, body.user.id));
      await startDemo(); // someone else's demo starts, and the sweep removes the expired one

      const response = await refresh(t.app, jar);
      expect(response.statusCode).toBe(401);
      expect(response.headers["content-type"]).toMatch(PROBLEM);
    });
  });

  describe("the limit on live demos", () => {
    it("refuses a new demo with 503 when too many are alive, and says to try again later", async () => {
      t = await buildAuthTestApp({ demo: { lifetimeHours: 24, maxLive: 2 } });
      expect((await startDemo()).response.statusCode).toBe(201);
      expect((await startDemo()).response.statusCode).toBe(201);

      const { response } = await startDemo();
      expect(response.statusCode).toBe(503);
      expect(response.headers["content-type"]).toMatch(PROBLEM);
      expect(response.headers["retry-after"]).toBeDefined();
      expect(response.json<{ type: string }>().type).toMatch(/demo-unavailable$/);
      expect(await demoUsers()).toHaveLength(2);
    });

    it("lets a new demo in again once an old one has expired", async () => {
      t = await buildAuthTestApp({ demo: { lifetimeHours: 24, maxLive: 2 } });
      const first = await startDemo();
      await startDemo();
      await t.handle.db
        .update(users)
        .set({ demoExpiresAt: new Date(Date.now() - HOUR_MS) })
        .where(eq(users.id, first.body.user.id));

      expect((await startDemo()).response.statusCode).toBe(201);
    });

    it("does not count real accounts", async () => {
      t = await buildAuthTestApp({ demo: { lifetimeHours: 24, maxLive: 1 } });
      await insertUser(t.handle.db);
      await insertUser(t.handle.db);
      expect((await startDemo()).response.statusCode).toBe(201);
    });

    it("uses the lifetime it is given", async () => {
      t = await buildAuthTestApp({ demo: { lifetimeHours: 1, maxLive: 10 } });
      const before = Date.now();
      await startDemo();
      const [demo] = await demoUsers();
      const expires = demo?.demoExpiresAt?.getTime() ?? 0;
      expect(Math.abs(expires - (before + HOUR_MS))).toBeLessThan(2 * 60 * 1000);
    });
  });

  describe("protection against misuse", () => {
    it("refuses a request that comes from a page on another site", async () => {
      t = await buildAuthTestApp();
      const { response } = await startDemo({ origin: "https://evil.example.com" });
      expect(response.statusCode).toBe(403);
      expect(await demoUsers()).toHaveLength(0);
    });

    it("refuses a request with no Origin at all", async () => {
      t = await buildAuthTestApp();
      const { response } = await startDemo({});
      expect(response.statusCode).toBe(403);
      expect(await demoUsers()).toHaveLength(0);
    });

    it("slows a visitor down with its own limit, and says when to try again", async () => {
      t = await buildAuthTestApp({ limits: { demo: { max: 2, windowSeconds: 60 } } });
      await startDemo();
      await startDemo();
      const { response } = await startDemo();
      expect(response.statusCode).toBe(429);
      expect(response.headers["content-type"]).toMatch(PROBLEM);
      expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
      expect(await demoUsers()).toHaveLength(2);
    });

    it("does not use up the sign-up limit", async () => {
      t = await buildAuthTestApp({
        limits: {
          demo: { max: 50, windowSeconds: 60 },
          register: { max: 1, windowSeconds: 60 },
        },
      });
      await startDemo();
      await startDemo();
      const { response } = await signUp(t.app);
      expect(response.statusCode).toBe(201);
    });
  });

  describe("switching it off", () => {
    it("is not there at all when DEMO_ENABLED is false", async () => {
      t = await buildAuthTestApp({ env: { DEMO_ENABLED: "false" } });
      const { response } = await startDemo();
      expect(response.statusCode).toBe(404);
      expect(response.headers["content-type"]).toMatch(PROBLEM);
      expect(await demoUsers()).toHaveLength(0);
    });

    it("is there by default", async () => {
      t = await buildAuthTestApp();
      expect((await startDemo()).response.statusCode).toBe(201);
    });
  });

  describe("what is logged", () => {
    it("notes that a demo started, by id, and never the email, a token or a cookie", async () => {
      t = await buildAuthTestApp();
      const { body, jar } = await startDemo();

      const entry = t.logs.entries.find((line) => line.event === "demo.started");
      expect(entry).toMatchObject({ event: "demo.started", userId: body.user.id });
      expect(t.logs.text).not.toContain(body.user.email);
      expect(t.logs.text).not.toContain(body.accessToken);
      expect(t.logs.text).not.toContain(jar.get("refresh_token") ?? "never");
    });
  });

  it("is described in the generated API docs", async () => {
    t = await buildAuthTestApp({ env: { DOCS_ENABLED: "true" } });
    const response = await t.app.inject({ method: "GET", url: "/docs/openapi.json" });
    expect(response.statusCode).toBe(200);
    const spec = response.json<{ paths: Record<string, Record<string, { summary?: string }>> }>();
    expect(spec.paths["/auth/demo"]?.post?.summary).toMatch(/demo/i);
  });
});
