// Golden-file check for the whole `webda.module.json`: regenerates every
// module in the repo through the schema worker's `module` request and diffs
// it against the committed file, section by section and entry by entry.
//
// Two comparisons are made, because the file is committed and byte identity
// is the target:
//
// - by value (key order ignored) — a mismatch here is a wrong result;
// - by serialisation (`JSON.stringify` with the committed key order vs the
//   generated key order) — a mismatch here, with values equal, is reported
//   separately as ORDER.
//
// `sourceDigest` is ignored: it hashes sources and is computed by the
// TypeScript 6 compiler, not by the generator. A committed module *without*
// one was not written by the current `webdac build` and is skipped.
//
// Exit code 1 on any mismatch, value or order.
//
// Usage: node tools/module-diff.mjs [--targets=<substring>] [--verbose] [--diff=<entry>]
//   --diff matches a section (`models`), an entry (`Webda/User`) or both
//   (`models.Webda/User`).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const verbose = argv.includes("--verbose");
const diffOne = flag("diff", undefined);

/**
 * Every directory carrying a committed module and a tsconfig to open.
 * Same discovery as `schema-diff.mjs`.
 * @returns repo-relative directories, in a stable order
 */
function discoverTargets() {
  const filter = flag("targets", undefined);
  const found = [];
  const walk = directory => {
    for (const entry of readdirSync(join(repo, directory), { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const relative = `${directory}/${entry.name}`;
      if (existsSync(join(repo, relative, "webda.module.json")) && existsSync(join(repo, relative, "tsconfig.json"))) {
        found.push(relative);
      } else {
        walk(relative);
      }
    }
  };
  for (const root of ["packages", "sample-apps", "test"]) {
    if (existsSync(join(repo, root))) walk(root);
  }
  if (existsSync(join(repo, "sample-app", "webda.module.json"))) found.push("sample-app");
  found.sort();
  return filter ? found.filter(target => target.includes(filter)) : found;
}

/** The generator, driven out of process. */
const WORKER = join(repo, "packages", "content-mapper", "lib", "schema", "worker-cli.js");

/** Sections compared, in file order. */
const SECTIONS = ["$schema", "beans", "deployers", "moddas", "models", "schemas", "behaviors", "capabilities"];

/**
 * Run the worker's `module` request.
 * @param root - package root
 * @returns the worker's module result, or an error string
 */
function generate(root) {
  const run = spawnSync(process.execPath, [WORKER], {
    cwd: root,
    input: JSON.stringify({ project: root, requests: [{ id: "module", kind: "module" }] }),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024
  });
  if (run.status !== 0) return `worker failed: ${(run.stderr || "").split("\n").slice(0, 5).join(" | ")}`;
  const response = JSON.parse(run.stdout);
  if (response.errors?.module) return `module request failed: ${response.errors.module}`;
  return response.results.module;
}

/**
 * Stable stringify so key order cannot cause a false value mismatch.
 * @param value - any JSON value
 * @returns canonical JSON
 */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Every differing leaf between two values, by value.
 * @param actual - generated
 * @param want - committed
 * @param path - current pointer
 * @param out - accumulator
 * @returns the differences
 */
function differences(actual, want, path = "", out = []) {
  if (canonical(actual) === canonical(want)) return out;
  const plain = value => value && typeof value === "object" && !Array.isArray(value);
  if (Array.isArray(actual) && Array.isArray(want) && actual.length === want.length) {
    actual.forEach((item, index) => differences(item, want[index], `${path}/${index}`, out));
    return out;
  }
  if (!plain(actual) || !plain(want)) {
    out.push({ path: path || "/", got: actual, want });
    return out;
  }
  for (const key of new Set([...Object.keys(actual), ...Object.keys(want)])) {
    differences(actual[key], want[key], `${path}/${key}`, out);
  }
  return out;
}

/**
 * First object whose key order differs, for an order-only mismatch.
 * @param actual - generated
 * @param want - committed
 * @param path - current pointer
 * @returns the path and both key lists, or undefined
 */
function orderDifference(actual, want, path = "") {
  if (Array.isArray(actual) && Array.isArray(want)) {
    for (let i = 0; i < want.length; i++) {
      const found = orderDifference(actual[i], want[i], `${path}/${i}`);
      if (found) return found;
    }
    return undefined;
  }
  if (actual && want && typeof actual === "object" && typeof want === "object") {
    const a = Object.keys(actual);
    const w = Object.keys(want);
    if (a.join("\u0000") !== w.join("\u0000")) return { path: path || "/", got: a, want: w };
    for (const key of w) {
      const found = orderDifference(actual[key], want[key], `${path}/${key}`);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Whether a diff should print for this entry.
 * @param section - section name
 * @param entry - entry key, or undefined for the section itself
 * @returns true to print
 */
function wanted(section, entry) {
  if (verbose) return true;
  if (!diffOne) return false;
  return diffOne === section || diffOne === entry || diffOne === `${section}.${entry}`;
}

/**
 * Print value differences.
 * @param label - what is being compared
 * @param got - generated
 * @param want - committed
 */
function printDiff(label, got, want) {
  console.log(`  MISMATCH ${label}`);
  for (const diff of differences(got, want).slice(0, 12)) {
    console.log(`    ${diff.path}\n      got:  ${JSON.stringify(diff.got)}\n      want: ${JSON.stringify(diff.want)}`);
  }
}

/**
 * Print an order-only difference.
 * @param label - what is being compared
 * @param got - generated
 * @param want - committed
 */
function printOrder(label, got, want) {
  const found = orderDifference(got, want);
  console.log(`  ORDER ${label}`);
  if (found) {
    console.log(`    ${found.path}\n      got:  ${JSON.stringify(found.got)}\n      want: ${JSON.stringify(found.want)}`);
  }
}

const stale = [];
const uninstalled = [];
const undigested = [];
let failures = 0;
const totals = {};

for (const relative of discoverTargets()) {
  const root = join(repo, relative);
  let committed;
  let raw;
  try {
    raw = readFileSync(join(root, "webda.module.json"), "utf8");
    committed = JSON.parse(raw);
  } catch {
    continue;
  }
  if (committed.$schema === undefined) {
    stale.push(relative);
    continue;
  }
  // Every module written by the current `webdac build` carries a
  // `sourceDigest`. One without it predates that generator (and the
  // `behaviors` section) and is not an oracle for it.
  if (committed.sourceDigest === undefined) {
    undigested.push(relative);
    continue;
  }
  if (!existsSync(join(root, "node_modules"))) {
    uninstalled.push(relative);
    continue;
  }

  const result = generate(root);
  if (typeof result === "string") {
    failures++;
    console.log(`${relative.padEnd(28)} ${result}`);
    continue;
  }
  const generated = result.module;
  const digest = committed.sourceDigest;
  delete committed.sourceDigest;

  const scores = [];
  for (const section of SECTIONS) {
    const want = committed[section];
    const got = generated[section];
    totals[section] ??= { identical: 0, total: 0 };
    if (want === undefined && got === undefined) continue;
    totals[section].total++;

    const isMap = want && typeof want === "object" && got && typeof got === "object";
    let valueMismatch = 0;
    let orderMismatch = 0;
    let entries = 0;
    if (isMap) {
      for (const entry of new Set([...Object.keys(want), ...Object.keys(got)])) {
        entries++;
        if (canonical(got[entry]) !== canonical(want[entry])) {
          valueMismatch++;
          if (wanted(section, entry)) printDiff(`${section}.${entry}`, got[entry], want[entry]);
        } else if (JSON.stringify(got[entry]) !== JSON.stringify(want[entry])) {
          orderMismatch++;
          if (wanted(section, entry)) printOrder(`${section}.${entry}`, got[entry], want[entry]);
        }
      }
      // Entry order within the section itself.
      if (valueMismatch === 0 && orderMismatch === 0 && Object.keys(got).join("\0") !== Object.keys(want).join("\0")) {
        orderMismatch++;
        if (wanted(section, undefined)) printOrder(section, got, want);
      }
    } else if (canonical(got) !== canonical(want)) {
      valueMismatch++;
      if (wanted(section, undefined)) printDiff(section, got, want);
    }

    let label;
    if (valueMismatch) label = `${section} ${isMap ? `${entries - valueMismatch}/${entries}` : "MISMATCH"}`;
    else if (orderMismatch) label = `${section} ORDER(${orderMismatch})`;
    else label = `${section} IDENTICAL`;
    if (valueMismatch || orderMismatch) failures++;
    else totals[section].identical++;
    scores.push(label);
  }

  // Byte identity of the whole file as `FileUtils.save` writes it, with the
  // committed sourceDigest spliced back in (it is always the last key).
  const bytes =
    JSON.stringify(digest === undefined ? generated : { ...generated, sourceDigest: digest }, undefined, 2) === raw;
  if (!bytes) failures++;
  console.log(`${relative.padEnd(28)} ${bytes ? "BYTES IDENTICAL" : "BYTES DIFFER"}`);
  console.log(`  ${scores.join(" | ")}`);
  if (result.namingViolations?.length) {
    console.log(`  naming violations: ${result.namingViolations.map(v => `${v.className} (${v.fileName})`).join(", ")}`);
  }
  if (result.errors?.length) {
    console.log(`  generator errors: ${result.errors.join(" | ")}`);
  }
}

console.log("");
for (const section of SECTIONS) {
  const { identical, total } = totals[section] ?? { identical: 0, total: 0 };
  if (total === 0) continue;
  console.log(`${section.padEnd(14)} ${identical}/${total} ${identical === total ? "IDENTICAL" : ""}`);
}
if (uninstalled.length > 0) {
  console.log(`skipped ${uninstalled.length} projects with no installed dependencies: ${uninstalled.join(", ")}`);
}
if (stale.length > 0) {
  console.log(`skipped ${stale.length} pre-format modules (no $schema): ${stale.join(", ")}`);
}
if (undigested.length > 0) {
  console.log(`skipped ${undigested.length} modules not written by the current webdac (no sourceDigest): ${undigested.join(", ")}`);
}
process.exitCode = failures === 0 ? 0 : 1;
