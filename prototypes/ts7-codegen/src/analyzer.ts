/**
 * Analysis pass, built on the TypeScript 7 `typescript/unstable/*` API.
 *
 * This replaces `computeCoercibleFields` from
 * `packages/ts-plugin/src/transforms/accessors.ts`. The observable output is the
 * same set of (class, property, setterType) triples — but it is produced through
 * the supported TS7 API surface (`API`, `Project`, `Checker`, `unstable/ast`)
 * rather than `ts.createProgram` + `TypeChecker`, neither of which exist in TS7.
 *
 * The important structural difference: this pass only *reads*. It produces a
 * plan; it never participates in emit. That is what makes the whole pipeline
 * compiler-agnostic.
 */
import { API, SignatureKind, type Checker, type Project } from "typescript/unstable/sync";
import { SyntaxKind, type ClassDeclaration, type Node, type SourceFile } from "typescript/unstable/ast";
import * as is from "typescript/unstable/ast/is";
import {
  DEFAULT_COERCIONS,
  type ClassPlan,
  type CodegenOptions,
  type CoercionRegistry,
  type FilePlan,
  type ResolvedCoercion
} from "./types.ts";

/** Resolved, defaulted options. */
interface Resolved {
  modelBases: Set<string>;
  accessorsForAll: boolean;
  storageModule: string;
  coercions: CoercionRegistry;
}

/**
 * Normalise user-supplied options.
 * @param options - partial options
 * @returns fully resolved options
 */
function resolveOptions(options: CodegenOptions = {}): Resolved {
  return {
    modelBases: options.modelBases ?? new Set(["Model", "UuidModel"]),
    accessorsForAll: options.accessorsForAll ?? false,
    storageModule: options.storageModule ?? "@webda/models",
    coercions: options.coercions ?? DEFAULT_COERCIONS
  };
}

/**
 * Read the source text of a node, skipping leading trivia.
 * @param sf - the containing source file
 * @param node - the node to read
 * @returns the exact source text
 */
function textOf(sf: SourceFile, node: Node): string {
  const start = typeof (node as any).getStart === "function" ? (node as any).getStart() : node.pos;
  return sf.text.slice(start, node.end);
}

/**
 * Read the leading trivia (comments) attached to a node.
 * Used to detect JSDoc tags without a `getJSDocTags` helper, which the TS7 AST
 * package does not currently expose.
 * @param sf - the containing source file
 * @param node - the node whose trivia to read
 * @returns the raw trivia text
 */
function leadingTrivia(sf: SourceFile, node: Node): string {
  const start = typeof (node as any).getStart === "function" ? (node as any).getStart() : node.pos;
  return sf.text.slice(node.pos, start);
}

/**
 * Determine whether a class is a Webda model, i.e. it extends one of the known
 * model base classes, or carries the `Accessors` marker interface.
 *
 * Mirrors `isModelClass` + `hasAccessorsMarker` in the current transform.
 * @param sf - containing source file
 * @param cls - the class declaration
 * @param opts - resolved options
 * @returns whether the class qualifies, and whether it is a true model
 */
function classifyClass(sf: SourceFile, cls: ClassDeclaration, opts: Resolved): { eligible: boolean; isModel: boolean } {
  let isModel = false;
  let hasMarker = false;

  for (const clause of cls.heritageClauses ?? []) {
    for (const t of clause.types) {
      const name = (t as any).expression?.text ?? textOf(sf, ((t as any).expression ?? t) as Node);
      if (clause.token === SyntaxKind.ExtendsKeyword && opts.modelBases.has(name)) {
        isModel = true;
      }
      if (clause.token === SyntaxKind.ImplementsKeyword && name === "Accessors") {
        hasMarker = true;
      }
    }
  }

  return { eligible: opts.accessorsForAll || isModel || hasMarker, isModel };
}

/**
 * Detect a `set` method tagged with `@WebdaAutoSetter` on the property's type,
 * and return its parameter type rendered as a string.
 *
 * Mirrors `detectSetMethodType` in the current transform.
 * @param checker - the TS7 checker
 * @param project - owning project, used to resolve node handles
 * @param typeNode - the property's declared type node
 * @returns the setter parameter type string, or undefined
 */
function detectSetMethodType(checker: Checker, project: Project, typeNode: Node): string | undefined {
  const type = checker.getTypeFromTypeNode(typeNode as any);
  if (!type) return undefined;

  const setSymbol = checker.getPropertyOfType(type, "set");
  if (!setSymbol) return undefined;

  // Require the @WebdaAutoSetter JSDoc tag on the declaration.
  const decl = setSymbol.valueDeclaration ?? setSymbol.declarations?.[0];
  const node = decl?.resolve(project);
  if (!node) return undefined;
  const owner = node.getSourceFile?.() ?? (node as any)._sourceFile;
  if (!owner) return undefined;
  if (!/@WebdaAutoSetter\b/.test(leadingTrivia(owner, node))) return undefined;

  const setType = checker.getTypeOfSymbol(setSymbol);
  if (!setType) return undefined;
  const signatures = checker.getSignaturesOfType(setType, SignatureKind.Call);
  if (!signatures.length) return undefined;

  const paramType = checker.getParameterType(signatures[0], 0);
  return paramType ? checker.typeToString(paramType) : undefined;
}

/**
 * Build the rewrite plan for a single source file.
 * @param sf - source file to analyse
 * @param checker - the TS7 checker
 * @param project - owning project
 * @param opts - resolved options
 * @returns a plan, or undefined when the file needs no changes
 */
function planFile(sf: SourceFile, checker: Checker, project: Project, opts: Resolved): FilePlan | undefined {
  const classes: ClassPlan[] = [];

  for (const stmt of sf.statements) {
    if (!is.isClassDeclaration(stmt) || !stmt.name) continue;

    const { eligible, isModel } = classifyClass(sf, stmt, opts);
    if (!eligible) continue;

    // Names that already have an explicit accessor must be left alone.
    const existingAccessors = new Set<string>();
    let hasToJSON = false;
    for (const m of stmt.members) {
      const n = (m as any).name?.text;
      if (!n) continue;
      if (is.isGetAccessorDeclaration(m) || is.isSetAccessorDeclaration(m)) existingAccessors.add(n);
      if (n === "toJSON") hasToJSON = true;
    }

    const fields: ResolvedCoercion[] = [];
    for (const m of stmt.members) {
      if (!is.isPropertyDeclaration(m)) continue;
      if (m.modifiers?.some(mod => mod.kind === SyntaxKind.StaticKeyword)) continue;
      if (!m.type || !is.isTypeReferenceNode(m.type)) continue;

      const name = (m.name as any)?.text;
      if (!name || existingAccessors.has(name)) continue;

      const typeName = textOf(sf, (m.type as any).typeName);
      const start = (m as any).getStart();

      // 1. Static coercion registry (Date, ...) — matched on the source-level name.
      const rule = opts.coercions[typeName];
      if (rule) {
        fields.push({
          name,
          typeName,
          setterType: rule.setterType,
          coercionKind: "builtin",
          start,
          end: m.end,
          originalText: sf.text.slice(start, m.end)
        });
        continue;
      }

      // 2. Types exposing a `@WebdaAutoSetter`-tagged `set` method.
      const setParam = detectSetMethodType(checker, project, m.type);
      if (setParam) {
        fields.push({
          name,
          typeName,
          setterType: `${setParam} | ${typeName}`,
          coercionKind: "set-method",
          start,
          end: m.end,
          originalText: sf.text.slice(start, m.end)
        });
      }
    }

    if (fields.length) {
      classes.push({
        className: stmt.name.text,
        isModel,
        hasToJSON,
        // Insert generated members immediately before the class's closing brace.
        membersEnd: stmt.members.length ? stmt.members[stmt.members.length - 1].end : stmt.end - 1,
        fields
      });
    }
  }

  if (!classes.length) return undefined;

  // Generated imports go after the last existing import, so that any
  // side-effect import ordering the author relied on is preserved.
  let importInsertPos = 0;
  let hasStorageImport = false;
  let storageNamedInsertPos: number | undefined;
  for (const stmt of sf.statements) {
    if (!is.isImportDeclaration(stmt)) continue;
    importInsertPos = stmt.end;
    if (/\bWEBDA_STORAGE\b/.test(textOf(sf, stmt))) hasStorageImport = true;

    // If the storage module is already imported with a named clause, remember
    // where to merge so we do not emit a second import of the same specifier.
    const spec = (stmt as any).moduleSpecifier?.text;
    const named = (stmt as any).importClause?.namedBindings;
    if (spec === opts.storageModule && named && is.isNamedImports(named)) {
      storageNamedInsertPos = (named as any).getStart() + 1;
    }
  }

  return { fileName: sf.fileName, classes, importInsertPos, hasStorageImport, storageNamedInsertPos };
}

/**
 * Analyse a whole tsconfig project and produce per-file rewrite plans.
 * @param configFile - absolute path to the project's tsconfig.json
 * @param rootDir - only files under this directory are analysed
 * @param options - codegen options
 * @returns the plans plus the source text each plan was computed against
 */
export function analyze(
  configFile: string,
  rootDir: string,
  options: CodegenOptions = {}
): { plans: FilePlan[]; sources: Map<string, string> } {
  const opts = resolveOptions(options);
  const api = new API({ cwd: rootDir });
  try {
    const snapshot = api.createSnapshot({ openProjects: [configFile] });
    const project = snapshot.getProjects()[0];
    if (!project) throw new Error(`No project loaded for ${configFile}`);

    const plans: FilePlan[] = [];
    const sources = new Map<string, string>();

    for (const fileName of project.program.getSourceFileNames()) {
      if (!fileName.startsWith(rootDir)) continue;
      if (fileName.endsWith(".d.ts")) continue;
      const sf = project.program.getSourceFile(fileName);
      if (!sf) continue;

      sources.set(fileName, sf.text);
      const plan = planFile(sf, project.checker, project, opts);
      if (plan) plans.push(plan);
    }

    return { plans, sources };
  } finally {
    api.close();
  }
}
