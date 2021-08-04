import { Logger } from "..";
import { v4 as uuidv4 } from "uuid";

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
 * Return a delayer that always wait for the same amount of time
 * @param pause amount of time to wait
 * @returns
 */
export function WaitExponentialDelay(pause: number): WaitDelayer {
  return (retries: number) => Math.pow(2, retries - 1) * pause;
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
  callback: (resolve: (value?: T) => void, reject: (reason?: any) => void) => Promise<boolean>,
  retries: number,
  title: string,
  logger?: Logger,
  delayer?: WaitDelayer
): Promise<T> {
  if (!delayer) {
    delayer = WaitExponentialDelay(1000);
  }
  return new Promise<T>(async (mainResolve, mainReject) => {
    let tries: number = 0;
    let uuid = uuidv4();
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
