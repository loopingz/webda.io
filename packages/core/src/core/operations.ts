import { QueryValidator } from "@webda/ql";
import {
  OperationDefinition,
  OperationDefinitionInfo,
  OperationStreaming,
  type OperationSubject,
  type DryRunResult
} from "./icore.js";
import { OperationContext } from "../contexts/operationcontext.js";
import * as WebdaError from "../errors/errors.js";
import { validateSchema, ValidationError } from "../schemas/hooks.js";
import { useInstanceStorage } from "./instancestorage.js";
import { useApplication, useModel, useParameters } from "../application/hooks.js";
import { useDynamicService, useModelMetadata, useService } from "./hooks.js";
import { emitCoreEvent } from "../events/events.js";
import { isGeneratorFunction } from "node:util/types";
import { AnyMethod } from "@webda/decorators";
import type { Service } from "../services/service.js";
import type { Model } from "@webda/models";
import { runWithContext, useContext } from "../contexts/execution.js";
import { checkStaticModelPermission, loadModelForAction } from "../models/permissions.js";

type OperationTarget = Service | Model | typeof Service | typeof Model;
import { useLog } from "@webda/workout";

/**
 * Check if an operation can be executed with the current context
 * Not checking the input use `checkOperation` instead to check everything
 * @param context - the execution context
 * @param operationId - the operation identifier
 * @throws OperationError if operation is unknown
 * @param operation - the operation definition
 * @returns true if operation can be executed
 */
export function checkOperationPermission(
  context: OperationContext,
  operationId: string,
  operation: OperationDefinition & { permissionQuery?: QueryValidator } = useInstanceStorage().operations[operationId]
): boolean {
  if (!operation) {
    throw new WebdaError.NotFound(`${operationId} Unknown`);
  }
  if (operation.permission) {
    operation.permissionQuery ??= new QueryValidator(operation.permission);
    return operation.permissionQuery.eval(context.getSession());
  }
  return true;
}

/**
 * An awaited check run on every operation call, after input validation and before `Webda.BeforeOperation`
 *
 * Return `true` to allow; anything else refuses (the reason is logged, never sent to the client). Throwing a
 * `WebdaError.HttpError` propagates it; any other error is a refusal.
 *
 * In probe mode (`probe: true`, `input` undefined) the question is "could the caller call the operation with some
 * input?", used to list operations.
 */
export type OperationAuthorizer = (
  context: OperationContext,
  operationId: string,
  operation: OperationDefinition,
  options: { input?: any; probe: boolean }
) => Promise<true | string | false>;

/**
 * @returns the authorizers of the current instance
 */
function useAuthorizers(): Set<OperationAuthorizer> {
  const storage = useInstanceStorage();
  storage.operationAuthorizers ??= new Set();
  return storage.operationAuthorizers as Set<OperationAuthorizer>;
}

/**
 * Register an operation authorizer
 * @param fn - the authorizer
 */
export function registerOperationAuthorizer(fn: OperationAuthorizer): void {
  useAuthorizers().add(fn);
}

/**
 * Unregister an operation authorizer
 * @param fn - the authorizer
 */
export function unregisterOperationAuthorizer(fn: OperationAuthorizer): void {
  useAuthorizers().delete(fn);
}

/**
 * @returns the registered operation authorizers
 */
export function listOperationAuthorizers(): OperationAuthorizer[] {
  return [...useAuthorizers()];
}

/**
 * Run every authorizer; the first refusal wins
 * @param context - the execution context
 * @param operationId - the operation identifier
 * @param operation - the operation definition
 * @param options - input and probe mode
 * @param options.input - the operation input
 * @param options.probe - true to ask whether some input could be allowed
 * @returns true when every authorizer allows, otherwise the refusal reason
 * @throws WebdaError.HttpError thrown by an authorizer
 */
async function runAuthorizers(
  context: OperationContext,
  operationId: string,
  operation: OperationDefinition,
  options: { input?: any; probe: boolean }
): Promise<true | string> {
  for (const authorizer of useAuthorizers()) {
    let allowed: true | string | false;
    try {
      allowed = await authorizer(context, operationId, operation, options);
    } catch (err) {
      if (err instanceof WebdaError.HttpError) {
        throw err;
      }
      useLog("WARN", `Operation authorizer failed on ${operationId}`, err);
      return err?.message ?? "authorizer error";
    }
    if (allowed !== true) {
      return typeof allowed === "string" ? allowed : "refused";
    }
  }
  return true;
}

/**
 * Check whether the context is allowed to call an operation: the session `permission` then the authorizers
 *
 * Unlike {@link checkOperation}, this never throws: unknown operations, refusals and errors return false.
 *
 * Without `options` the authorizers are asked in probe mode ("could the caller call it with some input?"), for
 * listings. With `options`, they decide on `options.input` exactly.
 *
 * @param context - the execution context holding the session
 * @param operationId - the operation identifier
 * @param options - the operation input for an exact check
 * @param options.input - the operation input
 * @returns true if the operation exists and is allowed
 */
export async function canCallOperation(
  context: OperationContext,
  operationId: string,
  options?: { input?: any }
): Promise<boolean> {
  const operation = useInstanceStorage().operations[operationId];
  if (!operation) {
    return false;
  }
  try {
    if (!checkOperationPermission(context, operationId, operation)) {
      return false;
    }
    return (
      (await runAuthorizers(context, operationId, operation, {
        input: options?.input,
        probe: options === undefined
      })) === true
    );
  } catch {
    return false;
  }
}

/**
 * JSON Schema keyword listing every parameter of an operation method in order, set when some receive the context
 */
export const ARGUMENTS_KEYWORD = "x-webda-arguments";

/**
 * JSON Schema keyword listing the parameters of an operation method that receive the operation context
 */
export const CONTEXT_KEYWORD = "x-webda-context";

/**
 * JSON Schema keyword the compiler sets on a streamed `.input` or `.output` schema
 */
export const STREAM_SCHEMA_KEYWORD = "x-webda-stream";

/**
 * Streaming mode of an operation
 * @param operation - the operation definition
 * @returns its mode, `none` when unknown
 */
export function getOperationStreaming(operation?: Pick<OperationDefinition, "streaming" | "grpc">): OperationStreaming {
  if (operation?.streaming) return operation.streaming;
  const grpc = operation?.grpc;
  return (typeof grpc === "object" && grpc?.streaming) || "none";
}

/**
 * @param operation - the operation definition
 * @returns true when the operation reads a stream of input messages
 */
function hasStreamedInput(operation?: OperationDefinition): boolean {
  const streaming = getOperationStreaming(operation);
  return streaming === "client" || streaming === "bidi";
}

/**
 * Derive the streaming mode at registration: explicit grpc.streaming, else the schema markers and generator flag
 * @param definition - the operation being registered (input/output already resolved)
 * @returns the mode
 */
function computeStreaming(definition: OperationDefinition): OperationStreaming {
  if (typeof definition.grpc === "object" && definition.grpc?.streaming) return definition.grpc.streaming;
  const marked = (ref: string) =>
    ref !== "void" && (useApplication().getSchema(ref) as any)?.[STREAM_SCHEMA_KEYWORD] === true;
  const input = marked(definition.input);
  const output = marked(definition.output) || definition.generator === true;
  if (input && output) return "bidi";
  if (input) return "client";
  return output ? "server" : "none";
}

/**
 * Turn an AJV validation error into the BadRequest an operation answers
 * @param operationId - the operation
 * @param err - the validation error
 * @returns the error to throw
 */
function invalidInput(operationId: string, err: ValidationError): WebdaError.BadRequest {
  // Include the failing attribute path (AJV `instancePath`) in the human
  // message so the client can tell *which* field is invalid; attach the
  // raw `errors[]` as structured `details` so consumers can map errors
  // to fields without parsing the string.
  const summary = err.errors
    .map(e => {
      const path =
        e.instancePath ||
        (e.params && (e.params as any).missingProperty ? `/${(e.params as any).missingProperty}` : "/");
      return `${path} ${e.message}`;
    })
    .join("; ");
  return new WebdaError.BadRequest(`${operationId} InvalidInput: ${summary}`, { errors: err.errors });
}

/**
 * The streamed input of an operation, each message validated against its input schema as it is read
 * @param operationId - the operation
 * @param schema - its input schema name
 * @param source - the messages from the transport
 * @returns the validated messages
 */
async function* validatedStream(operationId: string, schema: string, source: AsyncIterable<unknown>) {
  for await (const item of source) {
    if (schema && schema !== "void") {
      try {
        validateSchema(schema, item);
      } catch (err) {
        if (err instanceof ValidationError) throw invalidInput(operationId, err);
        throw err;
      }
    }
    yield item;
  }
}

export type { OperationSubject, DryRunResult };

/**
 * Serialize a primary key to the canonical string identifying an operation subject.
 *
 * A single-field key is its string value; a composite key is the JSON array of its
 * field values in `pkFields` order, so plain input objects and `getPrimaryKey()`
 * results (including relation links) produce the same string.
 * @param pkFields - the model primary key fields
 * @param key - a scalar key, or an object holding the key fields
 * @returns the canonical key, or undefined when a field is missing
 */
export function serializeSubjectKey(pkFields: readonly string[], key: unknown): string | undefined {
  if (key === undefined || key === null) {
    return undefined;
  }
  if (pkFields.length <= 1) {
    const value = typeof key === "object" ? (key as any)[pkFields[0] ?? "uuid"] : key;
    return value === undefined || value === null ? undefined : String(value);
  }
  if (typeof key !== "object") {
    return undefined;
  }
  const values = pkFields.map(field => (key as any)[field]);
  if (values.some(value => value === undefined || value === null)) {
    return undefined;
  }
  return JSON.stringify(values.map(value => String(value)));
}

/**
 * Turn a subject key sent by a client into a key usable with `Model.ref()`.
 *
 * Accepts the scalar value, an object of key fields, or for composite keys the
 * canonical JSON array produced by `serializeSubjectKey`.
 * @param pkFields - the model primary key fields
 * @param key - the key as received
 * @returns the key, or undefined when it does not match `pkFields`
 */
export function parseSubjectKey(
  pkFields: readonly string[],
  key: unknown
): string | Record<string, string> | undefined {
  if (key === undefined || key === null || key === "") {
    return undefined;
  }
  if (pkFields.length <= 1) {
    const value = typeof key === "object" ? (key as any)[pkFields[0] ?? "uuid"] : key;
    return value === undefined || value === null || value === "" ? undefined : String(value);
  }
  let source: any = key;
  if (typeof key === "string") {
    try {
      source = JSON.parse(key);
    } catch {
      return undefined;
    }
  }
  if (Array.isArray(source)) {
    if (source.length !== pkFields.length) {
      return undefined;
    }
    source = Object.fromEntries(pkFields.map((field, i) => [field, source[i]]));
  }
  if (typeof source !== "object" || source === null) {
    return undefined;
  }
  if (pkFields.some(field => source[field] === undefined || source[field] === null)) {
    return undefined;
  }
  return Object.fromEntries(pkFields.map(field => [field, String(source[field])]));
}

/**
 * Context extension holding the subject an operation declared with `setOperationSubject`
 */
const DECLARED_SUBJECT = "operationSubject";

/**
 * Declare the object the current operation acts on, when the framework cannot
 * derive it: a service operation such as `Publisher.PublishPost(postId)`.
 * Listeners such as the audit log record it like a derived subject, and it
 * takes precedence over one. Call it from the operation (or anything it calls);
 * outside an operation it does nothing.
 *
 * @param subject - a model instance, or `{ model, key }` with a model class or
 *   identifier and its primary key (scalar, object of key fields, or canonical string)
 * @throws Error if the model is unknown or the key does not match its primary key
 */
export function setOperationSubject(subject: Model | { model: string | any; key: unknown }): void {
  const context = useContext<OperationContext>();
  let operation: string | undefined;
  try {
    operation = context?.getExtension?.("operation");
  } catch {
    // The global context has no extensions
  }
  if (!operation) {
    return;
  }
  const instance = typeof (subject as any).getPrimaryKey === "function" ? (subject as Model) : undefined;
  const modelRef = instance ? (instance.constructor as any) : (subject as { model: any }).model;
  const model: any = typeof modelRef === "string" ? useModel(modelRef) : modelRef;
  const modelId = useApplication().getModelId(model);
  const pkFields: string[] = useModelMetadata(model)?.PrimaryKey ?? ["uuid"];
  const rawKey = instance ? instance.getPrimaryKey() : (subject as { key: unknown }).key;
  const key = serializeSubjectKey(pkFields, parseSubjectKey(pkFields, rawKey));
  if (!modelId || key === undefined) {
    throw new Error(`Invalid operation subject ${modelId ?? String(modelRef)}: ${JSON.stringify(rawKey)}`);
  }
  context.setExtension(DECLARED_SUBJECT, { model: modelId, key } satisfies OperationSubject);
}

/**
 * Find the object an operation targets
 *
 * - model instance operation: the model and the key it was called with
 * - operation with `context.model` (DomainService CRUD, behaviors): the key fields from
 *   the resolved input or the request parameters, or for `Create` the created object
 * - queries, static model operations and plain service operations: none
 * @param context - the operation context
 * @param operation - the operation definition
 * @param args - the arguments the operation was called with
 * @param result - the operation result, when it succeeded
 * @returns the subject, or undefined when the operation has no single target
 */
export function resolveOperationSubject(
  context: OperationContext,
  operation: OperationDefinition,
  args: any[],
  result?: any
): OperationSubject | undefined {
  const declared = context.getExtension?.<OperationSubject>(DECLARED_SUBJECT);
  if (declared) {
    return declared;
  }
  const instanceOperation = operation.model !== undefined;
  if (instanceOperation && operation.static !== false) {
    return undefined;
  }
  const modelRef = instanceOperation ? operation.model : operation.context?.model;
  if (!modelRef) {
    return undefined;
  }
  const model: any = typeof modelRef === "string" ? useModel(modelRef) : modelRef;
  const modelId = useApplication().getModelId(model);
  if (!modelId) {
    return undefined;
  }
  const pkFields: string[] = operation.context?.pkFields ?? useModelMetadata(model)?.PrimaryKey ?? ["uuid"];
  let key: string | undefined;
  if (instanceOperation) {
    key = serializeSubjectKey(pkFields, args[0]);
  } else if (result instanceof model && typeof (result as any).getPrimaryKey === "function") {
    // Create: the saved object holds the real key (generated, or different from the input)
    key = serializeSubjectKey(pkFields, (result as any).getPrimaryKey());
  }
  if (key === undefined && !instanceOperation) {
    const input = context.getExtension<any>("operationResolvedInput") ?? context.getParameters() ?? {};
    // Behavior operations (Post.MainImage.Attach) route the key as `{uuid}` whatever the
    // model's real primary key field is, and register no pkFields
    key = serializeSubjectKey(pkFields, pkFields.length === 1 ? (input[pkFields[0]] ?? input.uuid) : input);
  }
  return key === undefined ? undefined : { model: modelId, key };
}

/**
 * Resolve the subject of a running operation without ever failing the operation
 * @param context - the operation context
 * @param operationId - the operation identifier
 * @param args - the arguments the operation was called with
 * @param result - the operation result, when it succeeded
 * @returns the subject, or undefined
 */
function subjectOf(context: OperationContext, operationId: string, args: any[], result?: any) {
  const operation = useInstanceStorage().operations[operationId];
  if (!operation) {
    return undefined;
  }
  try {
    return resolveOperationSubject(context, operation, args, result);
  } catch {
    return undefined;
  }
}

/**
 * Convert one path/query string to the type its schema declares
 *
 * A value that does not convert (e.g. `"abc"` or `"Infinity"` for a number) is returned unchanged so the
 * schema validation rejects it with the field name.
 * @param value - the string received in the URL
 * @param schema - the property schema
 * @returns the converted value, or the string
 */
function coerceParameterValue(value: string, schema: any): any {
  switch (schema?.type) {
    case "number":
    case "integer": {
      const n = Number(value);
      // NaN and Infinity stay strings: the schema validation rejects them
      return value.trim() !== "" && Number.isFinite(n) ? n : value;
    }
    case "boolean":
      if (value === "true" || value === "1") return true;
      if (value === "false" || value === "0") return false;
      return value;
    case "array":
      return value === "" ? [] : value.split(",").map(item => coerceParameterValue(item, schema.items));
    default:
      return value;
  }
}

/**
 * Coerce path/query params to the type their schema declares. URL slots arrive as strings even
 * when the operation method expects a number/boolean/array (e.g. `setMetadata(index: number, ...)`
 * mounted at `{index}/{hash}` — `index` is the literal `"0"` until we coerce).
 *
 * Only values coming from the parameters are converted: the body is JSON and stays strict, a
 * body sending `"20"` for a number is a validation error.
 *
 * We mutate `merged` in place (caller forwards the same object to
 * `resolveArguments`). We do NOT use AJV's `coerceTypes` flag because that
 * setting on the singleton AJV instance flips a global mode and silently
 * widens type validation across every other call site (e.g. coercing
 * `123` → `"123"` to satisfy a `string` schema), which is the wrong default
 * for model validation.
 * @param schema - operation input schema with `properties` describing the expected types
 * @param merged - merged params + body object to coerce in place
 * @param params - the path/query parameters
 * @param body - the request body
 */
function coerceParametersToSchema(
  schema: any,
  merged: Record<string, any>,
  params: Record<string, any>,
  body: Record<string, any>
): void {
  if (!schema?.properties) return;
  for (const [name, propSchema] of Object.entries(schema.properties as Record<string, any>)) {
    if (!(name in params) || body[name] !== undefined || typeof merged[name] !== "string") continue;
    merged[name] = coerceParameterValue(merged[name], propSchema);
  }
}

/**
 * Compare a path/query parameter with the body value sent for the same key
 *
 * Path and query values are always strings while the body may carry the typed value
 * @param param - the path/query parameter value
 * @param value - the body value
 * @returns true if both designate the same value
 */
function isSameParameterValue(param: any, value: any): boolean {
  if (param === value) {
    return true;
  }
  const isScalar = (v: any) => ["string", "number", "boolean", "bigint"].includes(typeof v);
  return isScalar(param) && isScalar(value) && String(param) === String(value);
}

/**
 * Read the operation input: path/query parameters merged with the request body
 *
 * The body can complete the parameters but never replace one, so the URL always
 * identifies the target of the operation (e.g. `PUT /tasks/A` with `{ "uuid": "B" }`
 * must not act on B).
 * @param context - the execution context
 * @param operationId - the operation identifier
 * @returns the raw body, the parameters, the body object and the merged input
 * @throws BadRequest if a body value conflicts with a parameter
 */
async function getOperationInput(
  context: OperationContext,
  operationId: string
): Promise<{ input: any; params: Record<string, any>; body: Record<string, any>; merged: any }> {
  const params = context.getParameters() || {};
  let input: any;
  try {
    input = await context.getInput();
  } catch {
    // No input (e.g., GET request)
  }
  const body = typeof input === "object" && input !== null ? input : {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || body[key] === undefined || isSameParameterValue(value, body[key])) {
      continue;
    }
    throw new WebdaError.BadRequest(`${operationId} InvalidInput: /${key} conflicts with path parameter`);
  }
  return { input, params, body, merged: { ...params, ...body } };
}

/**
 * Check if an operation can be executed with the current context.
 * @param context - the execution context
 * @param operationId - the operation identifier
 */
async function checkOperation(context: OperationContext, operationId: string) {
  context.setExtension("operationResolvedInput", undefined);
  const operations = useInstanceStorage().operations;
  if (!checkOperationPermission(context, operationId, operations[operationId])) {
    throw new WebdaError.Forbidden(`${operationId} PermissionDenied`);
  }
  if (hasStreamedInput(operations[operationId])) {
    if (!context.getExtension("operationInputStream")) {
      throw new WebdaError.BadRequest(`${operationId} expects a stream of messages (gRPC stream or WebSocket)`);
    }
    // Each message is validated as the operation reads it (resolveArguments)
    return;
  }
  try {
    if (operations[operationId].input && operations[operationId].input !== "void") {
      // Validate the merged (path params + request body) against the input schema.
      // Path params (e.g., {uuid}, {hash}) are provided via context.getParameters()
      // and must be merged with the body before validation because schemas like
      // uuidRequest and binaryHashRequest declare them as required properties.
      const { merged, params, body } = await getOperationInput(context, operationId);
      // Coerce string path/query params (e.g. `"0"`) to the type the
      // schema declares before validation runs, so AJV doesn't reject
      // `index: "0"` against `{ type: "number" }`. Mutates `merged` in
      // place so `resolveArguments` sees the typed value too.
      const app = useApplication();
      const inputSchema = app.getSchema(operations[operationId].input);
      coerceParametersToSchema(inputSchema, merged, params, body);
      validateSchema(operations[operationId].input, merged);
      context.setExtension("operationResolvedInput", merged);
    }
  } catch (err) {
    if (err instanceof ValidationError) {
      throw invalidInput(operationId, err);
    }
    throw err;
  }
  const authorized = await runAuthorizers(context, operationId, operations[operationId], {
    input: context.getExtension("operationResolvedInput"),
    probe: false
  });
  if (authorized !== true) {
    useLog("DEBUG", `Operation ${operationId} refused by an authorizer`, authorized);
    throw new WebdaError.Forbidden(`${operationId} PermissionDenied`);
  }
}

/**
 * Resolve method arguments from the OperationContext using the operation's input schema metadata.
 *
 * The REST transport merges path/query params into the context so that `context.getParameters()`
 * contains URL-derived values (e.g., `{uuid}`) while `context.getInput()` contains the request
 * body. This function merges both sources (a body value conflicting with a param is rejected)
 * and extracts arguments based on the `input` schema property names and order.
 *
 * @param context - the execution context
 * @param operation - the operation definition
 * @returns an array of resolved arguments to pass to the operation method
 */
export async function resolveArguments(context: OperationContext, operation: OperationDefinition): Promise<any[]> {
  if (hasStreamedInput(operation)) {
    const source = context.getExtension<AsyncIterable<unknown>>("operationInputStream");
    return [validatedStream(operation.id, operation.input, source)];
  }
  // Prefer the merged-and-coerced object that `checkOperation` left on the
  // context. Re-merging here would discard AJV's `coerceTypes` rewrites
  // (e.g. string `"0"` from a `{index}` URL slot back to a `number`).
  // Falls back to a fresh merge for code paths that bypass `checkOperation`
  // (currently only `Test.Op` unit tests).
  const resolved = await getOperationInput(context, operation.id);
  const input = resolved.input;
  const merged = context.getExtension<any>("operationResolvedInput") ?? resolved.merged;

  // Use input schema properties to determine argument order
  if (operation.input && operation.input !== "void") {
    const app = useApplication();
    const schema: any = app.getSchema(operation.input);
    if (schema?.properties) {
      // The compiler lists every parameter when some receive the context instead of an input value
      const names: string[] = schema[ARGUMENTS_KEYWORD] ?? Object.keys(schema.properties);
      const contexts = new Set<string>(schema[CONTEXT_KEYWORD] ?? []);
      // Extract values by schema property names from the merged params + body
      return names.map(name => (contexts.has(name) ? context : merged[name]));
    }
  }

  // No schema: pass input as single arg if present
  if (input !== undefined && input !== null) {
    return [input];
  }
  return [];
}

/**
 * Longest pattern accepted by pattern matching
 */
const MAX_PATTERN_LENGTH = 1024;

/**
 * Convert a glob-like pattern to a RegExp for operation id matching.
 * `*` matches any characters, `?` matches a single character.
 * @param pattern - pattern to convert
 * @returns regular expression
 */
function globToRegExp(pattern: string): RegExp {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    throw new Error("Operation pattern too long");
  }
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

/**
 * Check if an operation id matches a glob pattern (e.g. "Billing.*", "User.Delete", "*")
 * @param pattern - glob pattern
 * @param operationId - operation id
 * @returns true if matches
 */
export function matchesOperationPattern(pattern: string, operationId: string): boolean {
  if (pattern === "*" || pattern === operationId) {
    return true;
  }
  return globToRegExp(pattern).test(operationId);
}

/**
 * Check if an operation id matches any pattern in a list
 * @param patterns - array of glob patterns
 * @param operationId - operation id
 * @returns true if any pattern matches
 */
export function matchesAnyPattern(patterns: string[] | undefined, operationId: string): boolean {
  if (!patterns || !Array.isArray(patterns) || patterns.length === 0) {
    return false;
  }
  return patterns.some(pattern => matchesOperationPattern(pattern, operationId));
}

/**
 * Decide whether an operation is read-only:
 * - op.mcp?.readOnly if explicitly set (boolean)
 * - otherwise op.rest?.method === "get" (case-insensitive)
 * - otherwise /\.(Get|Query)$/.test(id)
 *
 * @param id - operation id
 * @param op - operation definition
 * @returns true if the operation is read-only
 */
export function isReadOnlyOperation(id: string, op?: Partial<OperationDefinition>): boolean {
  if (op?.mcp && typeof op.mcp === "object" && op.mcp.readOnly !== undefined) {
    return !!op.mcp.readOnly;
  }
  if (
    op?.rest &&
    typeof op.rest === "object" &&
    typeof op.rest.method === "string" &&
    op.rest.method.toLowerCase() === "get"
  ) {
    return true;
  }
  return /\.(Get|Query)$/.test(id);
}

/**
 * Decide whether an operation call should run in dry-run mode.
 *
 * Resolution order:
 * 1. Already dry: if context.getExtension("dryRun") === true, nested operations stay dry.
 * 2. Enforce: if operation matches parameters.dryRun.enforce, always dry (wins over exclude).
 * 3. Exclude: if operation matches parameters.dryRun.exclude, turns off sources 4 & 5 (never overrides enforce).
 * 4. Global switch: parameters.dryRun.enabled === true.
 * 5. Per-call request:
 *    - context.getExtension("requestedDryRun") === true
 *    - REST header `X-Webda-Dry-Run: true` when parameters.dryRun.allowRequest === true
 *
 * @param context - execution context
 * @param operationId - operation id
 * @returns true if the call should run in dry mode
 */
export function resolveDryRun(context: OperationContext, operationId: string): boolean {
  if (context?.getExtension?.("dryRun") === true) {
    return true;
  }

  let dryRunConfig: any;
  try {
    dryRunConfig = useParameters()?.dryRun;
  } catch {
    // Outside an application or during bootstrap
  }

  // 1. Enforce
  if (matchesAnyPattern(dryRunConfig?.enforce, operationId)) {
    return true;
  }

  // Check exclude: turns off sources 2 and 3
  const isExcluded = matchesAnyPattern(dryRunConfig?.exclude, operationId);
  if (isExcluded) {
    return false;
  }

  // 2. Global switch
  if (dryRunConfig?.enabled === true) {
    return true;
  }

  // 3. Per-call request
  if (context?.getExtension?.("requestedDryRun") === true) {
    return true;
  }

  if (dryRunConfig?.allowRequest === true) {
    const httpCtx = (context as any)?.getHttpContext?.();
    const header = httpCtx?.getHeader?.("x-webda-dry-run") ?? (context as any)?.getHeader?.("x-webda-dry-run");
    if (header === "true" || (Array.isArray(header) && header[0] === "true")) {
      return true;
    }
  }

  return false;
}

const SECRET_REGEX = /password|secret|token|credential|authorization/i;
const SECRET_MASK = "********";

/**
 * Mask sensitive values in an argument (passwords, tokens, SecretString, etc.)
 * @param val - value to mask
 * @param seen - tracking set for circular reference protection
 * @returns masked value
 */
export function maskValue(val: unknown, seen = new WeakSet<object>()): unknown {
  if (val === null || val === undefined) {
    return val;
  }
  if (typeof val === "object" && val !== null && "getValue" in val && typeof (val as any).getValue === "function") {
    return SECRET_MASK;
  }
  if (typeof val !== "object") {
    return val;
  }
  if (val instanceof Date || val instanceof RegExp) {
    return val;
  }
  if (seen.has(val)) {
    return "[Circular]";
  }
  seen.add(val);
  if (Array.isArray(val)) {
    return val.map(item => maskValue(item, seen));
  }
  const result: Record<string, unknown> = {};
  for (const [key, propVal] of Object.entries(val)) {
    if (SECRET_REGEX.test(key)) {
      result[key] = SECRET_MASK;
    } else {
      result[key] = maskValue(propVal, seen);
    }
  }
  return result;
}

/**
 * Mask secrets in an array of arguments
 * @param args - array of arguments
 * @returns array with secrets masked
 */
export function maskArguments(args: unknown[]): unknown[] {
  return args.map(arg => maskValue(arg));
}

/**
 * Call an operation within the framework
 * @param context - the execution context
 * @param operationId - the operation identifier
 */
export async function callOperation(context: OperationContext, operationId: string): Promise<void> {
  const operations = useInstanceStorage().operations;
  useLog("DEBUG", "Call operation", operationId);
  let callArgs: any[] = [];
  let result: any;
  // A nested operation declares its own subject; restore the caller's after
  const callerSubject = context.getExtension(DECLARED_SUBJECT);
  context.setExtension(DECLARED_SUBJECT, undefined);

  const isDry = resolveDryRun(context, operationId);
  const prevRequestedDry = context.getExtension("requestedDryRun");
  if (isDry) {
    context.setExtension("dryRun", true);
    try {
      context.setHeader?.("X-Webda-Dry-Run", "true");
    } catch {
      // Stream or context does not support setHeader
    }
  } else if (prevRequestedDry === true) {
    context.setExtension("requestedDryRun", false);
  }

  try {
    context.setExtension("operation", operationId);
    await checkOperation(context, operationId);
    context.setExtension("operationContext", operations[operationId].context || {});
    await Promise.all([emitCoreEvent("Webda.BeforeOperation", { context, operationId, dryRun: isDry || undefined })]);

    // Resolve arguments from context using the operation's input schema
    const args = await resolveArguments(context, operations[operationId]);

    // When resolveArguments returns no typed arguments (no input schema),
    // fall back to passing the context for backward compatibility with
    // methods that still use the context-based calling convention.
    callArgs = args.length > 0 ? args : [context];

    const opDef = operations[operationId];
    const dryRunMode = opDef.dryRun ?? (isReadOnlyOperation(operationId, opDef) ? "execute" : "skip");

    if (isDry && dryRunMode === "skip") {
      const maskedArgs = maskArguments(args);
      useLog("INFO", `DRY RUN ${operationId}`, ...maskedArgs);
      const subject = subjectOf(context, operationId, callArgs);
      await emitCoreEvent("Webda.OperationDryRun", {
        context,
        operationId,
        arguments: maskedArgs,
        subject
      });
      const dryResult: DryRunResult = {
        dryRun: true,
        operationId,
        arguments: maskedArgs,
        ...(subject ? { subject } : {})
      };
      const streaming = getOperationStreaming(opDef);
      if (streaming === "server" || streaming === "bidi" || opDef.generator) {
        context.setExtension("operationStreaming", true);
      }
      context.write(dryResult);
      await Promise.all([
        emitCoreEvent("Webda.OperationSuccess", {
          context,
          operationId,
          subject,
          dryRun: true
        })
      ]);
      return;
    }

    // Call the method with resolved arguments, wrapped in runWithContext
    // so that useContext() returns the operation context inside the method.
    if (opDef.service) {
      result = await runWithContext(context, () => useService(opDef.service as any)[opDef.method](...callArgs));
    } else if (opDef.model) {
      const modelClass = useModel(opDef.model);
      const method = opDef.method;
      if (opDef.static === false) {
        // Instance method — load the model instance as the caller (a missing object and an object the caller may
        // not read answer the same NotFound; a refused method is Forbidden) and call the method on it
        // The first argument should be the primary key (uuid)
        const uuid = callArgs[0];
        result = await runWithContext(context, async () => {
          const instance = await loadModelForAction(modelClass, uuid, context, method);
          return instance[method](...callArgs.slice(1));
        });
      } else {
        // Static/class method — the model's static canAct is asked without object
        result = await runWithContext(context, async () => {
          await checkStaticModelPermission(modelClass, context, method);
          return modelClass[method](...callArgs);
        });
      }
    } else {
      throw new Error(`${operationId} NoServiceOrModel`);
    }

    // Handle return value — only write if the method hasn't already
    // written to the context (avoid duplicating the response body when
    // both the method and callOperation try to write the same value).
    if (result !== undefined && result !== null) {
      if (typeof result[Symbol.asyncIterator] === "function") {
        // AsyncGenerator — stream each yielded value; flag it so contexts
        // (e.g. MCP) can tell streamed chunks from a single written result.
        // The generator body runs during iteration: iterate inside the context so useContext() keeps working
        // after a yield, and wait whenever the client cannot take more (backpressure)
        context.setExtension("operationStreaming", true);
        await runWithContext(context, async () => {
          for await (const chunk of result) {
            if (context.write(chunk) === false) await context.drained();
          }
        });
      } else if (context.getOutput() === undefined) {
        // Normal return — write to context only if nothing written yet
        context.write(result);
      }
    }

    await Promise.all([
      emitCoreEvent("Webda.OperationSuccess", {
        context,
        operationId,
        subject: subjectOf(context, operationId, callArgs, result),
        dryRun: isDry || undefined
      })
      //emitCoreEvent(operationId, <any>context.getExtension("event") || {})
    ]);
  } catch (err) {
    await Promise.all([
      emitCoreEvent("Webda.OperationFailure", {
        context,
        operationId,
        error: err,
        subject: subjectOf(context, operationId, callArgs),
        dryRun: isDry || undefined
      })
      //emitCoreEvent(`${operationId}.Failure`, <any>context.getExtension("event") || {})
    ]);
    throw err;
  } finally {
    context.setExtension("event", undefined);
    context.setExtension(DECLARED_SUBJECT, callerSubject);
    if (!isDry && prevRequestedDry === true) {
      context.setExtension("requestedDryRun", prevRequestedDry);
    }
  }
}

/**
 * Get available operations
 * @returns the result
 */
export function listOperations(): { [key: string]: Omit<OperationDefinition, "service" | "method"> } {
  const list = {};
  const operations = useInstanceStorage().operations;
  Object.keys(operations).forEach(o => {
    list[o] = {
      ...operations[o]
    };
    delete list[o].service;
    delete list[o].method;
  });
  return list;
}

/**
 * Get available operations with full details including service/method.
 * Intended for debug/introspection only.
 * @returns operations map with all fields
 */
export function listFullOperations(): { [key: string]: OperationDefinition } {
  return { ...useInstanceStorage().operations };
}

/**
 * Register a new operation within the app
 * @param operationId - the operation identifier
 * @param definition - the definition object
 */
export function registerOperation(
  operationId: string,
  definition: Omit<OperationDefinition, "id" | "input" | "output"> & { input?: string; output?: string }
) {
  // Check operation naming convention
  if (!operationId.match(/^([A-Z][A-Za-z0-9]*\.)*([A-Z][a-zA-Z0-9]*)$/)) {
    throw new Error(`OperationId ${operationId} must match ^([A-Z][A-Za-z0-9]*.)*([A-Z][a-zA-Z0-9]*)$`);
  }

  // Check if service and method exist
  if (definition.model !== undefined) {
    const model = useModel(definition.model);
    if (!model || typeof model[definition.method] !== "function") {
      throw new Error(`Operation ${operationId} service ${definition.service} method ${definition.method} not found`);
    }
  } else if (definition.service !== undefined) {
    const service = useDynamicService(definition.service);
    if (!service || typeof service[definition.method] !== "function") {
      throw new Error(`Operation ${operationId} service ${definition.service} method ${definition.method} not found`);
    }
  } else {
    throw new Error(`Operation ${operationId} must have a service or a model`);
  }
  const operations = useInstanceStorage().operations;
  const dryRunDefault = isReadOnlyOperation(operationId, definition as OperationDefinition) ? "execute" : "skip";
  // Add the operation, defaulting input/output to "void" if not provided
  operations[operationId] = {
    ...definition,
    id: operationId,
    input: definition.input ?? "void",
    output: definition.output ?? "void",
    dryRun: definition.dryRun ?? dryRunDefault
  } as OperationDefinitionInfo;
  ["input", "output"]
    .filter(key => operations[operationId][key] && operations[operationId][key] !== "void")
    .forEach(key => {
      if (!useApplication().getSchema(operations[operationId][key])) {
        operations[operationId][key] = "void";
      }
    });
  operations[operationId].streaming = definition.streaming ?? computeStreaming(operations[operationId]);
}

/**
 * Wrapper concept for an operation
 *
 * Wrapper will launch the operation but they can wrap it with additional logic
 * It allows to set some asyncStorage
 *
 * Logging configuration per Operation
 * Metrics, Tracing
 *
 */

interface OperationParameters {
  /**
   * A unique operation id
   *
   * If a . is present it will be considered as a unique operation
   * If no . is present the operation will be prefixed with the Service name or the Model name
   */
  id?: string;
  /**
   * Short summary of the operation
   */
  summary?: string;
  /**
   * Full description of the operation
   */
  description?: string;
  /**
   * Categorization tags for the operation
   */
  tags?: string[];
  /**
   * Hide the operation from transport exposure
   */
  hidden?: boolean;
  /**
   * Mark the operation as deprecated
   */
  deprecated?: boolean;
  /**
   * Permission query to check before executing the operation
   */
  permission?: string;
  /**
   * Permission query to check before executing the operation
   */
  permissionQuery?: string;
  /**
   * REST transport hints
   */
  rest?: OperationDefinition["rest"];
  /**
   * GraphQL transport hints
   */
  graphql?: OperationDefinition["graphql"];
  /**
   * gRPC transport hints
   */
  grpc?: OperationDefinition["grpc"];
  /**
   * MCP transport hints
   */
  mcp?: OperationDefinition["mcp"];
  /**
   * How the operation behaves when the call runs in dry mode
   * - "execute": it has no side effects, so it runs normally (default for read-only operations)
   * - "delegate": the method is called and handles dry mode itself through `useDryRun()` ("dryable")
   * - "skip": the method is NOT called; the call is validated, logged and reported (default for everything else)
   */
  dryRun?: OperationDefinition["dryRun"];
}

function Operation<T = {}>(
  options?: T & OperationParameters
): (target: (this: OperationTarget, ...args: any) => any, context: ClassMethodDecoratorContext) => void;
function Operation(target: (this: OperationTarget, ...args: any) => any, context: ClassMethodDecoratorContext): void;
/**
 * Decorator that registers a class method as an operation with optional configuration
 * @param args - additional arguments
 * @returns the result
 */
function Operation(...args: any[]) {
  const annotate = (target: AnyMethod, context: ClassMethodDecoratorContext, options: any = {}) => {
    context.metadata!["webda.operations"] ??= [];
    (context.metadata!["webda.operations"] as any[]).push({
      id: context.name,
      ...options,
      _methodName: context.name,
      static: context.static,
      generator: isGeneratorFunction(target)
    });
    const wrapper = function operationWrapper(this: any, ...args) {
      return target.call(this, ...args);
    };
    (wrapper as any).__original = target;
    return wrapper;
  };
  if (args.length === 2 && args[1] instanceof Object && args[1].kind === "method") {
    return annotate(args[0], args[1]);
  }
  return (target: any, context: ClassMethodDecoratorContext) => {
    return annotate(target, context, args[0]);
  };
}

export { Operation };
