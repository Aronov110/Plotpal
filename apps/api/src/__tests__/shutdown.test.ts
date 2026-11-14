import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installShutdown, type ShutdownTarget } from "../shutdown.ts";

// When Fly replaces a machine it sends the old one a signal and waits. The API must then stop taking
// new requests, let the running ones finish and close the database, and only then exit.

class FakeProcess extends EventEmitter {}

function setup(close: () => Promise<unknown> = async () => undefined) {
  const fakeProcess = new FakeProcess();
  const exit = vi.fn<(code: number) => void>();
  const logs: string[] = [];
  const app: ShutdownTarget = {
    close: vi.fn(close),
    log: {
      info: (message: string) => logs.push(`info: ${message}`),
      error: (_error: unknown, message: string) => logs.push(`error: ${message}`),
    },
  };
  const uninstall = installShutdown(app, {
    process: fakeProcess,
    exit,
    timeoutMs: 5000,
  });
  return { fakeProcess, exit, logs, app, uninstall };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("installShutdown", () => {
  it.each(["SIGTERM", "SIGINT"])("closes the app on %s and then exits with 0", async (signal) => {
    const { fakeProcess, exit, app } = setup();
    fakeProcess.emit(signal);
    await vi.advanceTimersByTimeAsync(0);
    expect(app.close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("does not exit before the close has finished", async () => {
    let finish: () => void = () => undefined;
    const { fakeProcess, exit } = setup(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    fakeProcess.emit("SIGTERM");
    await vi.advanceTimersByTimeAsync(1000);
    expect(exit).not.toHaveBeenCalled();
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("closes once, however many signals arrive", async () => {
    const { fakeProcess, exit, app } = setup();
    fakeProcess.emit("SIGTERM");
    fakeProcess.emit("SIGTERM");
    fakeProcess.emit("SIGINT");
    await vi.advanceTimersByTimeAsync(0);
    expect(app.close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("exits with 1 and says so when the close fails", async () => {
    const { fakeProcess, exit, logs } = setup(async () => {
      throw new Error("database gone");
    });
    fakeProcess.emit("SIGTERM");
    await vi.advanceTimersByTimeAsync(0);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(logs.some((line) => line.startsWith("error:"))).toBe(true);
  });

  it("gives up after the time limit and exits with 1, so a stuck close cannot keep the machine alive", async () => {
    const { fakeProcess, exit, logs } = setup(() => new Promise<void>(() => undefined));
    fakeProcess.emit("SIGTERM");
    await vi.advanceTimersByTimeAsync(4999);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(logs.some((line) => line.includes("did not finish"))).toBe(true);
  });

  it("does not also give up after a close that finished in time", async () => {
    const { fakeProcess, exit } = setup();
    fakeProcess.emit("SIGTERM");
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("logs that it is shutting down, naming the signal", async () => {
    const { fakeProcess, logs } = setup();
    fakeProcess.emit("SIGTERM");
    await vi.advanceTimersByTimeAsync(0);
    expect(logs[0]).toContain("SIGTERM");
  });

  it("stops listening when it is uninstalled", async () => {
    const { fakeProcess, app, uninstall } = setup();
    uninstall();
    expect(fakeProcess.listenerCount("SIGTERM")).toBe(0);
    expect(fakeProcess.listenerCount("SIGINT")).toBe(0);
    fakeProcess.emit("SIGTERM");
    await vi.advanceTimersByTimeAsync(0);
    expect(app.close).not.toHaveBeenCalled();
  });
});
