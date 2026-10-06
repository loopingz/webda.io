import { spawnSync } from "node:child_process";
import type { PackageManager } from "./options.js";

export type Runner = (
  cmd: string,
  args: string[],
  cwd: string
) => { status: number | null; error?: NodeJS.ErrnoException };

export const spawnRunner: Runner = (cmd, args, cwd) => {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  return { status: result.status, error: result.error as NodeJS.ErrnoException | undefined };
};

/**
 * Install dependencies
 * @param pm - package manager
 * @param dir - application directory
 * @param run - command runner
 * @returns true on success
 */
export function installDependencies(pm: PackageManager, dir: string, run: Runner): boolean {
  return run(pm, ["install"], dir).status === 0;
}

/**
 * Initialize a git repository with an initial commit
 * @param dir - application directory
 * @param run - command runner
 * @returns `missing` when git is not installed, `failed` when a git command fails
 */
export function initGit(dir: string, run: Runner): "done" | "missing" | "failed" {
  const version = run("git", ["--version"], dir);
  if (version.error?.code === "ENOENT") return "missing";
  for (const args of [["init"], ["add", "-A"], ["commit", "-m", "Initial commit from @webda/create"]]) {
    if (run("git", args, dir).status !== 0) return "failed";
  }
  return "done";
}
