import ts from "typescript";

/**
 * TypeScript configuration parse result
 */
export interface TsConfigParseResult {
  options: ts.CompilerOptions;
  fileNames: string[];
  projectReferences?: ReadonlyArray<ts.ProjectReference>;
  typeAcquisition?: ts.TypeAcquisition;
  raw?: any;
  errors: ts.Diagnostic[];
  wildcardDirectories?: ts.MapLike<ts.WatchDirectoryFlags>;
  compileOnSave?: boolean;
}

/**
 * Compilation error with proper typing
 */
export class CompilationError extends Error {
  /** Create a new CompilationError.
   * @param message - error message
   * @param diagnostics - TypeScript diagnostic entries
   */
  constructor(
    message: string,
    public diagnostics: ReadonlyArray<ts.Diagnostic>
  ) {
    super(message);
    this.name = "CompilationError";
  }
}

/**
 * Cache data structure
 */
export interface WebdaCacheData {
  sourceDigest?: string;
}
