import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installStaleChunkReload,
  RELOAD_GUARD_KEY,
  RELOAD_GUARD_MS,
} from "../reload-on-stale-chunk.ts";

/** A storage that keeps its values in a map, and can be told to fail. */
function fakeStorage(options: { failGet?: boolean; failSet?: boolean } = {}) {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string): string | null => {
      if (options.failGet) throw new Error("storage is blocked");
      return values.get(key) ?? null;
    },
    setItem: (key: string, value: string): void => {
      if (options.failSet) throw new Error("storage is full");
      values.set(key, value);
    },
  };
}

function setup(options: { failGet?: boolean; failSet?: boolean; start?: number } = {}) {
  const storage = fakeStorage(options);
  const target = new EventTarget();
  const reload = vi.fn();
  let time = options.start ?? 1_000_000;
  const remove = installStaleChunkReload({
    target,
    getStorage: () => storage,
    now: () => time,
    reload,
  });
  return {
    storage,
    reload,
    remove,
    /** A file that the page asked for is gone: the event Vite sends. */
    fail: (): Event => {
      const event = new Event("vite:preloadError", { cancelable: true });
      target.dispatchEvent(event);
      return event;
    },
    wait: (ms: number): void => {
      time += ms;
    },
  };
}

describe("reloading the page when a file of a new version is gone", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reloads the page when a file it asked for is gone", () => {
    const { fail, reload } = setup();
    fail();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("notes the time, so that it knows it has just reloaded", () => {
    const { fail, storage } = setup({ start: 5000 });
    fail();
    expect(storage.values.get(RELOAD_GUARD_KEY)).toBe("5000");
  });

  it("does not reload a second time within the guard time: the file would be gone again and again", () => {
    const { fail, reload, wait } = setup();
    fail();
    wait(RELOAD_GUARD_MS - 1);
    fail();
    fail();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads again once the guard time has passed (a later deploy)", () => {
    const { fail, reload, wait } = setup();
    fail();
    wait(RELOAD_GUARD_MS);
    fail();
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does not leave the error unseen: the event is not cancelled", () => {
    const { fail } = setup();
    expect(fail().defaultPrevented).toBe(false);
  });

  it("does not reload when it cannot read what it noted (nothing would stop a loop)", () => {
    const { fail, reload } = setup({ failGet: true });
    expect(() => fail()).not.toThrow();
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload when it cannot write what it noted", () => {
    const { fail, reload } = setup({ failSet: true });
    expect(() => fail()).not.toThrow();
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload when the browser gives no storage at all", () => {
    const target = new EventTarget();
    const reload = vi.fn();
    installStaleChunkReload({
      target,
      getStorage: () => {
        throw new Error("no storage here");
      },
      reload,
    });
    expect(() => target.dispatchEvent(new Event("vite:preloadError"))).not.toThrow();
    expect(reload).not.toHaveBeenCalled();
  });

  it.each([
    ["not a number", "yesterday"],
    ["empty", ""],
    ["infinite", "Infinity"],
  ])("treats a noted time that is %s as no note", (_what, noted) => {
    const { fail, reload, storage } = setup({ start: 7000 });
    storage.values.set(RELOAD_GUARD_KEY, noted);
    fail();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.values.get(RELOAD_GUARD_KEY)).toBe("7000");
  });

  it("treats a noted time in the future (a clock that was set back) as no note", () => {
    const { fail, reload, storage } = setup({ start: 7000 });
    storage.values.set(RELOAD_GUARD_KEY, "99999999");
    fail();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("stops listening when asked to", () => {
    const { fail, reload, remove } = setup();
    remove();
    fail();
    expect(reload).not.toHaveBeenCalled();
  });

  it("listens on the page's own window unless told otherwise", () => {
    const reload = vi.fn();
    const storage = fakeStorage();
    const remove = installStaleChunkReload({ getStorage: () => storage, reload });
    window.dispatchEvent(new Event("vite:preloadError"));
    remove();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("ignores other events", () => {
    const target = new EventTarget();
    const reload = vi.fn();
    installStaleChunkReload({ target, getStorage: () => fakeStorage(), reload });
    target.dispatchEvent(new Event("error"));
    target.dispatchEvent(new Event("vite:preloadErrors"));
    expect(reload).not.toHaveBeenCalled();
  });
});
