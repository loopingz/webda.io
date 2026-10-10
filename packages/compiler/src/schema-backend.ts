/**
 * The TypeScript 7.1 build, driven out of process.
 *
 * `webdac build` used to emit with `tsProgram.emit` and four
 * `@webda/ts-plugin` transformers, then walk the TypeScript 6 program to
 * generate `webda.module.json`. TypeScript 7 removed emit transformers, so
 * both halves now run in `@webda/content-mapper` on the 7.1 checker:
 *
 * - **emit** — the two-pass build: generate accessors, behaviours and
 *   WebdaQL rewrites into the source, type-check that, and write what was
 *   checked. Nothing is written when pass 2 reports a diagnostic.
 * - **module** — every section of `webda.module.json`, byte for byte as the
 *   TypeScript 6 generator produced it.
 *
 * It is spawned rather than imported: the content mapper peers on
 * `typescript@>=7.1.0-dev`, and a process boundary is what lets it run
 * whatever TypeScript this package resolves. One spawn per build, because
 * opening the program dominates.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { useLog } from "@webda/workout";

/** A Webda class declared in a file the content mapper cannot claim. */
export interface NamingViolation {
  /** Absolute path of the offending source file. */
  fileName: string;
  /** Class that triggered the requirement. */
  className: string;
  /** Section it was classified into. */
  section: string;
  /** Suffix the file is required to carry. */
  expectedSuffix: string;
}

/** What the generator answers for `webda.module.json`. */
export interface GeneratedModule {
  /** Every section of the module. */
  module: Record<string, unknown>;
  /** Classes in files the mapper cannot claim. */
  namingViolations: NamingViolation[];
  /** Conditions the TypeScript 6 generator threw on. */
  errors: string[];
}

/** What the emit reports. */
export interface EmitReport {
  /** Pass-2 diagnostics, formatted as `tsc` prints them. */
  diagnostics: string;
  /** Number of diagnostics; nothing was written unless it is zero. */
  diagnosticCount: number;
  /** Files written. */
  written: number;
  /** Edits per generator. */
  editCounts: Record<string, number>;
}

/** One build's answer. */
export interface BuildResult {
  emit: EmitReport;
  /** Absent when `emit` failed, since the module is not generated then. */
  module?: GeneratedModule;
}

/** Options the build passes through to the generator. */
export interface BuildOptions {
  /** Namespace prefix for unqualified names. */
  namespace?: string;
  /** `webda.capabilities` from the application's package.json. */
  capabilities?: unknown;
  /** Skip module generation; emit only. */
  emitOnly?: boolean;
}

/**
 * Locate the content mapper's worker.
 *
 * `WEBDA_SCHEMA_WORKER` overrides it, for running a generator that is not the
 * installed one — bisecting a change, or building from source. Otherwise the
 * application is searched first, so it can pin a version, then this package.
 * @param projectRoot - application root
 * @returns absolute path of the worker entry point
 * @throws when the package is not installed
 */
function resolveWorker(projectRoot: string): string {
  const override = process.env.WEBDA_SCHEMA_WORKER;
  if (override) {
    if (!existsSync(override)) throw new Error(`WEBDA_SCHEMA_WORKER does not exist: ${override}`);
    return override;
  }
  for (const base of [projectRoot, dirname(fileURLToPath(import.meta.url))]) {
    try {
      const worker = createRequire(join(base, "index.js")).resolve("@webda/content-mapper/schema-worker-cli");
      if (existsSync(worker)) return worker;
    } catch {
      // Not resolvable from here; try the next base.
    }
  }
  throw new Error(
    "Building requires @webda/content-mapper to be installed and built (lib/schema/worker-cli.js). " +
      "Install it alongside @webda/compiler, or point WEBDA_SCHEMA_WORKER at the worker."
  );
}

/**
 * Emit a project and generate its module, in one worker round trip.
 * @param projectRoot - application root, used as cwd and project path
 * @param options - namespace and capabilities
 * @returns the emit report and, when it succeeded, the generated module
 * @throws when the worker cannot be run or rejects a request outright
 */
export function build(projectRoot: string, options: BuildOptions = {}): BuildResult {
  const requests: object[] = [{ id: "emit", kind: "emit" }];
  if (!options.emitOnly) {
    requests.push({ id: "module", kind: "module", namespace: options.namespace, capabilities: options.capabilities });
  }

  const started = Date.now();
  const run = spawnSync(process.execPath, [resolveWorker(projectRoot)], {
    cwd: projectRoot,
    input: JSON.stringify({ project: projectRoot, requests }),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024
  });
  if (run.status !== 0) {
    throw new Error(`Build worker failed (${run.status}): ${(run.stderr || "").trim().slice(0, 4000)}`);
  }
  const response = JSON.parse(run.stdout);
  const failed = Object.entries(response.errors ?? {});
  if (failed.length) {
    throw new Error(`Build worker rejected ${failed.map(([id, message]) => `${id}: ${message}`).join("; ")}`);
  }
  const emit: EmitReport = response.results.emit;
  useLog("DEBUG", `Build worker: ${emit.written} files, edits ${JSON.stringify(emit.editCounts)}, ${Date.now() - started}ms`);
  return { emit, module: emit.diagnosticCount === 0 ? response.results.module : undefined };
}
