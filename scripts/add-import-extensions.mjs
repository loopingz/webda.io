#!/usr/bin/env node
/**
 * Give every import an explicit, resolved extension, as `nodenext` requires.
 *
 * Replaces what `@webda/tsc-esm` did after emit. That writer appended `.js`
 * to relative specifiers by regex, without looking at the filesystem, so a
 * directory import (`./filters`) became `./filters.js` and failed at runtime
 * with nothing reporting it. This resolves each specifier against the real
 * tree instead, and **refuses** — exits 1, naming file and line — when it
 * cannot resolve one, rather than guessing.
 *
 *   ./x              -> ./x.js              when x.ts exists
 *   ./dir            -> ./dir/index.js      when dir/index.ts exists
 *   pkg/deep/path    -> pkg/deep/path.js    when pkg has no `exports` map
 *   pkg/deep/dir     -> pkg/deep/dir/index.js
 *
 * Packages that declare `exports` are left alone: there, the map decides what
 * is importable, and appending an extension could name a path it never
 * exposes. Bare package roots (`antlr4ts`) are left alone too — `main`
 * resolves those.
 *
 * Covers static imports, re-exports, side-effect imports, dynamic `import()`
 * and `vi.mock()` / `vi.importActual()` / `vi.doMock()`.
 *
 * Usage: node scripts/add-import-extensions.mjs <dir>... [--check]
 *   --check   report what would change and exit 1 if anything would; for CI
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, normalize, relative, resolve } from "node:path";

const SPECIFIER =
  /(\bfrom\s+|\bimport\s+|\bimport\s*\(\s*|\bvi\.(?:mock|importActual|doMock)\s*\(\s*)(['"])([^'"\n]+)\2/g;
const HAS_EXTENSION = /\.(js|mjs|cjs|json|ts|mts|cts|tsx|jsx|css|node|wasm)$/;
const SOURCE = /\.(ts|tsx|mts|cts)$/;

/** Emitted extension for each source extension. */
const EMITTED = [
  [".ts", ".js"],
  [".tsx", ".js"],
  [".mts", ".mjs"],
  [".cts", ".cjs"]
];

/**
 * Whether a path is an existing file.
 * @param path - absolute path
 * @returns true for a regular file
 */
function isFile(path) {
  return existsSync(path) && statSync(path).isFile();
}

/**
 * Resolve a relative specifier against the source tree.
 * @param directory - directory of the importing file
 * @param spec - the specifier, e.g. `./x` or `../dir`
 * @returns the specifier with its emitted extension, or undefined
 */
function resolveRelative(directory, spec) {
  const base = normalize(join(directory, spec));
  for (const [source, emitted] of EMITTED) {
    if (isFile(base + source)) return spec + emitted;
  }
  for (const [source, emitted] of EMITTED) {
    if (isFile(join(base, "index" + source))) return `${spec.replace(/\/$/, "")}/index${emitted}`;
  }
  return undefined;
}

/** Package directory, and whether it has an `exports` map, by name. */
const packages = new Map();

/**
 * Locate an installed package as seen from a file.
 * @param fromFile - the importing file
 * @param name - package name, scoped or not
 * @returns the package directory and whether it declares `exports`
 */
function packageInfo(fromFile, name) {
  const key = `${dirname(fromFile)}\0${name}`;
  if (packages.has(key)) return packages.get(key);
  let info;
  try {
    const manifest = createRequire(fromFile).resolve(`${name}/package.json`);
    info = { directory: dirname(manifest), hasExports: JSON.parse(readFileSync(manifest, "utf8")).exports !== undefined };
  } catch (error) {
    // Only the two outcomes that mean "leave it alone": not installed, or an
    // `exports` map that hides package.json — in which case the package
    // decides its own subpaths. Anything else is a bug here, and swallowing
    // it would silently skip every bare specifier while reporting success.
    if (error.code !== "MODULE_NOT_FOUND" && error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
    info = undefined;
  }
  packages.set(key, info);
  return info;
}

/**
 * Resolve a bare deep specifier into a package without an `exports` map.
 * @param fromFile - the importing file
 * @param spec - e.g. `antlr4ts/misc/Utils`
 * @returns the rewritten specifier, `null` to leave it alone, or undefined
 *   when it should resolve and does not
 */
function resolveBare(fromFile, spec) {
  const parts = spec.split("/");
  const nameLength = spec.startsWith("@") ? 2 : 1;
  if (parts.length <= nameLength) return null;
  const name = parts.slice(0, nameLength).join("/");
  const subpath = parts.slice(nameLength).join("/");

  const info = packageInfo(fromFile, name);
  if (!info || info.hasExports) return null;

  const base = join(info.directory, subpath);
  if (isFile(base + ".js")) return spec + ".js";
  if (isFile(join(base, "index.js"))) return `${spec}/index.js`;
  return undefined;
}

/**
 * Every source file under a directory, declarations excluded.
 * @param directory - root to walk
 * @returns absolute paths
 */
function sources(directory) {
  const out = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "lib") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...sources(path));
    else if (SOURCE.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(path);
  }
  return out.sort();
}

const argv = process.argv.slice(2);
const check = argv.includes("--check");
// Absolute: `createRequire` rejects a relative path.
const roots = argv.filter(arg => !arg.startsWith("--")).map(root => resolve(root));
if (roots.length === 0) {
  console.error("usage: add-import-extensions.mjs <dir>... [--check]");
  process.exit(2);
}

let rewrites = 0;
let changedFiles = 0;
const failures = [];

for (const root of roots) {
  for (const file of sources(root)) {
    const text = readFileSync(file, "utf8");
    const updated = text.replace(SPECIFIER, (match, lead, quote, spec, offset) => {
      if (HAS_EXTENSION.test(spec) || spec.startsWith("node:") || spec.startsWith("#")) return match;
      const relativeSpec = spec === "." || spec === ".." || spec.startsWith("./") || spec.startsWith("../");
      const resolved = relativeSpec ? resolveRelative(dirname(file), spec) : resolveBare(file, spec);
      if (resolved === null) return match;
      if (resolved === undefined) {
        const line = text.slice(0, offset).split("\n").length;
        failures.push(`${relative(process.cwd(), file)}:${line}: cannot resolve ${JSON.stringify(spec)}`);
        return match;
      }
      rewrites++;
      return `${lead}${quote}${resolved}${quote}`;
    });
    if (updated !== text) {
      changedFiles++;
      if (!check) writeFileSync(file, updated);
    }
  }
}

console.log(`${check ? "would rewrite" : "rewrote"} ${rewrites} specifiers in ${changedFiles} files`);
for (const failure of failures) console.log(`  UNRESOLVED ${failure}`);
process.exitCode = failures.length > 0 || (check && rewrites > 0) ? 1 : 0;
