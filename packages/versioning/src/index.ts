export const VERSION = "4.0.0-beta.1";

// Types
export type {
  Delta,
  Path,
  Strategy,
  UnifiedDiff,
  Conflict,
  ConflictKind,
  MergeResult,
  Resolution
} from "./types.js";
export type { VersioningConfig } from "./config.js";

// Errors
export { VersioningError } from "./errors.js";
export type { VersioningErrorCode } from "./errors.js";

// Engine
export { diff } from "./engine/diff.js";
export { patch } from "./engine/patch.js";
export { reverse } from "./engine/reverse.js";
export { merge3 } from "./engine/merge.js";

// Conflicts
export { resolve } from "./conflicts/resolve.js";
export { toGitMarkers, fromGitMarkers } from "./conflicts/markers.js";

// History (commit-like metadata wrapper around Delta)
export { wrap, unwrap } from "./history.js";
export type { VersionedPatch, VersionedPatchMeta } from "./history.js";

// Adapters (JSON + Schema — always available; CoreModelAdapter is
// imported separately from "@webda/versioning/coremodel" because it has an
// optional peer dep on @webda/core/@webda/models).
export { JsonAdapter } from "./adapters/json.js";
export { SchemaAdapter } from "./adapters/schema.js";
