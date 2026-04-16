import type { VersioningConfig } from "../config.js";
import type { Path, Strategy } from "../types.js";

export function chooseStrategy(path: Path, value: string, cfg: VersioningConfig): Strategy {
  const override = cfg.stringStrategy?.[path];
  if (override) return override;

  if (!value.includes("\n")) return "replace";

  const threshold = cfg.multilineThreshold;
  if (threshold !== undefined && value.length < threshold) return "replace";

  return "line";
}
