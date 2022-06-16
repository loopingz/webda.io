#!/usr/bin/env node
import * as path from "path";
import ts from "typescript";
import { writer } from "./lib.js";

const configFileName = path.join(process.cwd(), "tsconfig.json");

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
    console.log(message);
    process.exit(1);
  }
}
