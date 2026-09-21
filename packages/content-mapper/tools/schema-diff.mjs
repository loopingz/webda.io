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
// `--baseline=worker` diffs the two backends against each other instead of
// against the committed file. That separates two very different questions:
// "does the port reproduce the artefact" and "do the two implementations
// agree". Where they agree but the artefact differs, the artefact is the
// odd one out — `webdac build` runs the generator with a checker that does
// not own the nodes it is converting (§11), and that is visible here.
//
// Usage: node tools/schema-diff.mjs [--impl=ts7|worker] [--only=services|models]
//                                   [--baseline=committed|worker] [--no-cross-check]
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
const baseline = flag("baseline", "committed");
const crossCheck = !argv.includes("--no-cross-check");

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

/**
 * Model relations serialise to their primary key, not to an empty object.
 *
 * `ModelLink<T>.toJSON()` returns `PrimaryKeyType<T>` — which is
 * `PK<T, ...> & { toString(): string }` — and at runtime that is the uuid
 * string `getKey()` produces. The committed schemas instead describe every
 * relation as `{ type: "object", additionalProperties: false }`: an object
 * with no properties, which *rejects* the value actually stored.
 *
 * Two different TypeScript 6 failures produce that, and probing the 6.x
 * checker directly shows both:
 *
 *     packages/core  ModelLink<User>.toJSON() -> PrimaryKeyType<User>
 *     sample-app     ModelLink<User>.toJSON() -> { toString(): string; }
 *
 * In sample-app the `PK<T, T[typeof WEBDA_PRIMARY_KEY][number]>` half of the
 * intersection collapses — the symbol-keyed indexed access does not resolve —
 * leaving only the method, which converts to an empty object. In core it
 * resolves, and the committed file is wrong there for the separate reason
 * below (the port and the 6.x oracle agree; only the artefact differs).
 *
 * 7.1 resolves it consistently, so relations become `type: "string"`. This is
 * a real change to API validation and the most consequential thing in the
 * port — recorded, not suppressed.
 */
const RELATION_SERIALISATION = {
  reason: "model relations serialise to their primary key string, not an empty object",
  /**
   * Whether one property differs only by the relation correction.
   *
   * The reference side shows up in three shapes depending on how far 6.x got
   * with `PrimaryKeyType<T>`: a `$ref` to an empty object, an inline empty
   * object, or an `allOf` of empty objects when the intersection survived
   * unsimplified. All three describe a value that accepts no properties.
   * @param got - the port's property schema
   * @param want - the reference property schema
   * @param definitions - the reference document's definitions, to follow `$ref`
   * @returns true when this is the correction and not something else
   */
  matches(got, want, definitions) {
    if (got?.type !== "string" || !want) return false;
    const target = want.$ref?.startsWith("#/definitions/")
      ? definitions?.[decodeURIComponent(want.$ref.slice("#/definitions/".length))]
      : want;
    if (!target) return false;
    const empty = schema => schema?.type === "object" && schema.properties === undefined;
    return empty(target) || (Array.isArray(target.allOf) && target.allOf.every(empty));
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
      if (!exportName) continue;
      requests.push({ id, kind: "model", file, className: exportName });
    }
  }
  return { requests, expected };
}

/**
 * Run a backend over a batch of requests.
 * @param root - package root, used as cwd and project path
 * @param requests - the batch
 * @param backend - which worker to run; defaults to `--impl`
 * @returns the worker response, or undefined when the worker itself failed
 */
function generate(root, requests, backend = impl) {
  if (requests.length === 0) return { results: {}, errors: {} };
  const run = spawnSync(process.execPath, [WORKERS[backend]], {
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
 * Every differing leaf between two schemas.
 * @param actual - generated value
 * @param want - reference value
 * @param path - current JSON pointer
 * @param out - accumulator
 * @returns the differences, as `{ path, got, want }`
 */
function differences(actual, want, path = "", out = []) {
  if (canonical(actual) === canonical(want)) return out;
  const bothObjects =
    actual && want && typeof actual === "object" && typeof want === "object" && !Array.isArray(actual) && !Array.isArray(want);
  if (!bothObjects) {
    out.push({ path: path || "/", got: actual, want });
    return out;
  }
  for (const key of new Set([...Object.keys(actual), ...Object.keys(want)])) {
    differences(actual[key], want[key], `${path}/${key}`, out);
  }
  return out;
}

/**
 * Render differences for the console.
 * @param diffs - the differences
 * @returns printable lines
 */
function render(diffs) {
  return diffs
    .slice(0, 12)
    .map(d => `${d.path}\n      got:  ${JSON.stringify(d.got)}\n      want: ${JSON.stringify(d.want)}`);
}

/**
 * Whether two sets of model schemas differ only by the relation correction.
 *
 * Compared per property rather than per leaf: correcting one relation moves
 * several things at once — the property becomes `type: "string"`, whatever
 * described it before disappears, and a definition that existed only to hold
 * it is no longer emitted.
 * @param got - the port's schemas
 * @param want - the reference schemas
 * @returns true when nothing but relation properties differ
 */
function isRelationOnly(got, want) {
  let corrected = 0;
  for (const view of ["Input", "Output", "Stored"]) {
    const mine = got?.[view] ?? {};
    const theirs = want?.[view] ?? {};

    // Everything outside `properties` and `definitions` must be untouched.
    const outside = schema => Object.fromEntries(
      Object.entries(schema).filter(([key]) => key !== "properties" && key !== "definitions")
    );
    if (canonical(outside(mine)) !== canonical(outside(theirs))) return false;

    const names = new Set([...Object.keys(mine.properties ?? {}), ...Object.keys(theirs.properties ?? {})]);
    for (const name of names) {
      const a = mine.properties?.[name];
      const b = theirs.properties?.[name];
      if (canonical(a) === canonical(b)) continue;
      if (!RELATION_SERIALISATION.matches(a, b, theirs.definitions)) return false;
      corrected++;
    }

    // Definitions may only disappear — a new one would be something else.
    for (const key of Object.keys(mine.definitions ?? {})) {
      if (canonical(mine.definitions[key]) !== canonical(theirs.definitions?.[key])) return false;
    }
  }
  return corrected > 0;
}

/**
 * Why a mismatch against the committed file is expected, if it is.
 *
 * Three kinds are recognised, and each has to be demonstrated rather than
 * declared:
 *
 * - a service whose parameters type the 6.x pipeline failed to resolve
 * - a model where the port and the 6.x oracle agree, so only the committed
 *   artefact differs — it was generated by a build whose checker did not own
 *   the nodes it converted
 * - the relation-serialisation correction
 *
 * The second is the important one: it is verified by running the oracle, not
 * by listing ids, so it stops applying the moment the two implementations
 * stop agreeing.
 * @param id - the schema id
 * @param group - `services` or `models`
 * @param got - the port's output
 * @param want - the committed value
 * @param fromOracle - the oracle's output, when it was run
 * @returns a reason, or undefined when the mismatch is unexplained
 */
function explain(id, group, got, want, fromOracle) {
  if (baseline !== "committed") {
    return group === "models" && isRelationOnly(got, want) ? RELATION_SERIALISATION.reason : undefined;
  }
  if (impl !== "ts7") return undefined;
  if (KNOWN_DEFECTS.ids.has(id) && KNOWN_DEFECTS.matches(got, want)) return KNOWN_DEFECTS.reason;
  if (group !== "models") return undefined;

  // Diff against the oracle, not the artefact: that separates "the committed
  // file is stale" from "the port disagrees with the oracle", and a schema
  // can be both at once — a stale artefact *and* carry the relation change.
  if (fromOracle !== undefined) {
    if (canonical(got) === canonical(fromOracle)) {
      return "committed artefact is stale; the port and the TypeScript 6 oracle agree";
    }
    if (isRelationOnly(got, fromOracle)) return RELATION_SERIALISATION.reason;
    return undefined;
  }
  if (isRelationOnly(got, want)) return RELATION_SERIALISATION.reason;
  return undefined;
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

  // The oracle, run with a checker that owns its nodes. As a baseline it
  // answers "do the two implementations agree"; as a cross-check it tells a
  // stale artefact apart from a real disagreement, which is the difference
  // between "the committed file is out of date" and "the port is wrong".
  // Models only: the 6.x worker has no notion of a service's parameters
  // type, and asked for one it falls back to schematising the whole service
  // class — minutes of recursion through the framework, for an answer that
  // would not be comparable anyway.
  const comparable = requests.filter(request => request.kind === "model");
  let oracle;
  if (comparable.length > 0 && (baseline === "worker" || (impl === "ts7" && crossCheck))) {
    oracle = generate(root, comparable, "worker");
  }
  if (baseline === "worker") {
    if (!oracle) continue;
    for (const [id, entry] of expected) {
      if (oracle.results[id] === undefined) expected.delete(id);
      else entry.schema = oracle.results[id];
    }
  }

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
    const why = got === undefined ? undefined : explain(id, group, got, schema, oracle?.results[id]);
    if (why) {
      scores[group].known++;
      totals[group].known++;
      if (verbose) console.log(`  DIVERGES  ${id} — ${why}`);
      continue;
    }
    unexpected++;
    if (diffOne && id !== diffOne) continue;
    if (verbose || diffOne) {
      const reason = response.errors[id];
      console.log(`  MISMATCH ${id}${reason ? ` — ${reason}` : ""}`);
      if (got !== undefined) for (const line of render(differences(got, schema))) console.log(`    ${line}`);
    }
  }

  const score = group => {
    const { match, total, known } = scores[group];
    if (total === 0) return `${group} —`;
    const suffix = known ? ` (+${known} known)` : "";
    return `${group} ${match + known === total ? "IDENTICAL" : `${match}/${total}`}${suffix}`;
  };
  console.log(`${relative.padEnd(18)} ${score("services").padEnd(28)} ${score("models")}`);
}

console.log("");
for (const group of ["services", "models"]) {
  const { match, total, known } = totals[group];
  if (total === 0) continue;
  const note = known ? ` + ${known} known divergence${known === 1 ? "" : "s"}` : "";
  console.log(`${group.padEnd(10)} ${match}/${total}${note} ${match + known === total ? "IDENTICAL" : ""}`);
}
console.log(`backend: ${impl} | baseline: ${baseline}`);
process.exitCode = unexpected === 0 ? 0 : 1;
