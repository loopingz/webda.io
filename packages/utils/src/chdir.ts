/**
 *
 * @param dir
 * @param cb
 * @returns
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
