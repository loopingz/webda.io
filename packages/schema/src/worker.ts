/**
 * Out-of-process schema generation.
 *
 * TypeScript 7 removed the emit transformers `@webda/compiler` is built on, so
 * the compiler is moving to 7.1. This generator is 2,200 lines of
 * type-to-JSON-Schema conversion resting on `objectFlags`, `elementFlags` and
 * `intrinsicName`; rewriting it against the 7.1 checker is a large change whose
 * mistakes surface as plausible-but-wrong JSON.
 *
 * Schemas are JSON, so the boundary can be a process instead. The compiler runs
 * on 7.1 and asks this worker — still on 6 — for schemas by name. The
 * conversion code is untouched, so the output is identical by construction
 * rather than by careful reimplementation.
 *
 * Requests name things rather than passing objects, which is possible because
 * the generator already rebuilds its own `Program` from a tsconfig path and
 * never used the caller's (see `generator.ts:261-266`).
 *
 * Protocol: one JSON request on stdin, one JSON response on stdout.
 *
 * ```
 * { "project": "/abs/path", "requests": [
 *     { "id": "Webda/User", "kind": "model", "file": "/abs/file.ts", "className": "User" }
 * ]}
 * → { "results": { "Webda/User": { "Input": {}, "Output": {}, "Stored": {} } },
 *     "errors": { } }
 * ```
 */
import ts from "typescript";
import type { JSONSchema7 } from "json-schema";
import { SchemaGenerator } from "./generator.js";

/** A single schema request. */
export interface SchemaRequest {
  /** Caller-chosen key, echoed in the response. */
  id: string;
  /** `model` yields Input/Output/Stored; `type` yields one schema. */
  kind: "model" | "type";
  /** Absolute path of the file declaring the class. */
  file: string;
  /** Class to generate for. */
  className: string;
}

/** A batch of requests against one project. */
export interface WorkerRequest {
  /** Project root or tsconfig path. */
  project: string;
  /** Requests to answer. */
  requests: SchemaRequest[];
}

/** Schemas for a model, matching `webda.module.json`'s `Schemas`. */
export interface ModelSchemas {
  Input: JSONSchema7;
  Output: JSONSchema7;
  Stored: JSONSchema7;
}

/** The worker's reply. */
export interface WorkerResponse {
  /** Successful results, keyed by request id. */
  results: Record<string, ModelSchemas | JSONSchema7>;
  /** Failures, keyed by request id. */
  errors: Record<string, string>;
}

/**
 * Find a class declaration by file and name.
 * @param program - the program to search
 * @param file - absolute file path
 * @param className - class name
 * @returns the declaration, when found
 */
function findClass(program: ts.Program, file: string, className: string): ts.ClassDeclaration | undefined {
  const sourceFile = program.getSourceFiles().find(candidate => candidate.fileName === file);
  if (!sourceFile) return undefined;
  let found: ts.ClassDeclaration | undefined;
  sourceFile.forEachChild(node => {
    if (found) return;
    if (ts.isClassDeclaration(node) && node.name?.escapedText.toString() === className) found = node;
  });
  return found;
}

/**
 * Generate a model's Input, Output and Stored schemas.
 *
 * Mirrors `ModuleGenerator.generateModelSchemas`: an explicit `toDto`,
 * `fromDto` or `toJSON` drives the corresponding schema from its signature,
 * otherwise the shape is derived from the class and tagged `$auto`. The
 * `$webda` marker records which of the two applied and is part of the
 * committed output, so it has to be reproduced exactly.
 * @param generator - the schema generator
 * @param checker - the type checker
 * @param node - the class declaration
 * @returns the three schemas
 */
export function generateModelSchemas(
  generator: SchemaGenerator,
  checker: ts.TypeChecker,
  node: ts.ClassDeclaration
): ModelSchemas {
  const result: ModelSchemas = { Input: {}, Output: {}, Stored: {} };
  const classType = checker.getTypeAtLocation(node);

  const signatureOf = (methodName: string): ts.Signature | undefined => {
    const apparent = checker.getApparentType(classType);
    const symbol = apparent.getProperty(methodName) || classType.getProperty(methodName);
    if (!symbol) return undefined;
    const methodType = checker.getTypeOfSymbolAtLocation(symbol, node);
    const signatures = checker.getSignaturesOfType(methodType, ts.SignatureKind.Call);
    return signatures.length ? signatures[0] : undefined;
  };

  const toDto = signatureOf("toDto");
  const fromDto = signatureOf("fromDto");
  const toJSON = signatureOf("toJSON");

  if (toDto) {
    const type = checker.getReturnTypeOfSignature(toDto);
    result.Output = generator.getSchemaFromType(type, { type: "dto-out", asRef: false });
    (result.Output as any).$webda = "toDto$return";
  } else {
    result.Output = generator.getSchemaFromNodes([node], { type: "dto-out", asRef: false });
    (result.Output as any).$webda = "toDto$auto";
  }

  if (fromDto) {
    const parameter = fromDto.parameters[0];
    const declaration = (parameter as any)?.valueDeclaration ?? parameter?.declarations?.[0];
    const type = declaration
      ? checker.getTypeAtLocation(declaration)
      : checker.getTypeOfSymbolAtLocation(parameter, node);
    result.Input = generator.getSchemaFromType(type, { type: "dto-in", asRef: false });
    (result.Input as any).$webda = "fromDto$param";
  } else {
    result.Input = generator.getSchemaFromNodes([node], { type: "dto-in", asRef: false });
    (result.Input as any).$webda = "fromDto$auto";
  }

  if (toJSON) {
    const type = checker.getReturnTypeOfSignature(toJSON);
    result.Stored = generator.getSchemaFromType(type, { type: "output", asRef: false });
    (result.Stored as any).$webda = "toJSON$return";
  } else {
    result.Stored = generator.getSchemaFromNodes([node], { type: "output", asRef: false });
    (result.Stored as any).$webda = "toJSON$auto";
  }

  return result;
}

/**
 * Answer a batch of requests.
 *
 * One generator, and therefore one `Program`, is built per batch — the caller
 * batches precisely so that cost is paid once.
 * @param request - the batch
 * @returns results and per-request errors
 */
export function handle(request: WorkerRequest): WorkerResponse {
  const response: WorkerResponse = { results: {}, errors: {} };
  const generator = new SchemaGenerator({ project: request.project });
  const program = generator.getProgram();
  const checker = program.getTypeChecker();

  for (const item of request.requests) {
    try {
      const node = findClass(program, item.file, item.className);
      if (!node) {
        response.errors[item.id] = `class ${item.className} not found in ${item.file}`;
        continue;
      }
      response.results[item.id] =
        item.kind === "model"
          ? generateModelSchemas(generator, checker, node)
          : generator.getSchemaFromNodes([node], { asRef: false });
    } catch (error: any) {
      response.errors[item.id] = String(error?.message ?? error);
    }
  }

  return response;
}

/**
 * Read one request from stdin and write one response to stdout.
 * @returns promise resolving when the response is written
 */
export async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const request: WorkerRequest = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  process.stdout.write(JSON.stringify(handle(request)));
}
