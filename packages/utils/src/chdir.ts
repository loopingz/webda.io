import * as process from "node:process";

/**
 * Run a callback with the current working directory temporarily changed to `dir`.
 *
 * Restores the original working directory after the callback completes,
 * whether it returns synchronously, returns a Promise, or throws.
 *
 * @param dir - The directory to switch to before invoking the callback
 * @param cb - The callback to execute in the new directory
 * @returns The return value of the callback (sync or Promise)
 */
export function runWithCurrentDirectory(dir: string, cb: () => any) {
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    const res = cb();
    if (res instanceof Promise) {
      return res.finally(() => {
        process.chdir(cwd);
      });
    } else {
      process.chdir(cwd);
    }
    return res;
  } catch (err) {
    // We cannot use block finally as it will also applies to the promise
    process.chdir(cwd);
    throw err;
  }
}
