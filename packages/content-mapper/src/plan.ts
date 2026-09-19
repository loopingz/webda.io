/**
 * The plan model shared by both passes.
 *
 * Pass 1 runs every {@link Generator} against a real `Program` + `Checker` and
 * collects {@link Edit}s. Pass 2 applies those edits through a virtual
 * filesystem, so nothing is ever written to disk.
 *
 * Edits are offset-based text splices rather than AST nodes, which lets
 * independent generators compose without knowing about each other, and keeps
 * every byte of untouched source byte-identical.
 */
import type { Checker, Program, Project } from "typescript/unstable/sync";
import type { SourceFile } from "typescript/unstable/ast";

/** A single text splice within one file. */
export interface Edit {
  /** Start offset, inclusive. */
  start: number;
  /** End offset, exclusive. `start === end` means pure insertion. */
  end: number;
  /** Replacement text. */
  text: string;
  /** Generator that produced this edit, for diagnostics and conflict reports. */
  source: string;
}

/** All edits for one file. */
export interface FileEdits {
  fileName: string;
  edits: Edit[];
}

/** What a generator receives. */
export interface AnalysisContext {
  project: Project;
  program: Program;
  checker: Checker;
  /** Source files belonging to the project root, in deterministic order. */
  sourceFiles: SourceFile[];
  /** Read a node's source text, skipping leading trivia. */
  textOf(sf: SourceFile, node: any): string;
  /** Read a node's leading trivia, used for JSDoc tag detection. */
  triviaOf(sf: SourceFile, node: any): string;
  /** Resolve the declared base class name chain for a class declaration. */
  baseNames(sf: SourceFile, cls: any): string[];
}

/**
 * A unit of code generation.
 *
 * Generators are intentionally independent: each returns edits, and the planner
 * merges them. That mirrors how the existing pipeline is structured
 * (`morpher.ts` composes `unserializer`, `loadParameters`, `accessors`,
 * `capabilities`), so the same features can be ported one at a time.
 */
export interface Generator {
  /** Stable identifier, used in edit provenance. */
  name: string;
  /**
   * Produce edits for the project.
   * @param ctx - typed analysis context
   * @returns edits grouped by file
   */
  analyze(ctx: AnalysisContext): FileEdits[];
}

/**
 * Merge per-generator edits into one map, detecting overlaps.
 * @param all - edits from every generator
 * @returns edits per file, sorted, plus any conflicts found
 */
export function mergePlan(all: FileEdits[]): {
  plan: Map<string, Edit[]>;
  conflicts: { fileName: string; a: Edit; b: Edit }[];
} {
  const plan = new Map<string, Edit[]>();
  for (const fe of all) {
    const list = plan.get(fe.fileName) ?? [];
    list.push(...fe.edits);
    plan.set(fe.fileName, list);
  }

  const conflicts: { fileName: string; a: Edit; b: Edit }[] = [];
  for (const [fileName, edits] of plan) {
    edits.sort((x, y) => x.start - y.start || x.end - y.end);
    for (let i = 1; i < edits.length; i++) {
      const prev = edits[i - 1];
      const cur = edits[i];
      // Pure insertions at the same point are fine; real overlaps are not.
      if (cur.start < prev.end) conflicts.push({ fileName, a: prev, b: cur });
    }
  }
  return { plan, conflicts };
}

/**
 * Apply edits to a source text.
 * @param text - original file text
 * @param edits - edits for that file
 * @returns the rewritten text
 */
export function applyEdits(text: string, edits: Edit[]): string {
  // Back-to-front so earlier offsets stay valid.
  const ordered = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let out = text;
  for (const e of ordered) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return out;
}
