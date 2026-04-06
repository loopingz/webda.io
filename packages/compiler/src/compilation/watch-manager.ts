import ts from "typescript";
import { writer } from "@webda/tsc-esm";
import { useLog } from "@webda/workout";
import { WebdaProject } from "../definition";
import { TsConfigLoader } from "../config/tsconfig-loader";
import { TsConfigParseResult } from "../types";

/**
 * Manages TypeScript watch mode compilation
 * Handles file watching, incremental compilation, and callbacks
 */
export class WatchManager {
  private watchProgram: ts.WatchOfConfigFile<ts.EmitAndSemanticDiagnosticsBuilderProgram> | undefined;
  private configParseResult: TsConfigParseResult | undefined;

  constructor(
    private project: WebdaProject,
    private onModuleGeneration: () => void | Promise<void>
  ) {}

  /**
   * Start watching for TypeScript file changes
   * @param callback - Called on diagnostic or status messages
   * @param watchOptions - TypeScript watch options
   */
  start(
    callback: (diagnostic: ts.Diagnostic | string) => void,
    watchOptions: ts.WatchOptions = {}
  ): void {
    // Load tsconfig
    this.configParseResult = TsConfigLoader.load(this.project);

    const formatHost: ts.FormatDiagnosticsHost = {
      getCanonicalFileName: /* c8 ignore next */ (p) => p,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => ts.sys.newLine
    };

    const reportDiagnostic = (diagnostic: ts.Diagnostic) => {
      callback(diagnostic);
      useLog(
        "WARN",
        ts
          .formatDiagnostics([diagnostic], {
            ...formatHost,
            getNewLine: () => ""
          })
          .trim()
      );
    };

    let compilationStart: number;

    const generateLocalModule = async () => {
      callback("MODULE_GENERATION");
      this.configParseResult = TsConfigLoader.load(this.project);

      await this.onModuleGeneration();

      callback("MODULE_GENERATED");
      this.project.emit("done");
    };

    const reportWatchStatusChanged = (diagnostic: ts.Diagnostic) => {
      // TypeScript diagnostic codes for compilation status
      // 6031/6032: Starting compilation
      // 6193/6194: Compilation complete
      if ([6031, 6032, 6194, 6193].includes(diagnostic.code)) {
        if (diagnostic.code === 6032 || diagnostic.code === 6031) {
          // Compilation starting
          useLog("INFO", diagnostic.messageText);
          compilationStart = Date.now();
          this.project.emit("compiling");
        } else {
          // Compilation complete
          const took = Date.now() - compilationStart;
          const message = diagnostic.messageText.toString();

          if (message.match(/Found [1-9]\d* error/)) {
            this.project.emit("compilationError");
            /* c8 ignore start */
          } else if (!message.startsWith("Found 0 errors")) {
            useLog("INFO", diagnostic.messageText, ` - ${took}ms`);
          }
          /* c8 ignore stop */

          // Compilation successful - generate module
          if (message.startsWith("Found 0 errors")) {
            this.project.emit("analyzing");
            if (this.watchProgram) {
              generateLocalModule();
            }
          }
        }
        /* c8 ignore start */
      } else {
        // Unknown diagnostic code
        useLog("INFO", diagnostic, ts.formatDiagnostic(diagnostic, formatHost));
      }
      /* c8 ignore stop */
      callback(diagnostic);
    };

    const host = ts.createWatchCompilerHost(
      this.project.getAppPath("tsconfig.json"),
      {},
      { ...ts.sys, writeFile: writer },
      ts.createEmitAndSemanticDiagnosticsBuilderProgram,
      reportDiagnostic,
      reportWatchStatusChanged,
      watchOptions
    );

    this.watchProgram = ts.createWatchProgram(host);
  }

  /**
   * Stop watching for changes
   */
  stop(): void {
    this.watchProgram?.close();
    this.watchProgram = undefined;
  }

  /**
   * Get the current TypeScript program
   * @returns Current program or undefined if not watching
   */
  getProgram(): ts.Program | undefined {
    return this.watchProgram?.getProgram().getProgram();
  }

  /**
   * Check if currently watching
   * @returns true if watch mode is active
   */
  isWatching(): boolean {
    return this.watchProgram !== undefined;
  }
}
