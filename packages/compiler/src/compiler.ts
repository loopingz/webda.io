import ts from "typescript";
import { dirname, relative } from "path";
import { WebdaProject } from "./definition";

import { writer } from "@webda/tsc-esm";
import { useLog } from "@webda/workout";
import { generateModule as generateModule } from "./module";

/**
 * Compiler
 */
export class Compiler {
  configParseResult: any;
  tsProgram: ts.Program;
  sourceFile: ts.SourceFile;
  typeChecker: ts.TypeChecker;
  /**
   * If true the compiler has compiled already
   */
  compiled: boolean;
  /**
   * Watch program when in watch mode
   */
  watchProgram: ts.WatchOfConfigFile<ts.EmitAndSemanticDiagnosticsBuilderProgram>;
  /**
   *
   * @param project
   */
  constructor(public project: WebdaProject) {}

  /**
   * This is our main entry point
   * @param force
   */
  compile(force: boolean = false): boolean {
    if (this.compiled && !force) {
      return true;
    }
    this.project.emit("compiling");
    let result = true;
    // https://convincedcoder.com/2019/01/19/Processing-TypeScript-using-TypeScript/

    this.project.log("INFO", "Compiling...");
    let compilationStart = Date.now();
    this.createProgramFromApp();
    // Emit all code
    const { diagnostics } = this.tsProgram.emit(undefined, writer);
    const allDiagnostics = ts.getPreEmitDiagnostics(this.tsProgram).concat(diagnostics, this.configParseResult.errors);
    if (allDiagnostics.length) {
      const formatHost: ts.FormatDiagnosticsHost = {
        getCanonicalFileName: p => p,
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        getNewLine: () => ts.sys.newLine
      };
      const message = ts.formatDiagnostics(allDiagnostics, formatHost);
      message
        .split("\n")
        .filter(l => l.trim() !== "")
        .forEach(line => {
          this.project.log("WARN", line);
        });
      result = false;
    }
    if (!result) {
      this.project.emit("compilationError");
      return;
    }
    compilationStart = Date.now() - compilationStart;
    const moduleGenerationStart = Date.now();
    this.project.emit("analyzing");
    this.project.log("INFO", "Analyzing...");
    // Generate schemas
    generateModule(this);
    useLog(
      "INFO",
      `Took: Compilation - ${compilationStart}ms | Module generation - ${Date.now() - moduleGenerationStart}ms`
    );
    this.compiled = result;
    this.project.emit("done");
    return result;
  }

  /**
   * Launch compiler in watch mode
   * @param callback
   */
  watch(callback: (diagnostic: ts.Diagnostic | string) => void, watchOptions: ts.WatchOptions = {}) {
    // Load tsconfig
    this.loadTsconfig(this.project);

    const formatHost: ts.FormatDiagnosticsHost = {
      // This method is not easily reachable and is straightforward
      getCanonicalFileName: /* c8 ignore next */ p => p,
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
    let compilationStart;
    let moduleGenerationStart;
    const generateLocalModule = async () => {
      moduleGenerationStart = Date.now();

      callback("MODULE_GENERATION");
      this.loadTsconfig(this.project);
      this.tsProgram = this.watchProgram.getProgram().getProgram();

      generateModule(this);
      //this.createSchemaGenerator(this.tsProgram);
      //await this.app.generateModule();
      callback("MODULE_GENERATED");
      this.project.emit("done");
      //logger.logTitle("Compilation done");
      useLog(
        "INFO",
        `Took: Compilation - ${compilationStart}ms | Module generation - ${Date.now() - moduleGenerationStart}ms`
      );
    };
    const reportWatchStatusChanged = (diagnostic: ts.Diagnostic) => {
      if ([6031, 6032, 6194, 6193].includes(diagnostic.code)) {
        // Launching compile
        if (diagnostic.code === 6032 || diagnostic.code === 6031) {
          useLog("INFO", diagnostic.messageText);
          compilationStart = Date.now();
          this.project.emit("compiling");
        } else {
          const took = Date.now() - compilationStart;
          if ((<string>diagnostic.messageText).match(/Found [1-9]\d* error/)) {
            this.project.emit("error");
            /* c8 ignore start */
          } else if (!diagnostic.messageText.toString().startsWith("Found 0 errors")) {
            useLog("INFO", diagnostic.messageText, ` - ${took}ms`);
          }
          /* c8 ignore stop */
          // Compilation is successful, start schemas generation
          if (diagnostic.messageText.toString().startsWith("Found 0 errors")) {
            this.compiled = true;
            compilationStart = Date.now() - compilationStart;
            useLog("INFO", "Analyzing...");
            this.project.emit("analyzing");
            if (this.watchProgram) {
              generateLocalModule();
            }
          }
        }
        /* c8 ignore start */
      } else {
        // Haven't seen other code yet so display them but cannot reproduce
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
    if (this.compiled) {
      generateLocalModule();
    }
  }

  /**
   * Stop watching for change on typescript
   */
  stopWatch() {
    this.watchProgram?.close();
    this.watchProgram = undefined;
    this.compiled = false;
  }

  /**
   * Load the tsconfig.json
   */
  loadTsconfig(app: WebdaProject) {
    const configFileName = app.getAppPath("tsconfig.json");
    // basically a copy of https://github.com/Microsoft/TypeScript/blob/3663d400270ccae8b69cbeeded8ffdc8fa12d7ad/src/compiler/tsc.ts -> parseConfigFile
    this.configParseResult = ts.parseJsonConfigFileContent(
      ts.parseConfigFileTextToJson(configFileName, ts.sys.readFile(configFileName)).config,
      ts.sys,
      dirname(configFileName),
      {},
      configFileName
    );
  }

  /**
   * Generate a program from app
   * @param app
   * @returns
   */
  createProgramFromApp(app: WebdaProject = this.project): void {
    this.loadTsconfig(app);
    this.tsProgram = ts.createProgram({
      rootNames: this.configParseResult.fileNames,
      ...this.configParseResult
    });
  }
}
