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

/**
 * A diagnostic produced by a generator, reported against the authored source.
 *
 * The content mapper protocol carries these in `TransformResult.diagnostics`,
 * so a generator can report a problem in the original file rather than only
 * rewriting it. Positions are offsets into the authored text.
 */
export interface GeneratedDiagnostic {
  /** Offset into the authored file. */
  start: number;
  /** Length in characters. */
  length: number;
  /** Diagnostic code, e.g. 9001 for an unknown WebdaQL attribute. */
  code: number;
  /** Human-readable message. */
  messageText: string;
}

/** All edits for one file, plus anything the generator wants to report. */
export interface FileEdits {
  fileName: string;
  edits: Edit[];
  /** Problems found while analysing this file. */
  diagnostics?: GeneratedDiagnostic[];
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

    // Generators are independent, so several can reach the same conclusion —
    // every one that needs WEBDA_STORAGE injects the same import at offset 0.
    // Emitting it twice is TS2300.
    const seen = new Set<string>();
    const deduped = edits.filter(edit => {
      const key = `${edit.start}:${edit.end}:${edit.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    edits.length = 0;
    edits.push(...deduped);
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
  // Forward, matching `buildMappedText` exactly. An earlier version spliced
  // back-to-front, which reverses insertions sharing an offset — so the build
  // and the editor emitted the same members in a different order. Both paths
  // must walk edits identically or they drift silently.
  const ordered = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  let out = "";
  let cursor = 0;
  for (const edit of ordered) {
    if (edit.start < cursor) continue;
    out += text.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }
  return out + text.slice(cursor);
}
