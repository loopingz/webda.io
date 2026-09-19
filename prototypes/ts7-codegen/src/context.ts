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
import { API, type Checker, type Project } from "typescript/unstable/sync";
import type { Node, SourceFile } from "typescript/unstable/ast";
import * as is from "typescript/unstable/ast/is";
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
    // 95 === SyntaxKind.ExtendsKeyword
    if (clause.token !== 95) continue;
    for (const t of clause.types) {
      const expr = (t as any).expression ?? t;
      out.push(expr?.text ?? textOf(sf, expr));
    }
  }
  return out;
}

/** A live analysis session; dispose to shut down the server process. */
export interface Session {
  ctx: AnalysisContext;
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
  const api = new API({ cwd: rootDir, ...(fs ? { fs } : {}) });
  const snapshot = api.createSnapshot({ openProjects: [configFile] });
  const project: Project = snapshot.getProjects()[0];
  if (!project) {
    api.close();
    throw new Error(`No project loaded for ${configFile}`);
  }

  const program = project.program;
  const checker: Checker = project.checker;

  const sourceFiles: SourceFile[] = [];
  for (const fileName of program.getSourceFileNames()) {
    if (!fileName.startsWith(rootDir)) continue;
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
  // 125 === SyntaxKind.StaticKeyword
  return !!member.modifiers?.some((m: any) => m.kind === 125);
}
