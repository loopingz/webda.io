import { randomUUID } from "crypto";
import { Core } from "../core/core";
import { Logger } from "../loggers/ilogger";
import { registerInteruptableProcess, unregisterInteruptableProcess } from "../core/instancestorage";

/**
 * Function that define the amount of time between calls
 */
export type WaitDelayer = (retries: number) => number;

/**
 * Return a delayer that always wait for the same amount of time
 * @param pause amount of time to wait
 * @returns
 */
export function WaitLinearDelay(pause: number): WaitDelayer {
  return () => pause;
}

/**
 * Pause for time ms
 *
 * @param time ms
 */
export async function sleep(time): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, time);
  });
}

/**
 * Return a delayer that always wait for the same amount of time
 * @param pause amount of time to wait
 * @returns
 */
export function WaitExponentialDelay(pause: number): WaitDelayer {
  return (retries: number) => Math.pow(2, retries - 1) * pause;
}

/**
 * Delayer factory definition
 */
export type WaitDelayerFactory = (interval: number) => WaitDelayer;

/**
 * WaitDelayer definition
 */
export interface WaitDelayerDefinition {
  /**
   * Interval
   */
  interval: number;
  /**
   * Type of delayer registered in WaitDelayerFactoryRegistry
   */
  type: string;
}

/**
 * Registry for DelayerFactory
 */
export class WaitDelayerFactories {
  static registry: { [key: string]: WaitDelayerFactory } = {
    linear: WaitLinearDelay,
    exponential: WaitExponentialDelay
  };

  /**
   * Add a delayer
   * @param type
   * @param delayer
   */
  static registerFactory(type: string, delayer: WaitDelayerFactory) {
    WaitDelayerFactories.registry[type] = delayer;
  }

  /**
   * Return a registered delayer
   * @param type
   * @returns
   */
  static getFactory(type: string): WaitDelayerFactory {
    return WaitDelayerFactories.registry[type];
  }

  /**
   *
   * @param definition to get delayer from
   * @returns
   */
  static get(definition: WaitDelayerDefinition = { interval: 1000, type: "exponential" }): WaitDelayer {
    return WaitDelayerFactories.getFactory(definition.type)(definition.interval);
  }
}

/**
 * Wait for an operation to end
 *
 * Some AWS Api require minutes and polling
 * This method will call the callback function until it returns
 * `true`, or the max `retries` has been reached.
 * Between each call, it will wait the `delay`
 *
 * If it reaches the max retries without a good answer from
 * callback, the Promise will be rejected
 *
 * @param callback to call between each call
 * @param retries max number of retries
 * @param title to display
 * @param logger logger to use to report
 * @param delayer function that return pause between each call default to WaitExponential(1000)
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
        logger.logProgressUpdate(tries, uuid);
      }
      if (await callback(mainResolve, mainReject)) {
        if (logger) {
          logger.logProgressUpdate(retries);
        }
        return;
      }
      await new Promise<void>(resolve => setTimeout(resolve, delayer(tries)));
    }
    mainReject("Timeout while waiting for " + title);
  });
}

/**
 * Return a promise that can be cancelled
 */
export class CancelablePromise<T = void> extends Promise<T> {
  cancel: () => Promise<void>;
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
        unregisterInteruptableProcess(this);
      };
      callback(resolve, reject);
    });
    this.cancel = localReject;
    registerInteruptableProcess(this);
  }
}

/**
 * Create a promise that will loop on the same callback until cancelled
 */
export class CancelableLoopPromise extends Promise<void> {
  cancel: () => Promise<void>;
  constructor(callback: (canceller: () => Promise<void>) => Promise<void>, onCancel: () => Promise<void> = undefined) {
    let localReject;
    let shouldRun = true;
    super(resolve => {
      localReject = async () => {
        if (onCancel) {
          await onCancel();
        }
        shouldRun = false;
        unregisterInteruptableProcess(this);
      };
      const loop = () => {
        if (shouldRun) {
          return callback(localReject).then(loop);
        }
      };
      resolve(callback(localReject).then(loop));
    });
    this.cancel = localReject;
    registerInteruptableProcess(this);
  }

  static get [Symbol.species]() {
    return Promise;
  }
}
