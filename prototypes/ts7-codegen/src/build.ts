/**
 * `webda-build` — the compile-time wrapper.
 *
 * Restores the original ergonomics: the author writes `createdAt: Date` and
 * never sees generated code. Codegen happens into a throwaway directory, the
 * compiler runs against that, and source maps are rewritten to point back at
 * the real sources.
 *
 *   src/*.ts ──[codegen]──► <tmp>/gen/*.ts ──[tsgo]──► lib/*.js + lib/*.d.ts
 *                                                       └── sourcemaps → src/
 *
 * Note this fixes the *build*. It does not fix the *editor*: while editing
 * `src/`, the language server still sees `createdAt: Date` and will reject
 * `u.createdAt = "2020-01-01"` with TS2322. See README "The editor problem".
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { run } from "./index.ts";
import type { CodegenOptions } from "./types.ts";

export interface BuildOptions extends CodegenOptions {
  /** Path to the package's tsconfig.json. */
  project: string;
  /** Path to the compiler binary to invoke (defaults to the bundled tsgo). */
  compiler?: string;
  /** Keep the intermediate directory for inspection. */
  keepIntermediate?: boolean;
}

/**
 * Strip comments from a tsconfig so it can be parsed with `JSON.parse`.
 * @param text - raw tsconfig text
 * @returns JSON-parseable text
 */
function stripJsonComments(text: string): string {
  return text.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, c) => (c ? "" : m));
}

/**
 * Recursively list files under a directory.
 * @param dir - directory to walk
 * @returns absolute file paths
 */
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/**
 * Rewrite the `sources` entries of emitted source maps so they point at the
 * author's real files instead of the intermediate generated copies.
 * @param outDir - directory containing emitted output
 * @param genDir - the intermediate generated directory
 * @param rootDir - the original source root
 */
function remapSourceMaps(outDir: string, genDir: string, rootDir: string): void {
  for (const file of walk(outDir)) {
    if (!file.endsWith(".map")) continue;
    const map = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(map.sources)) continue;
    map.sources = map.sources.map((s: string) => {
      const abs = resolve(dirname(file), s);
      if (!abs.startsWith(genDir)) return s;
      const original = join(rootDir, relative(genDir, abs));
      return relative(dirname(file), original);
    });
    writeFileSync(file, JSON.stringify(map));
  }
}

/**
 * Locate a compiler binary: prefer one hoisted near the package being built,
 * then fall back to the tsgo bundled with this tool.
 * @param pkgDir - directory of the package being built
 * @returns path to a `tsc` executable
 */
function resolveCompiler(pkgDir: string): string {
  let dir = pkgDir;
  for (;;) {
    const candidate = join(dir, "node_modules", ".bin", "tsc");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(import.meta.dirname, "..", "node_modules", ".bin", "tsc");
}

/**
 * Run codegen then compile, leaving the author's sources untouched.
 * @param options - build options
 * @returns the compiler's exit code
 */
export function build(options: BuildOptions): number {
  const project = resolve(options.project);
  const pkgDir = dirname(project);
  const config = JSON.parse(stripJsonComments(readFileSync(project, "utf8")));
  const co = config.compilerOptions ?? {};

  const rootDir = resolve(pkgDir, co.rootDir ?? "src");
  const outDir = resolve(pkgDir, co.outDir ?? "lib");

  // The intermediate tree must live *inside* the package. Under `nodenext`,
  // module format is decided by the nearest package.json `type` field; a
  // directory in the OS temp dir has none, so generated ESM would be resolved
  // as CommonJS and the emitted output would silently be wrong.
  const workDir = join(pkgDir, ".webda", "build");
  const genDir = join(workDir, "gen");
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(genDir, { recursive: true });

  try {
    const result = run({ ...options, configFile: project, rootDir, outDir: genDir });

    // A tsconfig for the intermediate tree: same options, redirected roots, and
    // with `plugins` dropped since no compiler consumes it any more.
    const genConfig = {
      ...config,
      compilerOptions: { ...co, rootDir: genDir, outDir, plugins: undefined },
      include: [join(genDir, "**/*")],
      exclude: config.exclude
    };
    const genConfigPath = join(workDir, "tsconfig.json");
    writeFileSync(genConfigPath, JSON.stringify(genConfig, null, 2));

    const compiler = options.compiler ?? resolveCompiler(pkgDir);
    const proc = spawnSync(compiler, ["-p", genConfigPath], { stdio: "inherit" });
    if (proc.error) {
      console.error(`[webda-build] failed to run compiler '${compiler}': ${proc.error.message}`);
      return 1;
    }

    if (co.sourceMap || co.declarationMap) {
      remapSourceMaps(outDir, genDir, rootDir);
    }

    console.error(`[webda-build] codegen rewrote ${result.changed.length} file(s); compiled with ${compiler}`);
    return proc.status ?? 1;
  } finally {
    if (!options.keepIntermediate) rmSync(workDir, { recursive: true, force: true });
    else console.error(`[webda-build] intermediate kept at ${workDir}`);
  }
}
