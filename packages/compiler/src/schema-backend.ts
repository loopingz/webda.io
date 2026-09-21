/**
 * Optional TypeScript 7 backend for schema generation.
 *
 * `@webda/compiler` runs on TypeScript 6 and `@webda/content-mapper` on 7.1;
 * a package can declare only one `typescript`, so the two cannot be linked.
 * They can still cooperate across a process boundary — the port is driven as
 * a subprocess, exactly as `@webda/content-mapper` itself drives `tsgo`.
 *
 * This is the transition described in `docs/contribute/TypeScript 7 Content
 * Mappers.md`: without it the port stays unused until the atomic switch, and
 * the committed `webda.module.json` files cannot be regenerated through a
 * real `webdac build`.
 *
 * **Opt-in, and off by default.** Set `WEBDA_SCHEMA_BACKEND=ts7`. The
 * TypeScript 6 path is untouched otherwise, so enabling it is a one-variable
 * experiment rather than a migration.
 *
 * Verified equivalent per schema by
 * `packages/content-mapper/tools/schema-diff.mjs`, which scores both
 * implementations against the committed artefacts. What this adds is the
 * integration the harness cannot see: that the names the compiler discovers
 * and the names the port produces are the same names.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { JSONSchema7 } from "json-schema";
import { useLog } from "@webda/workout";

/** The three views of a model. */
export interface ModelSchemas {
  Input: JSONSchema7;
  Output: JSONSchema7;
  Stored: JSONSchema7;
}

/** A class the backend should generate for. */
export interface SchemaTarget {
  /** Key the result is returned under. */
  name: string;
  /** Absolute path of the declaring file. */
  fileName: string;
  /** Exported class name. */
  className: string;
}

/** Everything one build needs, answered in a single round trip. */
export interface SchemaBatch {
  /** Modda and bean parameter schemas, by module name. */
  services: Record<string, JSONSchema7>;
  /** Model Input/Output/Stored, by module name. */
  models: Record<string, ModelSchemas>;
  /** The whole top-level `schemas` map, discovered by the port itself. */
  topLevel: Record<string, JSONSchema7>;
}

/**
 * Whether the TypeScript 7 backend was asked for.
 * @returns true when `WEBDA_SCHEMA_BACKEND=ts7`
 */
export function useTypeScript7Schemas(): boolean {
  return process.env.WEBDA_SCHEMA_BACKEND === "ts7";
}

/**
 * Locate the content mapper's schema worker.
 *
 * Resolved rather than imported, and deliberately not a declared dependency:
 * `@webda/content-mapper` peers on `typescript@>=7.1.0-dev`, which would
 * conflict with the compiler's own TypeScript 6 the moment a package manager
 * tried to satisfy it. Spawning sidesteps the question entirely.
 * @param projectRoot - application root, searched first
 * @returns absolute path of the worker entry point
 * @throws when the package is not installed
 */
function resolveWorker(projectRoot: string): string {
  // Explicit override, for exercising the port across a monorepo without
  // adding the package to every application first.
  const override = process.env.WEBDA_SCHEMA_WORKER;
  if (override) {
    if (!existsSync(override)) throw new Error(`WEBDA_SCHEMA_WORKER does not exist: ${override}`);
    return override;
  }

  const bases = [projectRoot, dirname(new URL(import.meta.url).pathname)];
  for (const base of bases) {
    try {
      const require_ = createRequire(join(base, "index.js"));
      const manifest = require_.resolve("@webda/content-mapper/package.json");
      const worker = join(dirname(manifest), "lib", "schema", "worker-cli.js");
      if (existsSync(worker)) return worker;
    } catch {
      // Try the next base.
    }
  }
  throw new Error(
    "WEBDA_SCHEMA_BACKEND=ts7 requires @webda/content-mapper to be installed and built " +
      "(lib/schema/worker-cli.js). Install it in the application, point WEBDA_SCHEMA_WORKER " +
      "at the worker, or unset WEBDA_SCHEMA_BACKEND."
  );
}

/**
 * Generate every schema a build needs through the TypeScript 7 port.
 *
 * One spawn per build: the worker opens its own program, which is the
 * expensive part, so the caller batches rather than asking per class.
 * @param projectRoot - application root, used as cwd and project path
 * @param services - moddas and beans
 * @param models - models
 * @returns the generated schemas
 * @throws when the worker cannot be run, or reports an error
 */
export function generateSchemasWithTypeScript7(
  projectRoot: string,
  services: SchemaTarget[],
  models: SchemaTarget[]
): SchemaBatch {
  const worker = resolveWorker(projectRoot);
  const requests = [
    ...services.map(target => ({
      id: `service:${target.name}`,
      kind: "service",
      file: target.fileName,
      className: target.className,
      addOpenApi: true
    })),
    ...models.map(target => ({
      id: `model:${target.name}`,
      kind: "model",
      file: target.fileName,
      className: target.className
    })),
    { id: "topLevel", kind: "topLevel" }
  ];

  const started = Date.now();
  const run = spawnSync(process.execPath, [worker], {
    cwd: projectRoot,
    input: JSON.stringify({ project: projectRoot, requests }),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024
  });
  if (run.status !== 0) {
    throw new Error(`TypeScript 7 schema worker failed (${run.status}): ${(run.stderr || "").trim().slice(0, 2000)}`);
  }

  const response = JSON.parse(run.stdout);
  useLog("INFO", `TypeScript 7 schemas: ${requests.length} requests in ${Date.now() - started}ms`);

  // The converter refuses rather than degrading, so an error here means a
  // type it will not guess at. Surfacing it is the whole point; swallowing
  // it would put a silently wrong contract into the module.
  const errors = Object.entries(response.errors ?? {});
  if (errors.length > 0) {
    throw new Error(
      `TypeScript 7 schema generation failed for ${errors.length} target(s):\n` +
        errors.map(([id, message]) => `  ${id}: ${message}`).join("\n")
    );
  }

  const batch: SchemaBatch = { services: {}, models: {}, topLevel: response.results.topLevel ?? {} };
  for (const target of services) batch.services[target.name] = response.results[`service:${target.name}`];
  for (const target of models) batch.models[target.name] = response.results[`model:${target.name}`];
  return batch;
}
