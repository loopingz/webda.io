#!/usr/bin/env node
/**
 * Check that every published package with a webda.module.json lists it in
 * the `files` of its package.json.
 *
 * The module file declares the package's services, models and CLI commands:
 * left out of the npm tarball, an application installing the package never
 * discovers them (`webda debug` stayed an unknown command with @webda/debug
 * 4.0.0-beta.6).
 *
 * Also check that every published package is listed in release-please-config.json and
 * .release-please-manifest.json: release-please only versions and tags the packages it
 * lists, and the publish script only publishes the manifest ones (@webda/react-email stayed
 * on 4.0.0-beta.11 and never reached npm).
 *
 * Usage: node scripts/check-package-files.mjs [packagesDir]
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Published packages whose webda.module.json would be missing from the tarball.
 *
 * @param {string} packagesDir - folder holding one folder per package
 * @returns {string[]} the package names
 */
export function findUnpublishedModules(packagesDir) {
  const missing = [];
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(packagesDir, entry.name);
    if (!existsSync(join(dir, "package.json")) || !existsSync(join(dir, "webda.module.json"))) continue;
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    // Private packages are not published; without `files` npm publishes the whole folder
    if (pkg.private || !Array.isArray(pkg.files)) continue;
    if (!pkg.files.some(f => f === "webda.module.json" || f === "./webda.module.json")) missing.push(pkg.name);
  }
  return missing.sort();
}

/**
 * Published packages that release-please does not release.
 *
 * @param {string} rootDir - repository root, holding packages/ and the release-please files
 * @returns {string[]} the package names, with the release-please file that misses them
 */
export function findUnreleasedPackages(rootDir) {
  const config = JSON.parse(readFileSync(join(rootDir, "release-please-config.json"), "utf8")).packages ?? {};
  const manifest = JSON.parse(readFileSync(join(rootDir, ".release-please-manifest.json"), "utf8"));
  const missing = [];
  for (const entry of readdirSync(join(rootDir, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = `packages/${entry.name}`;
    if (!existsSync(join(rootDir, path, "package.json"))) continue;
    const pkg = JSON.parse(readFileSync(join(rootDir, path, "package.json"), "utf8"));
    if (pkg.private) continue;
    if (!(path in config)) missing.push(`${pkg.name} (release-please-config.json)`);
    if (!(path in manifest)) missing.push(`${pkg.name} (.release-please-manifest.json)`);
  }
  return missing.sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const packagesDir = resolve(process.argv[2] ?? join(import.meta.dirname, "..", "packages"));
  const missing = findUnpublishedModules(packagesDir);
  if (missing.length) {
    console.error(
      `These packages have a webda.module.json but do not publish it: add "webda.module.json" to their "files":\n` +
        missing.map(name => `  - ${name}`).join("\n")
    );
    process.exit(1);
  }
  const unreleased = findUnreleasedPackages(join(packagesDir, ".."));
  if (unreleased.length) {
    console.error(
      `These packages are published but release-please does not release them: add their folder:\n` +
        unreleased.map(name => `  - ${name}`).join("\n")
    );
    process.exit(1);
  }
  console.log("check-package-files: every published package ships its webda.module.json and is released");
}
