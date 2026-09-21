/**
 * A warm analysis session for the content mapper.
 *
 * This is the part `transform` cannot do on its own. The protocol hands the
 * mapper one file's text and nothing else — no `Program`, no `Checker` — but
 * Webda's dominant coercions (`ManyToOne<T>` -> `ModelLink`, `OneToMany<T>` ->
 * `ModelRelated`, `@WebdaAutoSetter` set-methods) all need type resolution. So
 * the mapper runs *its own* TypeScript program over the original sources and
 * keeps it warm across requests: pass 1 of the two-pass design, resident.
 *
 * Two details make it work:
 *
 * - **The live buffer is served through `fs.readFile`.** The editor's unsaved
 *   text is put in an overlay, so the resident program analyses exactly what the
 *   user sees rather than what is on disk.
 * - **`.model.ts` degrades to plain TypeScript.** The mapper opens the project's
 *   own tsconfig without `runExternalCode`, so content mappers are inert there
 *   and no recursion is possible; the files are simply read as authored.
 */
import { API, type Checker, type Program, type Project } from "typescript/unstable/sync";
import { createFileSystemLayer } from "typescript/unstable/fs";
import type { SourceFile } from "typescript/unstable/ast";
import { baseNames, textOf, triviaOf } from "./context.ts";
import { accessorsGenerator } from "./generators/accessors.ts";
import { behaviorsGenerator } from "./generators/behaviors.ts";
import { qlValidatorGenerator } from "./generators/qlvalidator.ts";
import { loadParametersGenerator } from "./generators/loadparameters.ts";
import { mergePlan, type Edit, type GeneratedDiagnostic, type Generator } from "./plan.ts";
import { buildMappedText, type MappedText } from "./spans.ts";

/** How to open the resident program. */
export interface WarmSessionOptions {
  /** Absolute tsconfig path, as supplied by `openProject`. */
  configFile: string;
  /** Working directory for the resident API. */
  cwd: string;
  /** Module specifier providing `WEBDA_STORAGE`. */
  storageModule?: string;
  /** Treat every class as eligible, not just models. */
  accessorsForAll?: boolean;
  /** Module specifier providing the WebdaQL `escape` helper. */
  qlModule?: string;
  /** Override the generator set (tests). */
  generators?: Generator[];
}

/** Per-request cost breakdown, in milliseconds. */
export interface TransformTiming {
  /** Refreshing the resident snapshot after a buffer change. */
  snapshotMs: number;
  /** Running the generators, i.e. the checker queries. */
  analyzeMs: number;
  /** Splicing edits and building the span map. */
  spliceMs: number;
  totalMs: number;
  /** False when the buffer was unchanged and the snapshot was reused. */
  changed: boolean;
}

/** A transform result plus what it cost. */
export interface TransformOutcome extends MappedText {
  timing: TransformTiming;
  editCount: number;
  /** Generator diagnostics, for `TransformResult.diagnostics`. */
  diagnostics: GeneratedDiagnostic[];
}

const ms = (from: bigint) => Number(process.hrtime.bigint() - from) / 1e6;

/**
 * A resident `Program` + `Checker` that answers `transform` requests.
 */
export class WarmSession {
  private readonly api: API;
  private readonly options: WarmSessionOptions;
  private readonly generators: Generator[];
  /** Live buffer text per file, served to the resident program. */
  private readonly overlay = new Map<string, string>();
  private snapshot: any;
  /** Cost of the initial program construction. */
  readonly startupMs: number;

  /**
   * Open the resident program for a project.
   * @param options - how to open it
   */
  constructor(options: WarmSessionOptions) {
    this.options = options;
    this.generators = options.generators ?? [
      accessorsGenerator({ accessorsForAll: options.accessorsForAll, storageModule: options.storageModule }),
      behaviorsGenerator({ storageModule: options.storageModule }),
      qlValidatorGenerator({ qlModule: options.qlModule }),
      loadParametersGenerator()
    ];

    const t0 = process.hrtime.bigint();
    this.api = new API({ cwd: options.cwd });
    this.snapshot = this.api.createSnapshot({ openProjects: [options.configFile] });
    if (!this.snapshot.getProjects()[0]) {
      this.api.close();
      throw new Error(`No project loaded for ${options.configFile}`);
    }
    this.startupMs = ms(t0);
  }

  /**
   * Files in the resident program, for benchmarking.
   * @returns the source file count
   */
  get fileCount(): number {
    return this.project().program.getSourceFileNames().length;
  }

  /**
   * The single project held by the current snapshot.
   * @returns the project
   */
  private project(): Project {
    return this.snapshot.getProjects()[0];
  }

  /**
   * Build an analysis context restricted to a single file.
   *
   * Restricting `sourceFiles` is what makes re-analysis incremental: the
   * generators only walk the file that changed, while the checker still resolves
   * types across the whole program.
   * @param fileName - the file to analyse
   * @returns a context the generators accept
   */
  private contextFor(fileName: string) {
    const project = this.project();
    const program: Program = project.program;
    const checker: Checker = project.checker;
    const sf = program.getSourceFile(fileName);
    const sourceFiles: SourceFile[] = sf ? [sf] : [];
    return { project, program, checker, sourceFiles, textOf, triviaOf, baseNames };
  }

  /**
   * Transform one file, refreshing the resident program only if its text moved.
   * @param fileName - absolute path of the file being transformed
   * @param content - the editor's current buffer text
   * @returns generated text, span map and timings
   */
  transform(fileName: string, content: string): TransformOutcome {
    const t0 = process.hrtime.bigint();

    const changed = this.overlay.get(fileName) !== content;
    if (changed) {
      this.overlay.set(fileName, content);
      const previous = this.snapshot;
      // Two things are load-bearing here, and both were found the hard way:
      //
      // - a filesystem *layer* is consulted ahead of the host filesystem, which
      //   is how unsaved buffer text reaches the resident program. The
      //   spawn-time `APIOptions.fs` callback is not enough, because source
      //   files are cached and a later edit to the same path is never re-read.
      // - `ensurePrograms` is required. Programs update lazily, so without it
      //   the new snapshot still hands back the previous program and every
      //   transform silently analyses stale text.
      this.snapshot = this.snapshot.update({
        fileSystem: createFileSystemLayer([...this.overlay]),
        ensurePrograms: true
      });
      previous.dispose();
    }
    const snapshotMs = ms(t0);

    const t1 = process.hrtime.bigint();
    const ctx = this.contextFor(fileName);
    const produced = ctx.sourceFiles.length ? this.generators.flatMap(g => g.analyze(ctx as any)) : [];
    const { plan } = mergePlan(produced);
    const edits: Edit[] = plan.get(fileName) ?? [];
    const diagnostics = produced.filter(f => f.fileName === fileName).flatMap(f => f.diagnostics ?? []);
    const analyzeMs = ms(t1);

    const t2 = process.hrtime.bigint();
    const mapped = buildMappedText(content, edits);
    const spliceMs = ms(t2);

    return {
      ...mapped,
      diagnostics,
      editCount: edits.length,
      timing: { snapshotMs, analyzeMs, spliceMs, totalMs: ms(t0), changed }
    };
  }

  /** Shut down the resident server process. */
  dispose(): void {
    try {
      this.snapshot?.dispose();
    } finally {
      this.api.close();
    }
  }
}
