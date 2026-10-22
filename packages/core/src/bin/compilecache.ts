/**
 * Node compile cache for the `webda` CLI (issue #365, B2).
 *
 * Node >= 22.1 can keep the V8 code cache of every loaded module on disk: the next start skips the
 * compilation of the unchanged modules. Booting a Webda application is mostly module loading, so the
 * CLI enables it by default.
 *
 * Kept free of any Webda import: the launcher loads it before anything else.
 */
import * as nodeModule from "node:module";
import { join } from "node:path";

/**
 * Folder of the compile cache, relative to the application folder (`.webda` is gitignored)
 */
export const COMPILE_CACHE_FOLDER = join(".webda", "compile-cache");

/**
 * Enable the Node compile cache for this process and, through `NODE_COMPILE_CACHE`, for its child processes
 *
 * The cache lives in `<cwd>/.webda/compile-cache`, unless `NODE_COMPILE_CACHE` already points elsewhere.
 * It is skipped when `WEBDA_COMPILE_CACHE` is `false` or `0`, when `NODE_DISABLE_COMPILE_CACHE` is set,
 * or when the Node version has no `module.enableCompileCache`.
 *
 * @param cwd - the application folder
 * @param env - environment to read the options from and to export `NODE_COMPILE_CACHE` to
 * @returns the cache folder, undefined when the compile cache is not enabled
 */
export function enableCompileCache(cwd: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const option = env.WEBDA_COMPILE_CACHE?.trim().toLowerCase();
  if (option === "false" || option === "0" || env.NODE_DISABLE_COMPILE_CACHE) {
    return undefined;
  }
  if (typeof nodeModule.enableCompileCache !== "function") {
    return undefined;
  }
  const directory = env.NODE_COMPILE_CACHE || join(cwd, COMPILE_CACHE_FOLDER);
  try {
    const { status } = nodeModule.enableCompileCache(directory);
    if (status === nodeModule.constants.compileCacheStatus.FAILED) {
      return undefined;
    }
  } catch {
    // A cache is an optimization: never prevent the CLI from starting
    return undefined;
  }
  // Child processes enable it at startup from the environment (the CLI runs in a child of the launcher)
  env.NODE_COMPILE_CACHE = directory;
  return directory;
}
