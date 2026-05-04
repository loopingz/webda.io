import ts from "typescript";
import { dirname } from "path";
import { WebdaProject } from "./definition";

import { writer } from "@webda/tsc-esm";
import { useLog } from "@webda/workout";
import { generateModule as generateModule } from "./module";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { FileUtils } from "@webda/utils";
import {
  createAccessorTransformer,
  createBehaviorTransformer,
  createDeclarationAccessorTransformer,
  createQlValidatorTransformer,
  computeCoercibleFields,
  DEFAULT_COERCIONS,
  PerfTracker
} from "@webda/ts-plugin/transform";
import type { CoercibleFieldMap } from "@webda/ts-plugin/transform";

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
   * Create a new compiler for the given project
   * @param project - the Webda project to compile
   */
  constructor(public project: WebdaProject) {}

  /**
   * MD5 hex digest of a file's contents.
   * @param path - absolute path to the file
   * @returns the digest, or undefined if the file is missing
   */
  private fileDigest(path: string): string | undefined {
    if (!existsSync(path)) {
      return undefined;
    }
    return createHash("md5").update(readFileSync(path)).digest("hex");
  }

  /**
   * Add a system to recompile if needed
   * @returns true if compilation is needed
   */
  requireCompilation(): boolean {
    const f = this.project.getAppPath(".webda/cache");
    if (!existsSync(this.project.getAppPath(".webda"))) {
      mkdirSync(this.project.getAppPath(".webda"));
    }
    if (!existsSync(f)) {
      return true;
    }
    const webdaCache: {
      sourceDigest?: string;
      moduleDigest?: string;
    } = FileUtils.load(f, "json");
    const currentDigest = this.project.getDigest();
    if (webdaCache.sourceDigest !== currentDigest) {
      return true;
    }
    // Cross-check the on-disk webda.module.json: sources may be unchanged but
    // the generated module file can drift from the cache (git checkout, manual
    // edit, framework upgrade that regenerates it).
    const modulePath = this.project.getAppPath("webda.module.json");
    const moduleDigest = this.fileDigest(modulePath);
    if (!moduleDigest || moduleDigest !== webdaCache.moduleDigest) {
      return true;
    }
    // Final guard: the module file must declare the same source digest it
    // was generated against. Catches replacement files that happen to have
    // the cached content hash recorded but were produced under different
    // sources.
    try {
      const moduleContent = FileUtils.load(modulePath, "json") as { sourceDigest?: string };
      if (moduleContent.sourceDigest !== currentDigest) {
        return true;
      }
    } catch {
      return true;
    }
    useLog("DEBUG", "Skipping compilation as nothing changed");
    return false;
  }

  /**
   * This is our main entry point
   * @param force - skip cache and force recompilation
   * @returns true if compilation succeeded
   */
  compile(force: boolean = false): boolean {
    if ((this.compiled || !this.requireCompilation()) && !force) {
      return true;
    }
    this.project.emit("compiling");
    let result = true;
    // https://convincedcoder.com/2019/01/19/Processing-TypeScript-using-TypeScript/

    let compilationStart = Date.now();
    this.createProgramFromApp();
    const check = this.tsProgram.getTypeChecker();

    // Build accessor transforms from @webda/ts-plugin
    const coercions = { ...DEFAULT_COERCIONS };
    const modelBases = new Set(["Model", "UuidModel"]);

    // Read plugin config from tsconfig.json (compilerOptions.plugins)
    const pluginConfig = (this.configParseResult?.options?.plugins as any[])?.find(
      (p: any) => p.name === "@webda/ts-plugin"
    );
    const accessorsForAll = pluginConfig?.accessorsForAll ?? false;

    // Performance tracker for transform phases
    const perfEnabled = pluginConfig?.perf ?? false;
    const perf = new PerfTracker(msg => this.project.log("INFO", msg), {
      enabled: perfEnabled,
      warnMs: pluginConfig?.perfWarnMs ?? 100
    });

    // Pre-compute coercible fields (static registry + set-method detection)
    const coercibleFields = perf.measure("computeCoercibleFields", () =>
      computeCoercibleFields(ts, this.tsProgram, coercions, modelBases, accessorsForAll, perf)
    );

    // Collect WQL diagnostics so they flow through the normal compiler error
    // reporting path rather than throwing.
    const qlDiagnostics: ts.Diagnostic[] = [];

    // Emit all code with accessor + behavior transforms.
    // The behaviors transformer augments `@WebdaBehavior`-tagged classes
    // (parent slot getter, toJSON) and emits a `__hydrateBehaviors(rawData)`
    // method on every model that has Behavior-typed properties — that method
    // is what wires `instance.<attribute>` into a real Behavior instance at
    // hydration time.
    const { diagnostics } = perf.measure("emit", () =>
      this.tsProgram.emit(undefined, writer, undefined, false, {
        before: [
          createAccessorTransformer(ts, this.tsProgram, coercions, modelBases, coercibleFields, accessorsForAll, perf),
          // Pass `coercibleFields` so the behaviors transformer knows when
          // accessors will inject `import { WEBDA_STORAGE }` for the same
          // source file. TypeScript runs `before:` transformers in parallel
          // on the unmodified source, so without this signal both
          // transformers prepend their own import → duplicate ESM binding
          // → module load fails.
          createBehaviorTransformer(ts, this.tsProgram, undefined, coercibleFields),
          // Validate WebdaQLString<T> call sites and rewrite template literals
          // to escape() calls. Diagnostics are forwarded through the normal
          // compiler error path (throwOnError: false).
          createQlValidatorTransformer(ts, this.tsProgram, {
            throwOnError: false,
            onDiagnostic: d => qlDiagnostics.push(d)
          })
        ],
        afterDeclarations: [
          createDeclarationAccessorTransformer(
            ts,
            this.tsProgram,
            coercions,
            modelBases,
            coercibleFields,
            accessorsForAll,
            perf
          )
        ]
      })
    );

    if (perf.enabled) {
      this.project.log("INFO", perf.summary());
    }

    // Filter out false TS2322 diagnostics for coercible property assignments
    const allDiagnostics = ts
      .getPreEmitDiagnostics(this.tsProgram)
      .concat(diagnostics, qlDiagnostics, this.configParseResult.errors)
      .filter(
        diag =>
          !isCoercibleAssignmentError(ts, this.tsProgram, diag, coercions, modelBases, coercibleFields, accessorsForAll)
      );
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
    // Generate schemas
    generateModule(this);
    useLog(
      "INFO",
      `Took: Compilation - ${compilationStart}ms | Module generation - ${Date.now() - moduleGenerationStart}ms`
    );
    this.compiled = result;
    this.updateCache();
    this.project.emit("done");
    return result;
  }

  /**
   * Persist the build cache: source digest plus the generated module file's
   * content hash, so {@link requireCompilation} can detect both source-file
   * changes and external mutations of webda.module.json.
   */
  private updateCache(): void {
    const f = this.project.getAppPath(".webda/cache");
    const webdaCache: {
      sourceDigest?: string;
      moduleDigest?: string;
    } = existsSync(f) ? FileUtils.load(f, "json") : {};
    webdaCache.sourceDigest = this.project.getDigest();
    webdaCache.moduleDigest = this.fileDigest(this.project.getAppPath("webda.module.json"));
    FileUtils.save(webdaCache, f, "json");
  }

  /**
   * Launch compiler in watch mode
   * @param callback - called on diagnostic or status messages
   * @param watchOptions - TypeScript watch options
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
      this.updateCache();
      callback("MODULE_GENERATED");
      this.project.emit("done");
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
            this.project.emit("compilationError");
            /* c8 ignore start */
          } else if (!diagnostic.messageText.toString().startsWith("Found 0 errors")) {
            useLog("INFO", diagnostic.messageText, ` - ${took}ms`);
          }
          /* c8 ignore stop */
          // Compilation is successful, start schemas generation
          if (diagnostic.messageText.toString().startsWith("Found 0 errors")) {
            this.compiled = true;
            compilationStart = Date.now() - compilationStart;
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
   * @param app - the Webda project
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
   * @param app - the Webda project to create a program from
   */
  createProgramFromApp(app: WebdaProject = this.project): void {
    this.loadTsconfig(app);
    this.tsProgram = ts.createProgram({
      rootNames: this.configParseResult.fileNames,
      ...this.configParseResult
    });
  }
}

/**
 * Check if a diagnostic is a false TS2322 error on a coercible property assignment.
 * For example, assigning a string to a Date field that will be coerced at runtime.
 * @param tsModule - the TypeScript module
 * @param program - the TypeScript program
 * @param diag - the diagnostic to check
 * @param coercions - coercion registry
 * @param modelBases - set of known model base class names
 * @param coercibleFields - pre-computed coercible field map
 * @param accessorsForAll - whether accessors apply to all classes
 * @returns true if the diagnostic is a false positive
 */
function isCoercibleAssignmentError(
  tsModule: typeof ts,
  program: ts.Program,
  diag: ts.Diagnostic,
  coercions: Record<string, { setterType: string }>,
  modelBases: Set<string>,
  coercibleFields?: CoercibleFieldMap,
  accessorsForAll?: boolean
): boolean {
  if (diag.code !== 2322) return false;
  if (diag.start === undefined || !diag.file) return false;

  const checker = program.getTypeChecker();
  const sourceFile = diag.file;

  // Find the node at the diagnostic position
  const node = findNodeAt(tsModule, sourceFile, diag.start);
  if (!node) return false;

  // Walk up to find the assignment expression
  let current: ts.Node | undefined = node;
  let assignment: ts.BinaryExpression | undefined;
  while (current) {
    if (tsModule.isBinaryExpression(current) && current.operatorToken.kind === tsModule.SyntaxKind.EqualsToken) {
      assignment = current;
      break;
    }
    current = current.parent;
  }
  if (!assignment) return false;

  const left = assignment.left;
  if (!tsModule.isPropertyAccessExpression(left)) return false;

  const symbol = checker.getSymbolAtLocation(left.name);
  if (!symbol?.declarations?.length) return false;

  const propDecl = symbol.declarations[0];
  if (!tsModule.isPropertyDeclaration(propDecl)) return false;
  if (!propDecl.parent || !tsModule.isClassDeclaration(propDecl.parent)) return false;

  // Check if the class should have accessor treatment (model, Accessors marker, or accessorsForAll)
  if (
    !accessorsForAll &&
    !isModelClassForDiag(tsModule, propDecl.parent, checker, modelBases) &&
    !hasAccessorsMarkerForDiag(tsModule, propDecl.parent, checker)
  )
    return false;

  // Get the property name and class name
  const propName = propDecl.name.getText(propDecl.getSourceFile());
  const className = propDecl.parent.name?.getText() ?? "";

  // Resolve setter type: check pre-computed map first, then static coercion registry
  let setterType: string | undefined;
  const fieldCoercion = coercibleFields?.get(className)?.get(propName);
  if (fieldCoercion) {
    setterType = fieldCoercion.setterType;
  } else {
    const propType = checker.getTypeAtLocation(propDecl);
    const typeName = checker.typeToString(propType);
    const rule = coercions[typeName];
    if (rule) {
      setterType = rule.setterType;
    }
  }

  if (!setterType) return false;

  // Check if the assigned type is accepted by the setter
  const assignedType = checker.getTypeAtLocation(assignment.right);
  const assignedTypeName = checker.typeToString(assignedType);
  const acceptedTypes = setterType.split("|").map(t => t.trim());

  // Split assigned type in case it's a union (e.g. "string | SecretString")
  const assignedParts = assignedTypeName.split("|").map(t => t.trim());

  // Every part of the assigned union must be accepted by the setter
  return assignedParts.every(part =>
    acceptedTypes.some(t => {
      if (part === t) return true;
      if (t === "string" && part.startsWith('"')) return true;
      if (t === "number" && /^\d+(\.\d+)?$/.test(part)) return true;
      return false;
    })
  );
}

/**
 * Find the most specific AST node at the given character position in a source file
 * @param tsModule - the TypeScript module
 * @param sourceFile - the source file to search
 * @param position - the character position
 * @returns the deepest node at the position
 */
function findNodeAt(tsModule: typeof ts, sourceFile: ts.SourceFile, position: number): ts.Node | undefined {
  /**
   * Recursively walk children to find the deepest node containing the position
   * @param node - current node to check
   * @returns the deepest matching node
   */
  function find(node: ts.Node): ts.Node | undefined {
    if (position >= node.getStart(sourceFile) && position < node.getEnd()) {
      return tsModule.forEachChild(node, find) || node;
    }
    return undefined;
  }
  return find(sourceFile);
}

/**
 * Check whether a class declaration inherits from one of the known model base classes
 * @param tsModule - the TypeScript module
 * @param classDecl - the class declaration to check
 * @param checker - the type checker
 * @param modelBases - set of known model base class names
 * @returns true if the class extends a model base
 */
function isModelClassForDiag(
  tsModule: typeof ts,
  classDecl: ts.ClassDeclaration,
  checker: ts.TypeChecker,
  modelBases: Set<string>
): boolean {
  const visited = new Set<string>();
  let current: ts.ClassDeclaration | undefined = classDecl;

  while (current) {
    const name = current.name?.getText() ?? "";
    if (name && visited.has(name)) break;
    if (name) visited.add(name);
    if (modelBases.has(name)) return true;

    if (!current.heritageClauses) break;
    let foundBase = false;
    for (const clause of current.heritageClauses) {
      if (clause.token !== tsModule.SyntaxKind.ExtendsKeyword) continue;
      for (const typeNode of clause.types) {
        const baseName = typeNode.expression.getText().split("<")[0].trim();
        if (modelBases.has(baseName)) return true;
        const baseType = checker.getTypeAtLocation(typeNode);
        const baseSymbol = baseType.getSymbol();
        if (baseSymbol?.getDeclarations()) {
          for (const decl of baseSymbol.getDeclarations()!) {
            if (tsModule.isClassDeclaration(decl)) {
              current = decl;
              foundBase = true;
              break;
            }
          }
        }
        if (foundBase) break;
      }
      if (foundBase) break;
    }
    if (!foundBase) break;
  }
  return false;
}

/**
 * Check if a class implements the Accessors marker interface.
 * @param tsModule - the TypeScript module
 * @param classDecl - the class declaration to check
 * @param checker - the type checker
 * @returns true if the class implements Accessors
 */
function hasAccessorsMarkerForDiag(
  tsModule: typeof ts,
  classDecl: ts.ClassDeclaration,
  checker: ts.TypeChecker
): boolean {
  const heritageClauses = classDecl.heritageClauses;
  if (!heritageClauses) return false;

  for (const clause of heritageClauses) {
    if (clause.token !== tsModule.SyntaxKind.ImplementsKeyword) continue;
    for (const typeNode of clause.types) {
      const exprText = typeNode.expression.getText();
      if (exprText === "Accessors") return true;
      const type = checker.getTypeAtLocation(typeNode);
      const symbol = type.getSymbol() ?? type.aliasSymbol;
      if (symbol && symbol.getName() === "Accessors") return true;
    }
  }
  return false;
}
