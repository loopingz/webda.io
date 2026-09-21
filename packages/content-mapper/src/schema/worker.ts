/**
 * Out-of-process schema generation on the TypeScript 7.1 checker.
 *
 * Deliberately protocol-compatible with `packages/schema/src/worker.ts`, the
 * TypeScript 6 generator this replaces. That worker is the oracle for stage 7:
 * `tools/schema-diff.mjs` drives either implementation over the same requests
 * and diffs both against the committed `webda.module.json`, so a regression is
 * visible as a score rather than as a surprise later. It is deleted once this
 * one reaches parity.
 *
 * A process boundary is also what lets the two coexist: `@webda/schema` needs
 * TypeScript 6 and this package needs 7.1, and a package can declare only one.
 *
 * Protocol: one JSON request on stdin, one JSON response on stdout.
 *
 * ```
 * { "project": "/abs/path", "requests": [
 *     { "id": "Webda/Store", "kind": "service", "file": "/abs/f.ts",
 *       "className": "Store", "addOpenApi": true }
 * ]}
 * -> { "results": { "Webda/Store": { } }, "errors": { } }
 * ```
 */
import { join } from "node:path";
import { ModifierFlags } from "typescript/unstable/ast";
import type { ClassDeclaration } from "typescript/unstable/ast";
import * as is from "typescript/unstable/ast/is";
import { openSession } from "../context.ts";
import { generateModelSchemas } from "./model.ts";
import { generateServiceSchema } from "./service.ts";
import type { JSONSchema7 } from "./types.ts";

/** A single schema request. */
export interface SchemaRequest {
  /** Caller-chosen key, echoed in the response. */
  id: string;
  /** What to generate. */
  kind: "service" | "model";
  /** Absolute path of the file declaring the class. */
  file: string;
  /** Class to generate for. */
  className: string;
  /** Add the free-form `openapi` property; moddas and beans only. */
  addOpenApi?: boolean;
  /** Base type the parameters derive from; `DeployerResources` for deployers. */
  parametersBase?: string;
}

/** A batch of requests against one project. */
export interface WorkerRequest {
  /** Project root, or an explicit tsconfig path. */
  project: string;
  /** Requests to answer. */
  requests: SchemaRequest[];
}

/** The worker's reply. */
export interface WorkerResponse {
  /** Successful results, keyed by request id. */
  results: Record<string, JSONSchema7>;
  /** Failures, keyed by request id. */
  errors: Record<string, string>;
}

/**
 * Answer a batch of requests.
 *
 * One session, and therefore one `Program`, is built per batch — the caller
 * batches precisely so that cost is paid once.
 * @param request - the batch
 * @returns results and per-request errors
 */
export function handle(request: WorkerRequest): WorkerResponse {
  const response: WorkerResponse = { results: {}, errors: {} };
  const configFile = request.project.endsWith(".json") ? request.project : join(request.project, "tsconfig.json");
  const session = openSession(configFile, request.project);

  try {
    for (const item of request.requests) {
      try {
        const declaration = findClass(session.ctx.program, item.file, item.className);
        if (!declaration) {
          response.errors[item.id] = `class ${item.className} not found in ${item.file}`;
          continue;
        }
        if (item.kind === "model") {
          response.results[item.id] = generateModelSchemas(declaration, {
            project: session.ctx.project,
            checker: session.ctx.checker
          }) as unknown as JSONSchema7;
          continue;
        }
        const schema = generateServiceSchema(declaration, {
          project: session.ctx.project,
          checker: session.ctx.checker,
          addOpenApi: item.addOpenApi,
          parametersBase: item.parametersBase,
          title: item.className
        });
        if (!schema) {
          response.errors[item.id] = `no parameters type found on ${item.className}`;
          continue;
        }
        response.results[item.id] = schema;
      } catch (error) {
        // Per-request isolation, so one unconvertible type does not hide the
        // rest of the batch. The converter still refuses to emit for it.
        response.errors[item.id] = error instanceof Error ? error.message : String(error);
      }
    }
  } finally {
    session.dispose();
  }
  return response;
}

/** The slice of `Program` needed to look a class up. */
interface SourceFileLookup {
  /**
   * Fetch a parsed file.
   * @param name - absolute file path
   * @returns the source file, when the program owns it
   */
  getSourceFile(name: string): unknown;
}

/**
 * Find a class declaration by file and name.
 * @param program - the program to search
 * @param file - absolute file path
 * @param className - class name
 * @returns the declaration, when found
 */
function findClass(program: SourceFileLookup, file: string, className: string): ClassDeclaration | undefined {
  const sourceFile = program.getSourceFile(file) as { statements: readonly unknown[] } | undefined;
  if (!sourceFile) return undefined;
  for (const statement of sourceFile.statements) {
    const node = statement as ClassDeclaration;
    if (!is.isClassDeclaration(node)) continue;
    if (node.name?.text === className) return node;
    // `webda.module.json` records a default export as `:default`, so there is
    // no name to match on — the modifier is the only handle.
    if (className === "default" && (node.modifierFlags & ModifierFlags.Default) !== 0) return node;
  }
  return undefined;
}

/**
 * Read one request from stdin and write one response to stdout.
 * @returns a promise resolving when the response is written
 */
export async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const request: WorkerRequest = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  process.stdout.write(JSON.stringify(handle(request)));
}
