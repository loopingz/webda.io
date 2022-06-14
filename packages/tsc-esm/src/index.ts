#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "fs";
import * as path from "path";
import ts from "typescript";

export function writer(fileName: string, text: string) {
  mkdirSync(path.dirname(fileName), { recursive: true });
  // Add the ".js" -> if module
  writeFileSync(
    fileName,
    text.replace(/^(import .* from "\..*)";$/gm, '$1.js";').replace(/^(export .* from "\..*)";$/gm, '$1.js";')
  );
}

const configFileName = path.join(process.cwd(), "tsconfig.json");

if (process.argv.includes("--watch")) {
  const host = ts.createWatchCompilerHost(
    configFileName,
    {},
    { ...ts.sys, writeFile: writer },
    ts.createSemanticDiagnosticsBuilderProgram
  );
  const program = ts.createWatchProgram(host);

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
  }
}
