/**
 * `webda-codegen` — TypeScript 7 compatible replacement for the emit-time
 * accessor transformer.
 *
 * Pipeline:
 *
 *   src/*.ts  ──[webda-codegen]──►  .webda/gen/*.ts  ──[any compiler]──►  lib/
 *
 * The generated directory contains ordinary TypeScript. Nothing downstream of
 * this step needs to know Webda exists, which is what removes the dependency on
 * custom transformers, ts-patch and the language-service plugin simultaneously.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { analyze } from "./analyzer.ts";
import { rewrite } from "./rewriter.ts";
import { DEFAULT_COERCIONS, type CodegenOptions } from "./types.ts";

export interface RunOptions extends CodegenOptions {
  /** Absolute path to the project's tsconfig.json. */
  configFile: string;
  /** Source root; only files beneath it are processed. */
  rootDir: string;
  /** Directory that generated sources are written to. */
  outDir: string;
}

export interface RunResult {
  /** Files that were rewritten. */
  changed: string[];
  /** Files copied through unchanged. */
  copied: string[];
}

/**
 * Run the codegen over a project.
 * @param options - run options
 * @returns which files were rewritten and which were passed through
 */
export function run(options: RunOptions): RunResult {
  const configFile = resolve(options.configFile);
  const rootDir = resolve(options.rootDir);
  const outDir = resolve(options.outDir);
  const storageModule = options.storageModule ?? "@webda/models";
  const coercions = options.coercions ?? DEFAULT_COERCIONS;

  const { plans, sources } = analyze(configFile, rootDir, options);
  const planByFile = new Map(plans.map(p => [p.fileName, p]));

  const changed: string[] = [];
  const copied: string[] = [];

  for (const [fileName, text] of sources) {
    const plan = planByFile.get(fileName);
    const output = plan ? rewrite(plan, text, storageModule, coercions) : text;

    const target = join(outDir, relative(rootDir, fileName));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, output);

    (plan ? changed : copied).push(relative(rootDir, fileName));
  }

  return { changed, copied };
}

export { analyze } from "./analyzer.ts";
export { rewrite } from "./rewriter.ts";
export * from "./types.ts";
