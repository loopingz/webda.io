export type VersioningErrorCode =
  | "CIRCULAR"
  | "BAD_FORMAT"
  | "STRATEGY_MISMATCH"
  | "UNRESOLVED_CONFLICT";

export class VersioningError extends Error {
  public readonly code: VersioningErrorCode;
  public readonly path?: string;

  constructor(code: VersioningErrorCode, message: string, path?: string) {
    super(message);
    this.name = "VersioningError";
    this.code = code;
    this.path = path;
  }
}
