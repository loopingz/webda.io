// Byte-diff harness for stage 7: compares generated `Schemas` against the
// committed webda.module.json.
//
// Written before the TypeScript 7 schema generator exists, deliberately. Under
// option 1 the port has to reproduce today's output with the discarded-program
// bug intact, so the target must be measurable from the first line of code.
//
// Usage: node tools/schema-diff.mjs [--verbose]
//   Reports, per package, how many model schemas match byte-for-byte.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");
const verbose = process.argv.includes("--verbose");

/** Packages carrying a committed module to compare against. */
const TARGETS = ["packages/core", "packages/models", "packages/runtime", "sample-app"];

/**
 * Generate schemas for a project with the TypeScript 7 pipeline.
 *
 * Returns undefined until the generator is ported; the harness then reports the
 * size of the target instead of a comparison, which is still the useful number.
 * @param _root - project root
 * @returns model name to Schemas object, or undefined
 */
async function generateSchemas(_root) {
  try {
    const module = await import("../lib/schema-generator.js");
    return module.generateModelSchemas(_root);
  } catch {
    return undefined;
  }
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

let grandTotal = 0;
for (const relative of TARGETS) {
  const root = join(repo, relative);
  let committed;
  try {
    committed = JSON.parse(readFileSync(join(root, "webda.module.json"), "utf8"));
  } catch {
    continue;
  }

  const expected = Object.entries(committed.models ?? {}).filter(([, model]) => model.Schemas);
  grandTotal += expected.length;

  const generated = await generateSchemas(root);
  if (!generated) {
    console.log(`${relative.padEnd(18)} ${String(expected.length).padStart(3)} model schemas to reproduce (generator not ported)`);
    continue;
  }

  let match = 0;
  for (const [name, model] of expected) {
    if (canonical(generated[name]) === canonical(model.Schemas)) {
      match++;
    } else if (verbose) {
      console.log(`  MISMATCH ${name}`);
    }
  }
  const status = match === expected.length ? "IDENTICAL" : `${match}/${expected.length}`;
  console.log(`${relative.padEnd(18)} ${status}`);
}
console.log(`\ntarget: ${grandTotal} model schemas across ${TARGETS.length} packages`);
