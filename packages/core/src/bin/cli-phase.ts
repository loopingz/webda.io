/**
 * Decide which Core lifecycle phase a CLI command should run at, based on the
 * phases declared by every service that provides the command.
 *
 * Rule:
 * - All declared phases `"resolved"` → run `Core.resolve()` only (no service.init()).
 * - All `undefined` or `"initialized"` → run `Core.init()` (full initialization).
 * - Mixed → throw with an error explaining the services must agree.
 * - Empty array → `"initialized"` (no providers = safest fallback).
 *
 * `undefined` in the input is treated as `"initialized"` (a service declaring no
 * phase means "no opinion — use the default, full init").
 * @param phases - per-provider phase declarations collected by `collectServiceCommands`.
 * @returns the lifecycle phase Core should run at for this command.
 */
export function selectPhase(
  phases: Array<"resolved" | "initialized" | undefined>
): "resolved" | "initialized" {
  if (phases.length === 0) return "initialized";
  const normalized = phases.map(p => p ?? "initialized");
  const unique = new Set(normalized);
  if (unique.size === 1) {
    return normalized[0];
  }
  throw new Error(
    `Command has inconsistent phases across services: ${[...unique].join(", ")}. ` +
      `All services declaring a command must agree on phase.`
  );
}
