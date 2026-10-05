/**
 * Out-of-process schema generation on the TypeScript 7.1 checker.
 *
 * `@webda/compiler` drives this as a subprocess rather than importing it.
 * That is not indirection for its own sake: the compiler still runs on
 * TypeScript 6 and this package needs 7.1, a package can declare only one
 * `typescript`, and a process boundary is the only thing that lets the two
 * coexist until the atomic switch.
 *
 * It began as a way to diff against `@webda/schema`, which generated these
 * schemas before and has since been deleted; the protocol shape is
 * unchanged from that comparison, which is why it names things rather than
 * passing them.
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
 *
 * `{ "id": "m", "kind": "module" }` answers with
 * `{ module, namingViolations, errors }` — see `../module.ts`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { formatDiagnostics } from "typescript/unstable/sync";
import { runTwoPass } from "../twopass.ts";
import { ModifierFlags } from "typescript/unstable/ast";
import type { ClassDeclaration } from "typescript/unstable/ast";
import * as is from "typescript/unstable/ast/is";
import { openSession } from "../context.ts";
import { generateWebdaModule } from "../module.ts";
import { generateModelSchemas } from "./model.ts";
import { generateTopLevelSchemas, namespaceOf } from "./project.ts";
import { generateServiceSchema } from "./service.ts";
import type { JSONSchema7 } from "./types.ts";

/** A single schema request. */
export interface SchemaRequest {
  /** Caller-chosen key, echoed in the response. */
  id: string;
  /**
   * What to generate. `topLevel` needs no class and answers with a map;
   * `module` needs no class and answers with the whole `webda.module.json`
   * as `{ module, namingViolations, errors }`.
   */
  kind: "service" | "model" | "topLevel" | "module" | "emit";
  /** Absolute path of the file declaring the class. */
  file: string;
  /** Class to generate for. */
  className: string;
  /** Add the free-form `openapi` property; moddas and beans only. */
  addOpenApi?: boolean;
  /** Base type the parameters derive from; `DeployerResources` for deployers. */
  parametersBase?: string;
  /** Source root, for a `topLevel` or `module` request. */
  rootDir?: string;
  /** Output root, for a `topLevel` or `module` request. */
  outDir?: string;
  /** Namespace prefix, for a `topLevel` or `module` request. */
  namespace?: string;
  /** Top-level `capabilities`, for a `module` request; defaults to package.json `webda.capabilities`. */
  capabilities?: Record<string, string>;
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
        if (item.kind === "topLevel") {
          // Answers with the whole map: these entries record no provenance,
          // so the caller cannot name them one at a time.
          response.results[item.id] = generateTopLevelSchemas(session.ctx, {
            appPath: request.project,
            rootDir: item.rootDir ?? join(request.project, "src"),
            outDir: item.outDir ?? join(request.project, "lib"),
            namespace: item.namespace ?? namespaceOf(request.project)
          }) as unknown as JSONSchema7;
          continue;
        }
        if (item.kind === "emit") {
          response.results[item.id] = emitProject(configFile, item.rootDir ?? join(request.project, "src")) as never;
          continue;
        }
        if (item.kind === "module") {
          // The whole module in one answer; naming violations and errors
          // travel with it so the caller decides how to report them.
          response.results[item.id] = generateWebdaModule(session.ctx, {
            appPath: request.project,
            rootDir: item.rootDir ?? join(request.project, "src"),
            outDir: item.outDir ?? join(request.project, "lib"),
            namespace: item.namespace ?? namespaceOf(request.project),
            capabilities: item.capabilities
          }) as unknown as JSONSchema7;
          continue;
        }
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
          // The declaration's own name, not the requested one: a default
          // export is requested as `"default"` but titled after the class.
          title: declaration.name?.text ?? item.className
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

/** What an `emit` request reports. */
export interface EmitReport {
  /** Pass-2 diagnostics, formatted as `tsc` would print them. */
  diagnostics: string;
  /** Number of diagnostics; nothing is written unless it is zero. */
  diagnosticCount: number;
  /** Files written. */
  written: number;
  /** Edits per generator, for the build log. */
  editCounts: Record<string, number>;
}

/**
 * Build a project through the two-pass tsgo pipeline and write its output.
 *
 * Replaces `tsProgram.emit` with the four `@webda/ts-plugin` transformers.
 * Pass 1 plans the generated code over the authored sources; pass 2 type-
 * checks and emits the rewritten text, so what ships is exactly what was
 * checked. If pass 2 reports anything, nothing is written — the old emit
 * wrote files even when `getPreEmitDiagnostics` failed.
 * @param configFile - absolute tsconfig path
 * @param rootDir - source root
 * @returns diagnostics and what was written
 */
export function emitProject(configFile: string, rootDir: string): EmitReport {
  const result = runTwoPass({ configFile, rootDir, emit: true });
  const conflicts = result.conflicts.map(c => `${c.fileName}: overlapping edits from ${c.a.source} and ${c.b.source}`);
  const diagnostics =
    formatDiagnostics(result.diagnostics, {
      getCanonicalFileName: name => name,
      getCurrentDirectory: () => dirname(configFile),
      getNewLine: () => "\n"
    }) + conflicts.join("\n");
  const diagnosticCount = result.diagnostics.length + conflicts.length;
  let written = 0;
  if (diagnosticCount === 0) {
    for (const [path, text] of result.emitted) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
      written++;
    }
  }
  return { diagnostics, diagnosticCount, written, editCounts: result.editCounts };
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
