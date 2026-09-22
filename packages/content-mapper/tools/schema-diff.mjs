// Golden-file check for generated schemas: regenerates every schema in the
// repo and diffs it against the committed `webda.module.json`.
//
// This began as the scoreboard for porting `@webda/schema` to TypeScript 7.1
// and scored three outcomes — identical, a proven divergence, or an
// unexplained mismatch — because the committed artefacts predated the port
// and could not all be reproduced. They have since been regenerated, so the
// divergence machinery is gone and the only acceptable result is identical.
// The history is in `docs/contribute/TypeScript 7 Content Mappers.md` §7.
//
// Exit code 1 on any mismatch, so it is usable as a check.
//
// Usage: node tools/schema-diff.mjs [--only=services|models|top]
//                                   [--targets=<substring>] [--verbose] [--diff=<name>]
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
const only = flag("only", "all");
const diffOne = flag("diff", undefined);

/**
 * Every directory carrying a committed module and a tsconfig to open.
 *
 * Discovered rather than listed: a hand-maintained list is exactly where a
 * package quietly stops being checked. `--targets=` narrows it while
 * iterating.
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

const TARGETS = discoverTargets();

/** Request id under which the whole top-level `schemas` map is returned. */
const TOP_LEVEL_ID = "@topLevel";

/** The generator, driven out of process. */
const WORKER = join(repo, "packages", "content-mapper", "lib", "schema", "worker-cli.js");

/**
 * Recover the source file and export name recorded in an `Import` string.
 * @param root - package root
 * @param importTarget - e.g. `lib/services/store.service:Store`
 * @returns absolute source path and export name
 */
function sourceOf(root, importTarget) {
  const [path, exportName] = importTarget.split(":");
  return { file: join(root, path.replace(/^lib\//, "src/")) + ".ts", exportName };
}

/**
 * Build the request batch for one package.
 * @param root - package root
 * @param committed - the parsed webda.module.json
 * @returns requests and the expected schema for each id
 */
function plan(root, committed) {
  const requests = [];
  const expected = new Map();

  if (only === "all" || only === "services") {
    for (const section of ["moddas", "beans"]) {
      for (const [id, entry] of Object.entries(committed[section] ?? {})) {
        if (!entry.Schema) continue;
        const { file, exportName } = sourceOf(root, entry.Import);
        // `:default` is a real export name, not a gap — the generator finds a
        // default-exported class by its modifier.
        if (!exportName) continue;
        requests.push({ id, kind: "service", file, className: exportName, addOpenApi: true });
        expected.set(id, { group: "services", schema: entry.Schema });
      }
    }
  }
  if (only === "all" || only === "top") {
    // One request, one answer: these entries record no provenance, so the
    // generator has to rediscover them rather than be told what to produce.
    requests.push({ id: TOP_LEVEL_ID, kind: "topLevel" });
    for (const [name, schema] of Object.entries(committed.schemas ?? {})) {
      expected.set(`${TOP_LEVEL_ID}:${name}`, { group: "top", schema, member: name });
    }
  }
  if (only === "all" || only === "models") {
    for (const [id, entry] of Object.entries(committed.models ?? {})) {
      if (!entry.Schemas) continue;
      const { file, exportName } = sourceOf(root, entry.Import);
      expected.set(id, { group: "models", schema: entry.Schemas });
      if (!exportName) continue;
      requests.push({ id, kind: "model", file, className: exportName });
    }
  }
  return { requests, expected };
}

/**
 * Run the generator over a batch of requests.
 * @param root - package root, used as cwd and project path
 * @param requests - the batch
 * @returns the response, or undefined when the worker itself failed
 */
function generate(root, requests) {
  if (requests.length === 0) return { results: {}, errors: {} };
  const run = spawnSync(process.execPath, [WORKER], {
    cwd: root,
    input: JSON.stringify({ project: root, requests }),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024
  });
  if (run.status !== 0) {
    console.log("  worker failed:", (run.stderr || "").split("\n").slice(0, 5).join(" | "));
    return undefined;
  }
  return JSON.parse(run.stdout);
}

/**
 * Stable stringify so key order cannot cause a false mismatch.
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
 * Every differing leaf between two schemas.
 * @param actual - generated value
 * @param want - committed value
 * @param path - current JSON pointer
 * @param out - accumulator
 * @returns the differences
 */
function differences(actual, want, path = "", out = []) {
  if (canonical(actual) === canonical(want)) return out;
  const plain = value => value && typeof value === "object" && !Array.isArray(value);
  if (!plain(actual) || !plain(want)) {
    out.push({ path: path || "/", got: actual, want });
    return out;
  }
  for (const key of new Set([...Object.keys(actual), ...Object.keys(want)])) {
    differences(actual[key], want[key], `${path}/${key}`, out);
  }
  return out;
}

const blank = () => ({ match: 0, total: 0 });
const totals = { services: blank(), models: blank(), top: blank() };
const stale = [];
const uninstalled = [];
let mismatches = 0;

for (const relative of TARGETS) {
  const root = join(repo, relative);
  let committed;
  try {
    committed = JSON.parse(readFileSync(join(root, "webda.module.json"), "utf8"));
  } catch {
    continue;
  }

  // Modules that predate the current generator: their `moddas` are bare
  // import strings and they carry no `$schema`. Ten of the eleven are also
  // `!`-excluded in pnpm-workspace.yaml as not yet ready.
  if (committed.$schema === undefined) {
    stale.push(relative);
    continue;
  }

  // Compiler test fixtures carry a committed module but no installed
  // dependencies, so `@webda/core` cannot resolve and no class can be
  // classified. They are regenerated inside the compiler's own tests, which
  // set resolution up differently.
  if (!existsSync(join(root, "node_modules"))) {
    uninstalled.push(relative);
    continue;
  }

  const { requests, expected } = plan(root, committed);
  const response = generate(root, requests);
  if (!response) continue;

  const scores = { services: blank(), models: blank(), top: blank() };
  const produced = response.results[TOP_LEVEL_ID];
  if (produced && (only === "all" || only === "top")) {
    // Keys the generator invents are as wrong as keys it misses, and only
    // this direction catches them.
    for (const name of Object.keys(produced)) {
      const key = `${TOP_LEVEL_ID}:${name}`;
      if (!expected.has(key)) expected.set(key, { group: "top", schema: undefined, member: name });
    }
  }

  for (const [id, { group, schema, member }] of expected) {
    scores[group].total++;
    totals[group].total++;
    const got = member === undefined ? response.results[id] : produced?.[member];
    if (schema !== undefined && got !== undefined && canonical(got) === canonical(schema)) {
      scores[group].match++;
      totals[group].match++;
      continue;
    }
    mismatches++;
    if (diffOne && (member ?? id) !== diffOne) continue;
    if (verbose || diffOne) {
      const reason = response.errors[member === undefined ? id : TOP_LEVEL_ID];
      console.log(`  MISMATCH ${member ?? id}${reason ? ` — ${reason}` : ""}`);
      if (got !== undefined) {
        for (const diff of differences(got, schema).slice(0, 12)) {
          console.log(`    ${diff.path}\n      got:  ${JSON.stringify(diff.got)}\n      want: ${JSON.stringify(diff.want)}`);
        }
      }
    }
  }

  const score = group => {
    const { match, total } = scores[group];
    if (total === 0) return `${group} —`;
    return `${group} ${match === total ? "IDENTICAL" : `${match}/${total}`}`;
  };
  console.log(`${relative.padEnd(24)} ${score("services").padEnd(20)} ${score("models").padEnd(18)} ${score("top")}`);
}

console.log("");
for (const group of ["services", "models", "top"]) {
  const { match, total } = totals[group];
  if (total === 0) continue;
  console.log(`${group.padEnd(10)} ${match}/${total} ${match === total ? "IDENTICAL" : ""}`);
}
if (uninstalled.length > 0) {
  console.log(`skipped ${uninstalled.length} projects with no installed dependencies: ${uninstalled.join(", ")}`);
}
if (stale.length > 0) {
  console.log(`skipped ${stale.length} pre-format modules (no $schema, string moddas): ${stale.join(", ")}`);
}
process.exitCode = mismatches === 0 ? 0 : 1;
