import type { Core } from "../core/core.js";
import type { ServiceCommandInfo } from "../services/servicecommands.js";

/**
 * Decide which Core lifecycle phase a CLI command should run at, based on the
 * phases declared by every service that provides the command.
 *
 * Rule:
 * - All declared phases `"resolved"` → run `Core.resolve()` only (no service.init()).
 * - All `undefined` or `"initialized"` → run `Core.init()` (full initialization).
 * - Mixed → throw with an error naming the command and conflicting phases.
 * - Empty array → `"initialized"` (no providers = safest fallback).
 *
 * `undefined` in the input is treated as `"initialized"` (a service declaring no
 * phase means "no opinion — use the default, full init").
 * @param phases - per-provider phase declarations collected by `collectServiceCommands`.
 * @param cmdName - name of the command, included in the mixed-phase error for diagnosability.
 * @returns the lifecycle phase Core should run at for this command.
 */
export function selectPhase(
  phases: Array<"resolved" | "initialized" | undefined>,
  cmdName: string = "<unknown>"
): "resolved" | "initialized" {
  if (phases.length === 0) return "initialized";
  const normalized = phases.map(p => p ?? "initialized");
  const unique = new Set(normalized);
  if (unique.size === 1) {
    return normalized[0];
  }
  throw new Error(
    `Command '${cmdName}' has inconsistent phases across services: ${[...unique].join(", ")}. ` +
      `All services declaring a command must agree on phase.`
  );
}

/**
 * Boot a Core instance up to the phase required by the given command. Shared
 * entry point for every cli.ts site that dispatches a `@Command`.
 * @param core - a freshly-constructed `Core` instance (not yet resolved or initialized).
 * @param cmdName - name of the command being dispatched.
 * @param cmdInfo - merged command info from `collectServiceCommands`.
 */
export async function bootCoreForCommand(
  core: Core,
  cmdName: string,
  cmdInfo: ServiceCommandInfo
): Promise<void> {
  const phase = selectPhase(cmdInfo.phases, cmdName);
  if (phase === "resolved") {
    await core.resolve();
  } else {
    await core.init();
  }
}
