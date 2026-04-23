import { spawn } from "node:child_process";

/**
 * Env flag set on the child process to short-circuit nested dispatch.
 * If a user's `@BuildCommand` invokes `webdac build` (e.g. via a script),
 * the spawned process sees this flag and skips its own dispatch phase
 * instead of forking forever.
 */
export const WEBDA_BUILD_DISPATCH_ENV = "WEBDA_BUILD_DISPATCH";

/**
 * Module JSON shape (subset) used by the build-dispatch check.
 */
interface ModuleLike {
  moddas?: { [type: string]: { commands?: { build?: unknown } } };
  beans?: { [type: string]: { commands?: { build?: unknown } } };
}

/**
 * Decide whether `webdac build` should spawn `webda build` after compilation.
 *
 * Returns true iff at least one configured service type appears in the module
 * with a `commands.build` entry.
 * @param module - The parsed webda.module.json produced by compilation.
 * @param configuredTypes - Fully-qualified service types from webda.config.jsonc
 *   (see `listConfiguredServiceTypes` in `@webda/utils`).
 * @returns true if at least one configured type declares a build command.
 */
export function shouldDispatchBuildHooks(module: ModuleLike, configuredTypes: string[]): boolean {
  const typesWithBuildHook = new Set<string>();
  for (const section of ["moddas", "beans"] as const) {
    const entries = module[section] || {};
    for (const [type, meta] of Object.entries(entries)) {
      if (meta?.commands && (meta.commands as any).build) {
        typesWithBuildHook.add(type);
      }
    }
  }
  return configuredTypes.some(t => typesWithBuildHook.has(t));
}

/**
 * Spawn `webda build` as a subprocess. Inherits stdio, returns its exit code.
 *
 * Sets `WEBDA_BUILD_DISPATCH=1` on the child so nested `webdac build`
 * invocations (e.g. from a misbehaving build hook) short-circuit instead
 * of recursing.
 *
 * A child exit code of `null` means it was terminated by a signal
 * (SIGKILL/SIGTERM) — we surface that as `1` so the parent treats it as
 * failure rather than silently succeeding.
 * @param cwd - Working directory; pass the project root.
 * @param deployment - Optional deployment name (`-d` flag).
 * @returns The child process exit code (0 on success, non-zero on failure or signal).
 */
export function spawnWebdaBuild(cwd: string, deployment?: string): Promise<number> {
  return new Promise<number>((resolvePromise, reject) => {
    const args = ["build"];
    if (deployment) args.unshift("-d", deployment);
    const child = spawn("webda", args, {
      cwd,
      stdio: "inherit",
      shell: false,
      env: { ...process.env, [WEBDA_BUILD_DISPATCH_ENV]: "1" }
    });
    child.on("exit", code => resolvePromise(code ?? 1));
    child.on("error", err => reject(err));
  });
}
