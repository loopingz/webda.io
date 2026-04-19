import type { VersioningConfig } from "../config.js";
import type { Path, Strategy } from "../types.js";

/**
 * Determine the diff/merge strategy to use for a string value at `path`.
 * @param path - JSON Pointer path of the string field
 * @param value - the string value being evaluated (used for heuristics such as newline detection)
 * @param cfg - versioning config that may override the default strategy per path
 * @returns the chosen `Strategy` (`"replace"` or `"line"`)
 */
export function chooseStrategy(path: Path, value: string, cfg: VersioningConfig): Strategy {
  const override = cfg.stringStrategy?.[path];
  if (override) return override;

  if (!value.includes("\n")) return "replace";

  const threshold = cfg.multilineThreshold;
  if (threshold !== undefined && value.length < threshold) return "replace";

  return "line";
}
