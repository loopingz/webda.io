import type { Path, Strategy } from "./types.js";

export type VersioningConfig = {
  /**
   * Per-path string strategy override. Keys are exact JSON Pointers in v1
   * (no wildcards). Paths not listed use the default auto-detection rule.
   */
  stringStrategy?: Record<Path, Strategy>;
  /** Per-path array identity key (like jsondiffpatch's objectHash). */
  arrayId?: Record<Path, string>;
  /** Strings longer than this with `\n` → `"line"`. Default: any `\n` triggers `"line"`. */
  multilineThreshold?: number;
};

export const DEFAULT_CONFIG: Required<Pick<VersioningConfig, "stringStrategy" | "arrayId">> = {
  stringStrategy: {},
  arrayId: {}
};
