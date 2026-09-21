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
const impl = flag("impl", "ts7");
const only = flag("only", "all");
const diffOne = flag("diff", undefined);
const baseline = flag("baseline", "committed");
const crossCheck = !argv.includes("--no-cross-check");

/**
 * Every directory carrying a committed module and a tsconfig to open.
 *
 * Discovered rather than listed: the port has to hold across the whole
 * monorepo before `@webda/schema` can go, and a hand-maintained list is
 * exactly where a package quietly stops being checked. `--targets=` narrows
 * it while iterating.
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

/**
 * A service whose parameters type the 6.x pipeline failed to resolve.
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
const UNRESOLVED_PARAMETERS = {
  reason: "ServiceParameters unresolved across @webda/schema's discarded program",
  /**
   * Whether a service mismatch is the defect described above.
   *
   * Shape-checked rather than listed by id: an id list was already wrong
   * once, missing `WebdaSample/Publisher` and `WebdaSample/TestBean` as soon
   * as the harness grew past four packages.
   *
   * The invariant on the reference side is that it is **missing the `type`
   * property every `ServiceParameters` subclass inherits** — that property
   * is the thing the failed resolution cost it. Two shapes follow from how
   * far the failure got:
   *
   * - no object body at all, when the parameters node itself was the error
   *   type;
   * - a body with the class's own members but nothing inherited.
   *
   * The second still has to account for everything else that differs, so it
   * is re-checked through the generic walk.
   * @param got - what the port generated
   * @param want - what is committed
   * @returns true when the mismatch is fully accounted for
   */
  matches(got, want) {
    if (got.properties?.type?.type !== "string") return false;
    if (want.properties?.type !== undefined) return false;

    // No body: the reference carries nothing but the injected `openapi`.
    if (want.type === undefined) {
      return Object.keys(want.properties ?? { openapi: 1 }).join(",") === "openapi";
    }

    // Body, but nothing inherited. Remove what the port gained and require
    // the remainder to match or be independently explained.
    const stripped = { ...got, properties: { ...got.properties } };
    delete stripped.properties.type;
    const required = (stripped.required ?? []).filter(name => name !== "type");
    if (required.length > 0) stripped.required = required;
    else delete stripped.required;

    return canonical(stripped) === canonical(want) || isKnownDivergence(stripped, want) !== undefined;
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
  if (only === "all" || only === "top") {
    // One request, one answer: these entries record no provenance, so the
    // port has to rediscover them rather than be told what to generate.
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
 * A 6.x generic that never resolved, which converts to the empty schema.
 *
 * `OperationContext<P, U>` declares `parameters: U`; 6.x leaves `U`
 * unsubstituted, hits its type-parameter branch and emits `{}` — no
 * constraint at all. 7.1 substitutes it and emits the real shape.
 *
 * Accepting this is safe in one direction only, and that is the reason it is
 * accepted: the reference said "anything", so the port can only be narrowing
 * a contract that validated everything. It can never be the port loosening
 * one, which is the failure that would matter.
 */
const GENERIC_SUBSTITUTION = {
  reason: "6.x left a generic unsubstituted and emitted `{}`; 7.1 resolves it",
  /**
   * Whether one difference is an unconstrained reference schema made concrete.
   * @param got - the port's schema
   * @param want - the reference schema
   * @returns true when the reference constrained nothing and the port does
   */
  matches(got, want) {
    if (!want || typeof want !== "object" || Object.keys(want).length !== 0) return false;
    // `got` may also be absent: 7.1 can resolve the attribute well enough to
    // know it does not belong in the schema at all — a relation collection
    // in an Input schema, say. Either way the reference constrained nothing,
    // so nothing it expressed can have been lost.
    return true;
  }
};

/**
 * `anyOf` members reordered, with the same set on both sides.
 *
 * Union constituents are ordered by type id, and for *literals* that is
 * recoverable from the syntax (see the converter's `unionOrder`). For object
 * types drawn from library declarations it is not: 6.x ordered them by when
 * each type happened to be created across the whole program, which is not a
 * property of the source. `ConnectionOptions.ALPNProtocols` — `string[] |
 * NodeJS.ArrayBufferView` from `@types/node` — puts `Uint8Array` ahead of
 * `string[]` for no reason visible in the declaration.
 *
 * Accepted because `anyOf` is an unordered set: both documents validate
 * exactly the same payloads. The member set is compared, so a member
 * appearing or disappearing is still a failure.
 *
 * Deliberately **not** extended to `enum`. Enum order is reproducible, it is
 * visible in anything generated from these schemas, and it took real work to
 * get right — an escape hatch there would quietly undo it.
 */
const ANYOF_ORDER = {
  reason: "anyOf members reordered; 6.x ordered library object types by global type-id allocation",
  /**
   * Whether two `anyOf` arrays are permutations of each other.
   * @param got - the port's members
   * @param want - the reference members
   * @returns true when the sets are equal but the order differs
   */
  matches(got, want) {
    if (!Array.isArray(got) || !Array.isArray(want) || got.length !== want.length) return false;
    const sort = members => members.map(canonical).sort().join("\u0000");
    return sort(got) === sort(want);
  }
};

/**
 * Whether every difference between two schema documents is a known kind.
 *
 * Walks both trees together rather than diffing leaves, because one
 * correction moves several leaves at once: a relation property becomes
 * `type: "string"`, whatever described it before disappears, and a
 * definition that existed only to hold it is no longer emitted. Judging
 * leaves individually cannot tell that apart from three unrelated changes.
 * @param got - the port's document
 * @param want - the reference document
 * @param reasons - accumulator for the kinds encountered
 * @returns true when nothing unexplained differs
 */
function isKnownDivergence(got, want, reasons = new Set()) {
  const ok = walkSchemas(got, want, want, reasons);
  return ok && reasons.size > 0 ? [...reasons] : undefined;
}

/**
 * Recursive half of {@link isKnownDivergence}.
 * @param got - the port's node
 * @param want - the reference node
 * @param scope - nearest enclosing reference node carrying `definitions`
 * @param reasons - accumulator
 * @returns true when this subtree is fully explained
 */
function walkSchemas(got, want, scope, reasons) {
  if (canonical(got) === canonical(want)) return true;

  const plain = value => value && typeof value === "object" && !Array.isArray(value);
  if (!plain(got) || !plain(want)) return false;

  const definitions = want.definitions ?? scope?.definitions;
  const nextScope = want.definitions ? want : scope;

  // `properties` first: `required` is judged against what it explained away.
  const dropped = new Set();
  const keys = [...new Set([...Object.keys(got), ...Object.keys(want)])].sort(
    (a, b) => (a === "properties" ? -1 : 0) - (b === "properties" ? -1 : 0)
  );
  for (const key of keys) {
    const mine = got[key];
    const theirs = want[key];
    if (canonical(mine) === canonical(theirs)) continue;

    if (key === "properties" && (plain(mine) || mine === undefined) && (plain(theirs) || theirs === undefined)) {
      // One side may have no `properties` at all, when every property it
      // held was explained away.
      const ours = mine ?? {};
      const reference = theirs ?? {};
      for (const name of new Set([...Object.keys(ours), ...Object.keys(reference)])) {
        if (canonical(ours[name]) === canonical(reference[name])) continue;
        if (RELATION_SERIALISATION.matches(ours[name], reference[name], definitions)) {
          reasons.add(RELATION_SERIALISATION.reason);
          continue;
        }
        if (GENERIC_SUBSTITUTION.matches(ours[name], reference[name])) {
          reasons.add(GENERIC_SUBSTITUTION.reason);
          if (ours[name] === undefined) dropped.add(name);
          continue;
        }
        if (!walkSchemas(ours[name], reference[name], nextScope, reasons)) return false;
      }
      continue;
    }

    if (key === "anyOf" && ANYOF_ORDER.matches(mine, theirs)) {
      reasons.add(ANYOF_ORDER.reason);
      continue;
    }

    if (key === "required") {
      // A property explained away above takes its `required` entry with it.
      // Anything else changing here is a real change to what must be sent.
      const lost = (theirs ?? []).filter(name => !(mine ?? []).includes(name));
      const gained = (mine ?? []).filter(name => !(theirs ?? []).includes(name));
      if (gained.length > 0 || lost.some(name => !dropped.has(name))) return false;
      continue;
    }

    if (key === "definitions") {
      // A definition may appear or disappear as collateral of a corrected
      // property; one that changes shape on both sides is something else.
      for (const name of new Set([...Object.keys(mine ?? {}), ...Object.keys(theirs ?? {})])) {
        const a = mine?.[name];
        const b = theirs?.[name];
        if (canonical(a) === canonical(b)) continue;
        if (a === undefined || b === undefined) continue;
        if (!walkSchemas(a, b, nextScope, reasons)) return false;
      }
      continue;
    }

    if (!walkSchemas(mine, theirs, nextScope, reasons)) return false;
  }
  return true;
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
    return group === "services" ? undefined : (isKnownDivergence(got, want) ?? []).join("; ") || undefined;
  }
  if (impl !== "ts7") return undefined;
  if (UNRESOLVED_PARAMETERS.matches(got, want)) return UNRESOLVED_PARAMETERS.reason;

  // Diff against the oracle where one is available, not the artefact: that
  // separates "the committed file is stale" from "the port disagrees with
  // the oracle", and a schema can be both at once — a stale artefact *and*
  // carry a correction. The oracle only answers for models.
  if (fromOracle !== undefined && canonical(got) === canonical(fromOracle)) {
    return "committed artefact is stale; the port and the TypeScript 6 oracle agree";
  }
  const reasons = isKnownDivergence(got, fromOracle ?? want);
  return reasons ? reasons.join("; ") : undefined;
}

const blank = () => ({ match: 0, total: 0, known: 0 });
const totals = { services: blank(), models: blank(), top: blank() };
let unexpected = 0;
const stale = [];
const uninstalled = [];

for (const relative of TARGETS) {
  const root = join(repo, relative);
  let committed;
  try {
    committed = JSON.parse(readFileSync(join(root, "webda.module.json"), "utf8"));
  } catch {
    continue;
  }

  // Eleven committed modules predate the current generator: their `moddas`
  // are bare import strings and they carry no `$schema`. They were never
  // produced by the pipeline being replaced, so diffing against them
  // measures how stale they are, not whether the port is right.
  if (committed.$schema === undefined) {
    stale.push(relative);
    continue;
  }

  // Compiler test fixtures carry a committed module but no installed
  // dependencies, so `@webda/core` cannot resolve and no class can be
  // classified. They are regenerated inside the compiler's own tests, which
  // set up resolution differently; from here they measure the fixture's
  // environment rather than the port.
  if (!existsSync(join(root, "node_modules"))) {
    uninstalled.push(relative);
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

  const scores = { services: blank(), models: blank(), top: blank() };
  const produced = response.results[TOP_LEVEL_ID];
  if (produced && (only === "all" || only === "top")) {
    // Keys the port invents are as wrong as keys it misses, and only this
    // direction catches them.
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
    const why = got === undefined ? undefined : explain(id, group, got, schema, oracle?.results[id]);
    if (why) {
      scores[group].known++;
      totals[group].known++;
      if (verbose) console.log(`  DIVERGES  ${id} — ${why}`);
      continue;
    }
    unexpected++;
    if (diffOne && (member ?? id) !== diffOne) continue;
    if (verbose || diffOne) {
      const reason = response.errors[member === undefined ? id : TOP_LEVEL_ID];
      console.log(`  MISMATCH ${member ?? id}${reason ? ` — ${reason}` : ""}`);
      if (got !== undefined) for (const line of render(differences(got, schema))) console.log(`    ${line}`);
    }
  }

  const score = group => {
    const { match, total, known } = scores[group];
    if (total === 0) return `${group} —`;
    const suffix = known ? ` (+${known} known)` : "";
    return `${group} ${match + known === total ? "IDENTICAL" : `${match}/${total}`}${suffix}`;
  };
  console.log(`${relative.padEnd(18)} ${score("services").padEnd(28)} ${score("models").padEnd(26)} ${score("top")}`);
}

console.log("");
for (const group of ["services", "models", "top"]) {
  const { match, total, known } = totals[group];
  if (total === 0) continue;
  const note = known ? ` + ${known} known divergence${known === 1 ? "" : "s"}` : "";
  console.log(`${group.padEnd(10)} ${match}/${total}${note} ${match + known === total ? "IDENTICAL" : ""}`);
}
if (uninstalled.length > 0) {
  console.log(`skipped ${uninstalled.length} projects with no installed dependencies: ${uninstalled.join(", ")}`);
}
if (stale.length > 0) {
  console.log(`\nskipped ${stale.length} pre-format modules (no $schema, string moddas): ${stale.join(", ")}`);
}
console.log(`backend: ${impl} | baseline: ${baseline}`);
process.exitCode = unexpected === 0 ? 0 : 1;
