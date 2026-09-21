/**
 * Two-pass build.
 *
 * Injecting generated code through the virtual filesystem is chicken-and-egg:
 * `fs.readFile` has to return rewritten text, but deciding what to rewrite
 * needs a `Program` + `Checker` — which is the very thing being constructed.
 * The scanner-based shortcut avoided this by being purely syntactic, but that
 * cannot resolve `ManyToOne` -> `ModelLink` or `OneToMany` -> `ModelRelated`,
 * which is the dominant case in this codebase.
 *
 * So:
 *
 *   pass 1  Program over the ORIGINAL sources  ->  run generators  ->  plan
 *   pass 2  Program with fs.readFile injecting the plan  ->  check / emit
 *
 * Nothing is written to disk, and real file paths are preserved, so `nodenext`
 * module-format resolution behaves normally.
 */
import { openSession } from "./context.ts";
import { accessorsGenerator, type AccessorOptions } from "./generators/accessors.ts";
import { behaviorsGenerator } from "./generators/behaviors.ts";
import { qlValidatorGenerator } from "./generators/qlvalidator.ts";
import { loadParametersGenerator } from "./generators/loadparameters.ts";
import { applyEdits, mergePlan, type Edit, type Generator } from "./plan.ts";

export interface TwoPassOptions extends AccessorOptions {
  /** Absolute tsconfig path. */
  configFile: string;
  /** Source root. */
  rootDir: string;
  /** Override the generator set. */
  generators?: Generator[];
  /** Emit rather than only type-check. */
  emit?: boolean;
  /** Module specifier providing the WebdaQL `escape` helper. */
  qlModule?: string;
}

export interface TwoPassResult {
  /** Rewritten text per file, for inspection. */
  injected: Map<string, string>;
  /** Diagnostics from pass 2, i.e. against the generated code. */
  diagnostics: any[];
  /** Emitted output captured from the virtual filesystem. */
  emitted: Map<string, string>;
  /** Overlapping edits between generators, if any. */
  conflicts: { fileName: string; a: Edit; b: Edit }[];
  timing: { pass1Ms: number; pass2Ms: number; totalMs: number };
  /** Which generator produced how many edits. */
  editCounts: Record<string, number>;
}

/**
 * Run both passes.
 * @param options - run options
 * @returns the result of pass 2, plus the plan that produced it
 */
export function runTwoPass(options: TwoPassOptions): TwoPassResult {
  const generators = options.generators ?? [
    accessorsGenerator({ accessorsForAll: options.accessorsForAll, storageModule: options.storageModule }),
    behaviorsGenerator({ storageModule: options.storageModule }),
    qlValidatorGenerator({ qlModule: options.qlModule }),
    loadParametersGenerator()
  ];

  // ---- Pass 1: typed analysis over the original sources ----
  const t0 = process.hrtime.bigint();
  const session = openSession(options.configFile, options.rootDir);
  const originals = new Map<string, string>();
  const all = [];
  const editCounts: Record<string, number> = {};
  try {
    for (const sf of session.ctx.sourceFiles) originals.set(sf.fileName, sf.text);
    for (const g of generators) {
      const produced = g.analyze(session.ctx);
      editCounts[g.name] = produced.reduce((s, f) => s + f.edits.length, 0);
      all.push(...produced);
    }
  } finally {
    session.dispose();
  }
  const { plan, conflicts } = mergePlan(all);
  const pass1Ms = Number(process.hrtime.bigint() - t0) / 1e6;

  // Materialise the injected text once, so pass 2's readFile is a lookup.
  const injected = new Map<string, string>();
  for (const [fileName, edits] of plan) {
    const original = originals.get(fileName);
    if (original === undefined) continue;
    injected.set(fileName, applyEdits(original, edits));
  }

  // ---- Pass 2: compile against the injected text ----
  const t1 = process.hrtime.bigint();
  const emitted = new Map<string, string>();
  const session2 = openSession(options.configFile, options.rootDir, {
    readFile: (f: string) => injected.get(f),
    writeFile: (p: string, c: string) => void emitted.set(p, c)
  });
  let diagnostics: any[] = [];
  try {
    diagnostics = [...session2.ctx.program.getSemanticDiagnostics()];
    if (options.emit && !diagnostics.length) session2.ctx.program.emit();
  } finally {
    session2.dispose();
  }
  const pass2Ms = Number(process.hrtime.bigint() - t1) / 1e6;

  return {
    injected,
    diagnostics,
    emitted,
    conflicts,
    editCounts,
    timing: { pass1Ms, pass2Ms, totalMs: pass1Ms + pass2Ms }
  };
}

export { accessorsGenerator, loadParametersGenerator };
export * from "./plan.ts";
