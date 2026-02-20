#!/usr/bin/env node
import * as path from "path";
import ts from "typescript";
import { writer, isMainModule } from "./lib.js";

/**
 * Resolve the tsconfig path from CLI arguments, mirroring tsc's -p/--project flag.
 * Accepts a file path or a directory (in which case tsconfig.json is appended).
 */
function resolveConfig(): string {
  const args = process.argv.slice(2);
  const idx = args.findIndex(a => a === "-p" || a === "--project");
  if (idx !== -1 && args[idx + 1]) {
    const p = path.resolve(process.cwd(), args[idx + 1]);
    return p.endsWith(".json") ? p : path.join(p, "tsconfig.json");
  }
  return path.join(process.cwd(), "tsconfig.json");
}

if (isMainModule(import.meta)) {
  const configFileName = resolveConfig();
  if (process.argv.includes("--watch")) {
    const host = ts.createWatchCompilerHost(
      configFileName,
      {},
      { ...ts.sys, writeFile: writer },
      ts.createSemanticDiagnosticsBuilderProgram
    );
    ts.createWatchProgram(host);

    // Should keep listening
  } else {
    const configParseResult = ts.parseJsonConfigFileContent(
      ts.parseConfigFileTextToJson(configFileName, ts.sys.readFile(configFileName) || "{}").config,
      ts.sys,
      path.dirname(configFileName),
      {},
      path.basename(configFileName)
    );

    const tsProgram = ts.createProgram({
      rootNames: configParseResult.fileNames,
      ...configParseResult
    });

    const { diagnostics } = tsProgram.emit(undefined, writer);

    const allDiagnostics = ts.getPreEmitDiagnostics(tsProgram).concat(diagnostics, configParseResult.errors);

    if (allDiagnostics.length) {
      const formatHost: ts.FormatDiagnosticsHost = {
        getCanonicalFileName: p => p,
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        getNewLine: () => ts.sys.newLine
      };
      const message = ts.formatDiagnostics(allDiagnostics, formatHost);
      process.stderr.write(message);
      process.exit(1);
    }
  }
}
