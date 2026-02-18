import { randomUUID } from "node:crypto";
import { Logger } from "@webda/workout";

/**
 * A function that returns the number of milliseconds to wait before the next retry attempt.
 *
 * @param retries - The number of attempts made so far.
 * @returns Milliseconds to wait before the next attempt.
 */
export type WaitDelayer = (retries: number) => number;

/**
 * Return a delayer that always waits for the same fixed amount of time.
 *
 * @param pause - Number of milliseconds to wait between retries.
 * @returns A `WaitDelayer` that always returns `pause`.
 */
export function WaitLinearDelay(pause: number): WaitDelayer {
  return () => pause;
}

/**
 * Pause execution for the given number of milliseconds.
 *
 * @param time - Duration to wait in milliseconds.
 * @returns A Promise that resolves after `time` ms.
 */
export async function sleep(time): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, time);
  });
}

/**
 * Yield control back to the event loop for the specified number of ticks.
 *
 * @param ticks - Number of `setImmediate` ticks to await (default `1`).
 * @returns A Promise that resolves after all ticks have elapsed.
 */
export async function nextTick(ticks: number = 1): Promise<void> {
  while (ticks-- > 0) {
    await new Promise(resolve => setImmediate(resolve));
  }
}

/**
 * Return a delayer that uses exponential back-off: `2^(retries-1) * pause` ms.
 *
 * @param pause - Base pause in milliseconds.
 * @returns A `WaitDelayer` implementing exponential back-off.
 */
export function WaitExponentialDelay(pause: number): WaitDelayer {
  return (retries: number) => Math.pow(2, retries - 1) * pause;
}

/**
 * A factory function that creates a `WaitDelayer` from a base interval.
 */
export type WaitDelayerFactory = (interval: number) => WaitDelayer;

/**
 * Configuration object for selecting and parameterizing a `WaitDelayer` from the registry.
 */
export interface WaitDelayerDefinition {
  /**
   * Base interval in milliseconds passed to the delayer factory.
   */
  interval: number;
  /**
   * Key identifying the factory in `WaitDelayerFactories.registry` (e.g. `"linear"`, `"exponential"`).
   */
  type: string;
}

/**
 * Registry of named `WaitDelayerFactory` functions.
 * Built-in entries: `"linear"` and `"exponential"`.
 */
export class WaitDelayerFactories {
  static registry: { [key: string]: WaitDelayerFactory } = {
    linear: WaitLinearDelay,
    exponential: WaitExponentialDelay
  };

  /**
   * Register a custom delayer factory under the given type name.
   *
   * @param type - The name to register the factory under.
   * @param delayer - The factory function to register.
   */
  static registerFactory(type: string, delayer: WaitDelayerFactory) {
    WaitDelayerFactories.registry[type] = delayer;
  }

  /**
   * Look up and return a delayer factory by type name.
   *
   * @param type - The registered factory name.
   * @returns The corresponding `WaitDelayerFactory`.
   */
  static getFactory(type: string): WaitDelayerFactory {
    return WaitDelayerFactories.registry[type];
  }

  /**
   * Create a `WaitDelayer` from a `WaitDelayerDefinition`.
   *
   * @param definition - Specifies the factory type and base interval
   *   (default: `{ interval: 1000, type: "exponential" }`).
   * @returns The constructed `WaitDelayer`.
   */
  static get(definition: WaitDelayerDefinition = { interval: 1000, type: "exponential" }): WaitDelayer {
    return WaitDelayerFactories.getFactory(definition.type)(definition.interval);
  }
}

/**
 * Poll an async callback until it resolves the promise itself, returns `true`, or the retry limit is reached.
 *
 * Some AWS APIs require minutes of polling. This method calls `callback` repeatedly until it
 * returns `true` (or calls `resolve`), or until `retries` is exhausted — in which case the
 * returned Promise rejects with a timeout message.
 *
 * @param callback - Called on each attempt. Receives `resolve` and `reject` to settle early.
 *   Return `true` to signal success without calling `resolve`.
 * @param retries - Maximum number of polling attempts.
 * @param title - Optional label used for logging and timeout error messages.
 * @param logger - Optional logger for progress reporting.
 * @param delayer - Delay strategy between calls (default: `WaitExponentialDelay(1000)`).
 * @returns A Promise that resolves with the value passed to `resolve`, or rejects on timeout.
 */
export async function WaitFor<T = any>(
  callback: (resolve: (value?: T) => void, reject?: (reason?: any) => void) => Promise<boolean>,
  retries: number,
  title?: string,
  logger?: Logger,
  delayer?: WaitDelayer
): Promise<T> {
  if (!delayer) {
    delayer = WaitDelayerFactories.get();
  }
  return new Promise<T>(async (mainResolve, mainReject) => {
    let tries: number = 0;
    const uuid = randomUUID();
    if (logger) {
      logger.logProgressStart(uuid, retries, title);
    }
    while (retries > tries++) {
      if (title && logger) {
        logger.log("DEBUG", "[" + tries + "/" + retries + "]", title);
      }
      if (logger) {
        logger.logProgressUpdate(tries, uuid, title);
      }
      if (await callback(mainResolve, mainReject)) {
        if (logger) {
          logger.logProgressUpdate(retries, uuid, title);
        }
        return;
      }
      await sleep(delayer(tries));
    }
    mainReject("Timeout while waiting for " + title);
  });
}

/**
 * A Promise subclass that can be cancelled via its `cancel()` method.
 * All active instances are tracked so that `cancelAll()` can terminate them at once.
 */
export class CancelablePromise<T = void> extends Promise<T> {
  /** Cancel the promise, invoking the optional `onCancel` hook and rejecting with `"Cancelled"`. */
  cancel: () => Promise<void>;

  /**
   * @param callback - Executor function receiving `resolve` and `reject`.
   * @param onCancel - Optional async hook called before rejecting on cancel.
   */
  constructor(
    callback: (resolve: (res: T) => void, reject: (err: any) => void) => void = () => {
      // noop
    },
    onCancel: () => Promise<void> = undefined
  ) {
    let localReject;
    super((resolve, reject) => {
      localReject = async () => {
        if (onCancel) {
          await onCancel();
        }
        reject("Cancelled");
        CancelablePromise.unregisterInteruptableProcess(this);
      };
      callback(
        (...args) => {
          resolve(...args);
          CancelablePromise.unregisterInteruptableProcess(this);
        },
        (...args) => {
          reject(...args);
          CancelablePromise.unregisterInteruptableProcess(this);
        }
      );
    });
    this.cancel = localReject;
    CancelablePromise.registerInteruptableProcess(this);
  }

  /** Set of all active `CancelablePromise` instances. */
  static promises: Set<CancelablePromise<any>> = new Set();

  /**
   * Add a promise to the global active set.
   *
   * @param promise - The promise to register.
   */
  static registerInteruptableProcess(promise: CancelablePromise<any>) {
    this.promises.add(promise);
  }

  /**
   * Remove a promise from the global active set.
   *
   * @param promise - The promise to unregister.
   */
  static unregisterInteruptableProcess(promise: CancelablePromise<any>) {
    this.promises.delete(promise);
  }

  /**
   * Cancel all currently active `CancelablePromise` instances.
   *
   * @returns A Promise that resolves once every active promise has been cancelled.
   */
  static async cancelAll(): Promise<void> {
    await Promise.all(Array.from(this.promises).map(p => p.cancel()));
  }
}

/**
 * A Promise subclass that repeatedly invokes `callback` in a loop until `cancel()` is called.
 * Registered with `CancelablePromise` so that `CancelablePromise.cancelAll()` can stop it.
 */
export class CancelableLoopPromise extends Promise<void> {
  /** Cancel the loop, invoking the optional `onCancel` hook and stopping future iterations. */
  cancel: () => Promise<void>;

  /**
   * @param callback - Async function called repeatedly. Receives the `cancel` function so it
   *   can self-cancel if needed.
   * @param onCancel - Optional async hook called when `cancel()` is invoked.
   */
  constructor(callback: (canceller: () => Promise<void>) => Promise<void>, onCancel: () => Promise<void> = undefined) {
    let localReject;
    let shouldRun = true;
    super(resolve => {
      localReject = async () => {
        if (onCancel) {
          await onCancel();
        }
        shouldRun = false;
        CancelablePromise.unregisterInteruptableProcess(this);
      };
      const loop = () => {
        if (shouldRun) {
          return callback(localReject).then(loop);
        }
      };
      resolve(callback(localReject).then(loop));
    });
    this.cancel = localReject;
    CancelablePromise.registerInteruptableProcess(this);
  }

  static get [Symbol.species]() {
    return Promise;
  }
}
