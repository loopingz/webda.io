import ts from "typescript";
import { writer } from "@webda/tsc-esm";
import { useLog } from "@webda/workout";
import { WebdaProject } from "../definition";
import { TsConfigLoader } from "../config/tsconfig-loader";
import { CompilationError, TsConfigParseResult } from "../types";

/**
 * TypeScript compilation results
 */
export interface CompilationResult {
  success: boolean;
  program: ts.Program;
  diagnostics: ReadonlyArray<ts.Diagnostic>;
  duration: number;
}

/**
 * Handles TypeScript compilation using the TypeScript Compiler API
 */
export class TypeScriptCompiler {
  private configParseResult: TsConfigParseResult | undefined;
  private program: ts.Program | undefined;

  constructor(private project: WebdaProject) {}

  /**
   * Compile the TypeScript project
   * @returns Compilation result with diagnostics
   */
  compile(): CompilationResult {
    const startTime = Date.now();

    // Load configuration
    this.configParseResult = TsConfigLoader.load(this.project);

    // Create program
    this.program = TsConfigLoader.createProgram(this.configParseResult);

    // Emit compiled files
    const { diagnostics: emitDiagnostics } = this.program.emit(undefined, writer, undefined, false);

    // Collect all diagnostics
    const allDiagnostics = ts
      .getPreEmitDiagnostics(this.program)
      .concat(emitDiagnostics, this.configParseResult.errors);

    // Report diagnostics
    if (allDiagnostics.length > 0) {
      this.reportDiagnostics(allDiagnostics);
    }

    const duration = Date.now() - startTime;
    const success = allDiagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length === 0;

    return {
      success,
      program: this.program,
      diagnostics: allDiagnostics,
      duration
    };
  }

  /**
   * Get the TypeScript program
   * @returns Current TypeScript program
   */
  getProgram(): ts.Program | undefined {
    return this.program;
  }

  /**
   * Get the configuration parse result
   * @returns the parsed tsconfig result
   */
  getConfig(): TsConfigParseResult | undefined {
    return this.configParseResult;
  }

  /**
   * Report compilation diagnostics
   * @param diagnostics - Diagnostics to report
   */
  private reportDiagnostics(diagnostics: ReadonlyArray<ts.Diagnostic>): void {
    const formatHost: ts.FormatDiagnosticsHost = {
      getCanonicalFileName: (p) => p,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => ts.sys.newLine
    };

    const message = ts.formatDiagnostics(diagnostics as ts.Diagnostic[], formatHost);
    message
      .split("\n")
      .filter((l) => l.trim() !== "")
      .forEach((line) => {
        this.project.log("WARN", line);
      });
  }
}
