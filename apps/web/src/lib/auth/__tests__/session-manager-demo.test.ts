import { describe, expect, it } from "vitest";
import { apiError, deferred, session, setup } from "../../../test-support/session-harness.ts";
import type { PublicUser } from "../../api/auth-api.ts";
import { getAccessToken } from "../token-store.ts";

const DEMO_USER: PublicUser = {
  id: "demo-1",
  email: "demo-abc123@demo.plotpal.invalid",
  displayName: "Demo visitor",
};

/** Lets every already-resolved promise continue, so "nothing happened yet" is a real check. */
const flush = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

describe("session manager: starting a demo", () => {
  it("asks the API for a demo and signs in as the person it returns", async () => {
    const { manager, api } = setup({ csrf: undefined });
    await manager.start();
    api.demo.mockResolvedValue(session("demo-token", 900, DEMO_USER));

    await manager.startDemo();

    expect(api.demo).toHaveBeenCalledTimes(1);
    expect(manager.getState()).toEqual({ status: "signed-in", user: DEMO_USER });
    expect(getAccessToken()).toBe("demo-token");
  });

  it("keeps the login alive like any other: exactly one refresh timer", async () => {
    const { manager, api, liveTimers } = setup({ csrf: undefined });
    await manager.start();
    api.demo.mockResolvedValue(session("demo-token", 900, DEMO_USER));

    await manager.startDemo();

    expect(liveTimers()).toHaveLength(1);
  });

  it("rethrows a failure and changes nothing", async () => {
    const { manager, api, timers } = setup({ csrf: undefined });
    await manager.start();
    const failure = apiError(503);
    api.demo.mockRejectedValue(failure);

    await expect(manager.startDemo()).rejects.toBe(failure);

    expect(manager.getState()).toEqual({ status: "signed-out" });
    expect(getAccessToken()).toBeUndefined();
    expect(timers).toHaveLength(0);
  });

  it("waits for a sign-out that is still in flight, so its answer cannot delete the new cookies", async () => {
    const { manager, api } = setup();
    api.refresh.mockResolvedValueOnce(session("token-1"));
    await manager.start();
    const logout = deferred<undefined>();
    api.logout.mockReturnValueOnce(logout.promise);
    const signingOut = manager.signOut();
    api.demo.mockResolvedValue(session("demo-token", 900, DEMO_USER));

    const starting = manager.startDemo();
    await flush();
    expect(api.demo).not.toHaveBeenCalled();

    logout.resolve(undefined);
    await signingOut;
    await starting;

    expect(api.demo).toHaveBeenCalledTimes(1);
    expect(manager.getState()).toEqual({ status: "signed-in", user: DEMO_USER });
  });

  it("sends the demo request only after the sign-out has finished, not merely started", async () => {
    const { manager, api } = setup();
    api.refresh.mockResolvedValueOnce(session("token-1"));
    await manager.start();
    const logout = deferred<undefined>();
    api.logout.mockReturnValueOnce(logout.promise);
    void manager.signOut();
    const order: string[] = [];
    api.demo.mockImplementation(() => {
      order.push("demo sent");
      return Promise.resolve(session("demo-token", 900, DEMO_USER));
    });

    const starting = manager.startDemo();
    await flush();
    order.push("logout answered");
    logout.resolve(undefined);
    await starting;

    expect(order).toEqual(["logout answered", "demo sent"]);
  });
});
