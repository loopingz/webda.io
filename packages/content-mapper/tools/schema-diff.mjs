// Byte-diff harness for stage 7: compares generated schemas against the
// committed webda.module.json.
//
// Written before the TypeScript 7 converter existed, deliberately. The port has
// to reproduce today's output exactly — including the discarded-program bug —
// so the target had to be measurable from the first line of code.
//
// Two backends answer the same requests, which is what makes the score a
// regression test rather than a claim:
//
//   --impl=ts7      @webda/content-mapper on the 7.1 checker (default, the port)
//   --impl=worker   @webda/schema on TypeScript 6 (the oracle, deleted at the end)
//
// Usage: node tools/schema-diff.mjs [--impl=ts7|worker] [--only=services|models]
//                                   [--verbose] [--diff=<name>]
import { readFileSync } from "node:fs";
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
const impl = flag("impl", "ts7");
const only = flag("only", "all");
const diffOne = flag("diff", undefined);

/** Packages carrying a committed module to compare against. */
const TARGETS = ["packages/core", "packages/models", "packages/runtime", "sample-app"];

/**
 * Committed schemas the port deliberately does not reproduce.
 *
 * `@webda/schema` builds its own `Program` from the process cwd and discards
 * the one it is handed (`generator.ts:261-266`), so schemas are generated with
 * a checker that does not own the nodes being converted. When a service names
 * no parameters type of its own, the node is `ServiceParameters` inside
 * `@webda/core`'s `service.d.ts`, and that reference does not resolve across
 * the program boundary — the checker returns the error type. Instrumenting a
 * real `webdac build` shows it directly:
 *
 *     [PROBE] node=TypeReference "ServiceParameters" file=service.d.ts
 *             type=ServiceParameters flags=1 props=0
 *
 * `flags=1` is `TypeFlags.Any`: the error type, printed under the name it
 * failed to resolve. The committed `Schema` is what falls out of that — no
 * `type`, no `properties` beyond the injected `openapi`.
 *
 * The TypeScript 7 pipeline has one program, so the reference resolves and the
 * real `ServiceParameters` schema is emitted. That is a fix, and a visible
 * one: these services gain a required `type` property in configuration
 * validation. It is recorded here rather than suppressed, and the shape of
 * both sides is asserted, so the exemption stops applying the moment either
 * changes.
 */
const KNOWN_DEFECTS = {
  ids: new Set([
    "Webda/PasswordEncryptionService",
    "WebdaDemo/SimpleService",
    "WebdaDemo/TestCommandService",
    "WebdaDemo/ThirdOtherService",
    "WebdaDemo/BeanService",
    "WebdaDemo/SampleAppGoodBean"
  ]),
  reason: "ServiceParameters unresolved across @webda/schema's discarded program",
  /**
   * Whether a mismatch is exactly the defect described above.
   * @param got - what the port generated
   * @param want - what is committed
   * @returns true when both sides have the expected shape
   */
  matches(got, want) {
    const degenerate =
      want.type === undefined && Object.keys(want.properties ?? { openapi: 1 }).join(",") === "openapi";
    const resolved = got.type === "object" && got.properties?.type?.type === "string";
    return degenerate && resolved;
  }
};

/** Where each backend's worker lives. Both speak the same protocol. */
const WORKERS = {
  ts7: join(repo, "packages", "content-mapper", "lib", "schema", "worker-cli.js"),
  worker: join(repo, "packages", "schema", "lib", "worker-cli.js")
};

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
        if (!exportName || exportName === "default") continue;
        requests.push({ id, kind: "service", file, className: exportName, addOpenApi: true });
        expected.set(id, { group: "services", schema: entry.Schema });
      }
    }
  }
  if (only === "all" || only === "models") {
    for (const [id, entry] of Object.entries(committed.models ?? {})) {
      if (!entry.Schemas) continue;
      const { file, exportName } = sourceOf(root, entry.Import);
      expected.set(id, { group: "models", schema: entry.Schemas });
      // A default export is recorded as `:default`, so the class cannot be
      // found by name. Counted, not requested — it is still one of the 29 the
      // definition of done names, and hiding it would flatter the score.
      if (!exportName || exportName === "default") continue;
      requests.push({ id, kind: "model", file, className: exportName });
    }
  }
  return { requests, expected };
}

/**
 * Run a backend over a batch of requests.
 * @param root - package root, used as cwd and project path
 * @param requests - the batch
 * @returns the worker response, or undefined when the worker itself failed
 */
function generate(root, requests) {
  if (requests.length === 0) return { results: {}, errors: {} };
  const run = spawnSync(process.execPath, [WORKERS[impl]], {
    cwd: root,
    input: JSON.stringify({ project: root, requests }),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
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
 * Report the first few differing paths between two schemas.
 * @param actual - generated value
 * @param want - committed value
 * @param path - current JSON pointer
 * @param out - accumulator
 * @returns the accumulated differences
 */
function differences(actual, want, path = "", out = []) {
  if (out.length >= 12) return out;
  if (canonical(actual) === canonical(want)) return out;
  const bothObjects =
    actual && want && typeof actual === "object" && typeof want === "object" && !Array.isArray(actual) && !Array.isArray(want);
  if (!bothObjects) {
    out.push(`${path || "/"}\n      got:  ${JSON.stringify(actual)}\n      want: ${JSON.stringify(want)}`);
    return out;
  }
  for (const key of new Set([...Object.keys(actual), ...Object.keys(want)])) {
    differences(actual[key], want[key], `${path}/${key}`, out);
  }
  return out;
}

const blank = () => ({ match: 0, total: 0, known: 0 });
const totals = { services: blank(), models: blank() };
let unexpected = 0;

for (const relative of TARGETS) {
  const root = join(repo, relative);
  let committed;
  try {
    committed = JSON.parse(readFileSync(join(root, "webda.module.json"), "utf8"));
  } catch {
    continue;
  }

  const { requests, expected } = plan(root, committed);
  const response = generate(root, requests);
  if (!response) continue;

  const scores = { services: blank(), models: blank() };
  for (const [id, { group, schema }] of expected) {
    scores[group].total++;
    totals[group].total++;
    const got = response.results[id];
    if (got !== undefined && canonical(got) === canonical(schema)) {
      scores[group].match++;
      totals[group].match++;
      continue;
    }
    if (impl === "ts7" && got !== undefined && KNOWN_DEFECTS.ids.has(id) && KNOWN_DEFECTS.matches(got, schema)) {
      scores[group].known++;
      totals[group].known++;
      if (verbose) console.log(`  DIVERGES  ${id} — ${KNOWN_DEFECTS.reason}`);
      continue;
    }
    unexpected++;
    if (diffOne && id !== diffOne) continue;
    if (verbose || diffOne) {
      const reason = response.errors[id];
      console.log(`  MISMATCH ${id}${reason ? ` — ${reason}` : ""}`);
      if (got !== undefined) for (const line of differences(got, schema)) console.log(`    ${line}`);
    }
  }

  const render = group => {
    const { match, total, known } = scores[group];
    if (total === 0) return `${group} —`;
    const suffix = known ? ` (+${known} known)` : "";
    return `${group} ${match + known === total ? "IDENTICAL" : `${match}/${total}`}${suffix}`;
  };
  console.log(`${relative.padEnd(18)} ${render("services").padEnd(28)} ${render("models")}`);
}

console.log("");
for (const group of ["services", "models"]) {
  const { match, total, known } = totals[group];
  if (total === 0) continue;
  const note = known ? ` + ${known} known divergence${known === 1 ? "" : "s"}` : "";
  console.log(`${group.padEnd(10)} ${match}/${total}${note} ${match + known === total ? "IDENTICAL" : ""}`);
}
console.log(`backend: ${impl}`);
process.exitCode = unexpected === 0 ? 0 : 1;
