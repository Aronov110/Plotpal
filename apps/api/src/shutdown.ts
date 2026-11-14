/** The part of the app that shutting down needs: closing it, and a log. */
export interface ShutdownTarget {
  /** Stops taking new requests, lets running ones finish, and closes the database. */
  readonly close: () => Promise<unknown>;
  readonly log: {
    info: (message: string) => void;
    error: (error: unknown, message: string) => void;
  };
}

/** The part of `process` that is used, so that tests can pass a fake one. */
export interface SignalSource {
  on: (signal: NodeJS.Signals, handler: () => void) => unknown;
  off: (signal: NodeJS.Signals, handler: () => void) => unknown;
}

export interface ShutdownOptions {
  readonly process?: SignalSource;
  readonly exit?: (code: number) => void;
  /** How long to wait for the close before giving up. Fly kills the machine after its own limit. */
  readonly timeoutMs?: number;
}

const SIGNALS: readonly NodeJS.Signals[] = ["SIGTERM", "SIGINT"];
const DEFAULT_TIMEOUT_MS = 25_000;

/**
 * Makes the app shut down cleanly when it is asked to stop (Fly sends a signal to the old machine
 * during a deploy): it stops taking new requests, lets running ones finish, ends AI runs that are
 * going (they are written down as failed) and closes the database, and only then exits. It runs
 * once, however many signals arrive, and gives up after a time limit so that a stuck close cannot
 * keep the machine alive.
 *
 * @returns A function that stops listening for the signals.
 */
export function installShutdown(app: ShutdownTarget, options: ShutdownOptions = {}): () => void {
  const source = options.process ?? process;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let started = false;

  const handlers = new Map<NodeJS.Signals, () => void>();

  const shutDown = (signal: NodeJS.Signals): void => {
    if (started) return;
    started = true;
    app.log.info(`${signal} received: shutting down`);

    const timer = setTimeout(() => {
      app.log.error(new Error("shutdown timed out"), "The shutdown did not finish in time");
      exit(1);
    }, timeoutMs);

    void app.close().then(
      () => {
        clearTimeout(timer);
        exit(0);
      },
      (error: unknown) => {
        clearTimeout(timer);
        app.log.error(error, "The shutdown failed");
        exit(1);
      },
    );
  };

  for (const signal of SIGNALS) {
    const handler = (): void => {
      shutDown(signal);
    };
    handlers.set(signal, handler);
    source.on(signal, handler);
  }

  return () => {
    for (const [signal, handler] of handlers) source.off(signal, handler);
    handlers.clear();
  };
}
