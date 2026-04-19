export type VersioningErrorCode =
  | "CIRCULAR"
  | "BAD_FORMAT"
  | "STRATEGY_MISMATCH"
  | "UNRESOLVED_CONFLICT"
  | "INVALID_RESOLUTION"
  | "RESOLUTION_TYPE_MISMATCH";

/**
 * Structured error class for all `@webda/versioning` failures. Carries a
 * machine-readable `code` and an optional JSON Pointer `path` indicating
 * which part of the document triggered the error.
 */
export class VersioningError extends Error {
  public readonly code: VersioningErrorCode;
  public readonly path?: string;

  /**
   * @param code - machine-readable error code from `VersioningErrorCode`
   * @param message - human-readable description of the error
   * @param path - optional JSON Pointer path of the field that caused the error
   */
  constructor(code: VersioningErrorCode, message: string, path?: string) {
    super(message);
    this.name = "VersioningError";
    this.code = code;
    this.path = path;
  }
}
