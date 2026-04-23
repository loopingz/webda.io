import { spawn } from "node:child_process";

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
 * @param cwd - Working directory; pass the project root.
 * @param deployment - Optional deployment name (`-d` flag).
 * @returns The child process exit code (0 on success).
 */
export function spawnWebdaBuild(cwd: string, deployment?: string): Promise<number> {
  return new Promise<number>((resolvePromise, reject) => {
    const args = ["build"];
    if (deployment) args.unshift("-d", deployment);
    const child = spawn("webda", args, { cwd, stdio: "inherit", shell: false });
    child.on("exit", code => resolvePromise(code ?? 0));
    child.on("error", err => reject(err));
  });
}
