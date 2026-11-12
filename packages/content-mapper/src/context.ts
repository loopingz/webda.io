/**
 * Builds the typed {@link AnalysisContext} for pass 1.
 *
 * This is the part the scanner-based prototype could not do. Detecting the
 * dominant coercion kinds in this codebase — `ManyToOne` -> `ModelLink` with a
 * `@WebdaAutoSetter` `set`, and `OneToMany` -> `ModelRelated` — requires
 * following type aliases through the checker. Roughly 100 such declarations
 * exist in `the packages source tree` versus ~4 plain `Date` fields, so a syntactic pass
 * covers the rare case and misses the common one.
 */
import { API, type Checker, type Project } from "typescript/sync";
import { serverFS } from "typescript/fs";
import { SyntaxKind, type Node, type SourceFile } from "typescript/ast";
import * as is from "typescript/ast/is";
import type { AnalysisContext } from "./plan.ts";

/**
 * Read a node's source text, skipping leading trivia.
 * @param sf - containing source file
 * @param node - the node
 * @returns exact source text
 */
export function textOf(sf: SourceFile, node: Node): string {
  const start = typeof (node as any).getStart === "function" ? (node as any).getStart() : node.pos;
  return sf.text.slice(start, node.end);
}

/**
 * Read a node's leading trivia (comments), used to find JSDoc tags. The TS7 AST
 * package exposes no `getJSDocTags` helper, so tags are matched on trivia text.
 * @param sf - containing source file
 * @param node - the node
 * @returns raw trivia text
 */
export function triviaOf(sf: SourceFile, node: Node): string {
  const start = typeof (node as any).getStart === "function" ? (node as any).getStart() : node.pos;
  return sf.text.slice(node.pos, start);
}

/**
 * Names appearing in a class's `extends` clause.
 * @param sf - containing source file
 * @param cls - class declaration
 * @returns base class names, usually one
 */
export function baseNames(sf: SourceFile, cls: any): string[] {
  const out: string[] = [];
  for (const clause of cls.heritageClauses ?? []) {
    if (clause.token !== SyntaxKind.ExtendsKeyword) continue;
    for (const t of clause.types) {
      const expr = (t as any).expression ?? t;
      out.push(expr?.text ?? textOf(sf, expr));
    }
  }
  return out;
}

/**
 * Checker queries answered from a cache by {@link memoizeChecker}
 *
 * Each one is a round trip to the compiler process, and the schema converter
 * asks the same question about a type every time it meets it again.
 */
const MEMOIZED_QUERIES = [
  "typeToString",
  "getJsDocTagsOfSymbol",
  "getTypeOfSymbolAtLocation",
  "getSymbolAtLocation",
  "getTypeAtLocation",
  "getTypeArguments",
  "getPropertyOfType",
  "isArrayLikeType"
] as const;

/**
 * Wrap a checker so repeated queries are answered without a round trip to the compiler process.
 *
 * A checker belongs to one snapshot, where types, symbols and nodes are interned
 * and never change, so an answer is valid as long as the checker is. Answers
 * are shared between callers: treat the arrays as read-only.
 * @param checker - the checker of a snapshot
 * @returns a checker answering the same, backed by `checker`
 */
export function memoizeChecker(checker: Checker): Checker {
  const memoized = Object.create(checker);
  for (const name of MEMOIZED_QUERIES) {
    const query = (checker as any)[name] as (...args: unknown[]) => unknown;
    // One level of Map per argument, the answer under the last one
    const answers = new Map<unknown, any>();
    Object.defineProperty(memoized, name, {
      /**
       * Answer from the cache, asking the checker the first time
       * @param args - the query arguments
       * @returns the checker's answer
       */
      value: function memoizedQuery(...args: unknown[]) {
        let level = answers;
        for (let i = 0; i < args.length - 1; i++) {
          let next = level.get(args[i]);
          if (!next) level.set(args[i], (next = new Map()));
          level = next;
        }
        const last = args[args.length - 1];
        if (!level.has(last)) level.set(last, query.apply(checker, args));
        return level.get(last);
      }
    });
  }
  return memoized;
}

/** A live analysis session; dispose to shut down the server process. */
export interface Session {
  /**
   * Execution context
   */
  ctx: AnalysisContext;
  /**
   * Perform dispose
   */
  dispose(): void;
}

/**
 * Open a project and build an analysis context over it.
 * @param configFile - absolute tsconfig path
 * @param rootDir - source root; only files beneath it are analysed
 * @param fs - optional virtual filesystem callbacks (used by pass 2)
 * @returns the session
 */
export function openSession(configFile: string, rootDir: string, fs?: any): Session {
  const resolvedFs = fs
    ? {
        directoryExists: serverFS.useOS,
        fileExists: serverFS.useOS,
        getAccessibleEntries: serverFS.useOS,
        readFile: serverFS.useOS,
        realpath: serverFS.useOS,
        stat: serverFS.useOS,
        writeFile: serverFS.useOS,
        removeFile: serverFS.useOS,
        ...fs,
        ...(typeof fs.readFile === "function"
          ? { readFile: (fileName: string) => fs.readFile(fileName) ?? serverFS.useOS }
          : {})
      }
    : undefined;
  const api = new API({ cwd: rootDir, ...(resolvedFs ? { fs: resolvedFs } : {}) });
  const snapshot = api.createSnapshot({ openProjects: [configFile] });
  const project: Project = snapshot.getProjects()[0];
  /* v8 ignore start */
  if (!project) {
    api.close();
    throw new Error(`No project loaded for ${configFile}`);
  }
  /* v8 ignore stop */

  const program = project.program;
  const checker: Checker = memoizeChecker(project.checker);

  const sourceFiles: SourceFile[] = [];
  // TypeScript file names always use "/", even on Windows
  const root = rootDir.replace(/\\/g, "/");
  for (const fileName of program.getSourceFileNames()) {
    if (!fileName.startsWith(root)) continue;
    if (fileName.endsWith(".d.ts")) continue;
    const sf = program.getSourceFile(fileName);
    if (sf) sourceFiles.push(sf);
  }
  sourceFiles.sort((a, b) => (a.fileName < b.fileName ? -1 : 1));

  return {
    ctx: { project, program, checker, sourceFiles, textOf, triviaOf, baseNames },
    dispose: () => api.close()
  };
}

/**
 * Iterate class declarations in a source file.
 * @param sf - the source file
 * @returns class declarations
 */
export function classesOf(sf: SourceFile): any[] {
  return sf.statements.filter(s => is.isClassDeclaration(s) && (s as any).name);
}

/**
 * Member name as written, or undefined for computed names.
 * @param member - a class element
 * @returns the member name
 */
export function memberName(member: any): string | undefined {
  return member?.name?.text;
}

/**
 * Whether a class element carries the `static` modifier.
 * @param member - a class element
 * @returns true when static
 */
export function isStatic(member: any): boolean {
  return !!member.modifiers?.some((m: any) => m.kind === SyntaxKind.StaticKeyword);
}
