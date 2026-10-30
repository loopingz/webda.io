import { QueryValidator } from "@webda/ql";
import { OperationDefinition, OperationDefinitionInfo, OperationStreaming } from "./icore.js";
import { OperationContext } from "../contexts/operationcontext.js";
import { WebContext } from "../contexts/webcontext.js";
import * as WebdaError from "../errors/errors.js";
import { validateSchema, ValidationError } from "../schemas/hooks.js";
import { useInstanceStorage } from "./instancestorage.js";
import { useApplication, useModel } from "../application/hooks.js";
import { useDynamicService, useModelMetadata, useService } from "./hooks.js";
import { emitCoreEvent } from "../events/events.js";
import { isGeneratorFunction } from "node:util/types";
import { AnyMethod } from "@webda/decorators";
import type { Service } from "../services/service.js";
import type { Model } from "@webda/models";
import { runWithContext, useContext } from "../contexts/execution.js";
import { checkStaticModelPermission, loadModelForAction } from "../models/permissions.js";
import { MfaRequired, MfaStepUpRequired } from "../errors/mfa.js";
import { Duration } from "@webda/utils";
import { bindRestInput, resolveInputSchema } from "../rest/binding.js";
import { listOperationTransactionParticipants, OperationTransaction, useOperationTransaction } from "./transactions.js";
import type { OperationTransactionParticipant } from "./transactions.js";

type OperationTarget = Service | Model | typeof Service | typeof Model;
import { useLog } from "@webda/workout";

/**
 * Check if an operation can be executed with the current context
 * Not checking the input use `checkOperation` instead to check everything
 *
 * The system (`useSystem()`, `runAsSystem`) passes the operation `permission` query; the authorizers still apply
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
  if (context.isGlobalContext()) {
    return true;
  }
  if (operation.permission) {
    operation.permissionQuery ??= new QueryValidator(operation.permission);
    return operation.permissionQuery.eval(context.getSession());
  }
  return true;
}

/**
 * Check the second factor freshness an operation requires with `maxMfaAge`
 *
 * Synchronous and without I/O: it only reads the session, so every transport and {@link canCallOperation} listing
 * apply it alike. `maxMfaAge` also makes MFA mandatory.
 * @param context - the execution context
 * @param operationId - the operation identifier
 * @param operation - the operation definition
 * @throws WebdaError.Unauthorized when the session is anonymous or its second factor is pending
 * @throws MfaRequired when the user has no second factor
 * @throws MfaStepUpRequired when the second factor was verified more than `maxMfaAge` ago
 */
export function checkOperationMfa(
  context: OperationContext,
  operationId: string,
  operation: OperationDefinition & { maxMfaAgeSeconds?: number } = useInstanceStorage().operations[operationId]
): void {
  if (!operation) {
    throw new WebdaError.NotFound(`${operationId} Unknown`);
  }
  // The system has no session to verify
  if (operation.maxMfaAge === undefined || context.isGlobalContext()) {
    return;
  }
  operation.maxMfaAgeSeconds ??= new Duration(operation.maxMfaAge).toSeconds();
  const session = context.getSession();
  if (!session?.isLogged()) {
    throw new WebdaError.Unauthorized(`${operationId} requires a login with a second factor`);
  }
  if (session.mfa !== "verified") {
    throw new MfaRequired(`${operationId} requires a second factor`);
  }
  // Sessions verified before mfaAt existed have an infinite age: never fresh
  if (session.mfaAge() > operation.maxMfaAgeSeconds * 1000) {
    throw new MfaStepUpRequired(operation.maxMfaAgeSeconds);
  }
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
 * Probe whether the context may call an operation, telling an authorizer refusal from a denial
 *
 * Never throws. Without `options` the authorizers are asked in probe mode ("could the caller call it with some
 * input?"), for listings. With `options`, they decide on `options.input` exactly.
 *
 * @param context - the execution context holding the session
 * @param operationId - the operation identifier
 * @param options - the operation input for an exact check
 * @param options.input - the operation input
 * @returns false when the operation is unknown, the permission check fails or an error occurs; otherwise the
 * authorizers result: true if allowed, or the refusal reason (`"insufficient_scope"` for a token scope refusal)
 */
export async function probeOperation(
  context: OperationContext,
  operationId: string,
  options?: { input?: any }
): Promise<true | string | false> {
  const operation = useInstanceStorage().operations[operationId];
  if (!operation) {
    return false;
  }
  try {
    if (!checkOperationPermission(context, operationId, operation)) {
      return false;
    }
    checkOperationMfa(context, operationId, operation);
    return await runAuthorizers(context, operationId, operation, {
      input: options?.input,
      probe: options === undefined
    });
  } catch {
    return false;
  }
}

/**
 * Check whether the context is allowed to call an operation: the session `permission`, MFA freshness then the authorizers
 *
 * Unlike {@link checkOperation}, this never throws: unknown operations, refusals and errors return false.
 * See {@link probeOperation} to tell the refusal reasons apart.
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
  return (await probeOperation(context, operationId, options)) === true;
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

/**
 * Target object of an operation, used by listeners such as the audit log
 */
export type OperationSubject = {
  /** Model identifier, e.g. `WebdaSample/Post` */
  model: string;
  /** Canonical primary key, see `serializeSubjectKey` */
  key: string;
};

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
 * @param root - input schema carrying referenced definitions
 * @returns the converted value, or the string
 */
function coerceParameterValue(value: any, schema: any, root: any = schema): any {
  schema = resolveInputSchema(schema, root);
  if (schema?.anyOf || schema?.oneOf) {
    const choices = schema.anyOf ?? schema.oneOf;
    schema = choices.find(s => s.type && s.type !== "null") ?? schema;
  }
  if (schema?.type === "array" && Array.isArray(value)) {
    return value.map(item => coerceParameterValue(item, schema.items, root));
  }
  if (typeof value !== "string") return value;
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
      return value === "" ? [] : value.split(",").map(item => coerceParameterValue(item, schema.items, root));
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
 * @param operation - operation whose REST template identifies query catch-all fields
 */
function coerceParametersToSchema(
  schema: any,
  merged: Record<string, any>,
  params: Record<string, any>,
  body: Record<string, any>,
  operation: OperationDefinition
): void {
  if (!schema?.properties) return;
  const rest = operation.rest;
  const catchAll = rest && bindRestInput(rest.path, rest.method, schema).binding.query.find(q => q.catchAll)?.name;
  for (const [name, propSchema] of Object.entries(schema.properties as Record<string, any>)) {
    if (!(name in params) || body[name] !== undefined) continue;
    if (catchAll === name && merged[name] && typeof merged[name] === "object" && !Array.isArray(merged[name])) {
      const resolvedSchema = resolveInputSchema(propSchema, schema);
      merged[name] = Object.fromEntries(
        Object.entries(merged[name]).map(([key, value]) => [
          key,
          coerceParameterValue(value, resolvedSchema?.properties?.[key] ?? resolvedSchema?.additionalProperties, schema)
        ])
      );
    } else {
      merged[name] = coerceParameterValue(merged[name], propSchema, schema);
    }
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
  const operation = useInstanceStorage().operations[operationId];
  const bodyParameter = context instanceof WebContext && operation?.rest && operation.rest.body;
  const body = bodyParameter
    ? input === undefined
      ? {}
      : { [bodyParameter]: input }
    : typeof input === "object" && input !== null
      ? input
      : {};
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
  checkOperationMfa(context, operationId, operations[operationId]);
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
      coerceParametersToSchema(inputSchema, merged, params, body, operations[operationId]);
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
 * Public form of an operation result, the one every transport serializes: a value with `toDTO()` (a model) is replaced
 * by its DTO, arrays and plain objects (a query page, a wrapper) are walked, anything else is kept as is
 *
 * Call it within the operation context: a DTO may depend on the caller.
 * @param value - the operation result or a streamed chunk
 * @param seen - objects already walked, a circular reference is left to the serializer
 * @returns the value to write
 */
export function toOperationOutput(value: any, seen: WeakSet<object> = new WeakSet()): any {
  if (!value || typeof value !== "object" || Buffer.isBuffer(value)) {
    return value;
  }
  if (typeof value.toDTO === "function") {
    return value.toDTO();
  }
  if (seen.has(value)) {
    return value;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map(item => toOperationOutput(item, seen));
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toOperationOutput(item, seen)]));
}

/**
 * Call an operation within the framework
 *
 * The result is written in its public form ({@link toOperationOutput}), built as the caller.
 * When transaction participants are registered (see {@link registerOperationTransactionParticipant}), the outermost
 * operation runs in a transaction: begun after the checks and before `Webda.BeforeOperation`, committed once the
 * method resolved (a streamed result fully written) and before `Webda.OperationSuccess`, rolled back before
 * `Webda.OperationFailure`. Nested operations join it.
 * @param context - the execution context
 * @param operationId - the operation identifier
 * @returns once the operation finished
 */
export async function callOperation(context: OperationContext, operationId: string): Promise<void> {
  const participants = listOperationTransactionParticipants();
  // A nested operation joins the transaction of the outermost one
  const transaction =
    participants.length > 0 && !useOperationTransaction() ? new OperationTransaction(context) : undefined;
  if (transaction) {
    return transaction.run(() => executeOperation(context, operationId, transaction, participants));
  }
  return executeOperation(context, operationId);
}

/**
 * Run an operation: checks, events, method call and result writing
 * @param context - the execution context
 * @param operationId - the operation identifier
 * @param transaction - the transaction to drive, undefined when the operation does not own one
 * @param participants - the participants to enlist in the transaction
 */
async function executeOperation(
  context: OperationContext,
  operationId: string,
  transaction?: OperationTransaction,
  participants: OperationTransactionParticipant[] = []
): Promise<void> {
  const operations = useInstanceStorage().operations;
  useLog("DEBUG", "Call operation", operationId);
  let callArgs: any[] = [];
  let result: any;
  // A nested operation declares its own subject; restore the caller's after
  const callerSubject = context.getExtension(DECLARED_SUBJECT);
  context.setExtension(DECLARED_SUBJECT, undefined);
  try {
    context.setExtension("operation", operationId);
    await checkOperation(context, operationId);
    context.setExtension("operationContext", operations[operationId].context || {});
    if (transaction) {
      transaction.operation = operations[operationId];
      for (const participant of participants) {
        await transaction.enlist(participant);
      }
    }
    await Promise.all([
      emitCoreEvent("Webda.BeforeOperation", { context, operationId })
      //emitCoreEvent(`${operationId}.Before`, <any>context.getExtension("event") || {})
    ]);

    // Resolve arguments from context using the operation's input schema
    const args = await resolveArguments(context, operations[operationId]);

    // When resolveArguments returns no typed arguments (no input schema),
    // fall back to passing the context for backward compatibility with
    // methods that still use the context-based calling convention.
    callArgs = args.length > 0 ? args : [context];

    // Call the method with resolved arguments, wrapped in runWithContext
    // so that useContext() returns the operation context inside the method.
    if (operations[operationId].service) {
      result = await runWithContext(context, () =>
        useService(operations[operationId].service as any)[operations[operationId].method](...callArgs)
      );
    } else if (operations[operationId].model) {
      const modelClass = useModel(operations[operationId].model);
      const method = operations[operationId].method;
      if (operations[operationId].static === false) {
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
            if (context.write(toOperationOutput(chunk)) === false) await context.drained();
          }
        });
      } else if (context.getOutput() === undefined) {
        // Normal return — write to context only if nothing written yet, built as the caller (a DTO may depend on it)
        context.write(await runWithContext(context, () => toOperationOutput(result)));
      }
    }

    // Commit before the success listeners run: they only ever see committed data
    await transaction?.commit();

    await Promise.all([
      emitCoreEvent("Webda.OperationSuccess", {
        context,
        operationId,
        subject: subjectOf(context, operationId, callArgs, result)
      })
      //emitCoreEvent(operationId, <any>context.getExtension("event") || {})
    ]);
  } catch (err) {
    // Roll back before the failure listeners run; a rollback error is logged and never hides the original error
    await transaction?.rollback(err);
    await Promise.all([
      emitCoreEvent("Webda.OperationFailure", {
        context,
        operationId,
        error: err,
        subject: subjectOf(context, operationId, callArgs)
      })
      //emitCoreEvent(`${operationId}.Failure`, <any>context.getExtension("event") || {})
    ]);
    throw err;
  } finally {
    context.setExtension("event", undefined);
    context.setExtension(DECLARED_SUBJECT, callerSubject);
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
  // Add the operation, defaulting input/output to "void" if not provided
  operations[operationId] = {
    ...definition,
    id: operationId,
    input: definition.input ?? "void",
    output: definition.output ?? "void"
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
   * Require the second factor to be verified within this duration (Duration syntax: `600`, `"10m"`)
   *
   * Implies a logged session with a verified second factor
   */
  maxMfaAge?: number | string;
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
   * Run the operation in a transaction of the registered participants, `false` to opt out
   */
  transaction?: boolean;
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
    // A subclass sees its parent's metadata through the prototype: copy it before adding, never push into the parent's
    if (!Object.hasOwn(context.metadata!, "webda.operations")) {
      context.metadata!["webda.operations"] = [...((context.metadata!["webda.operations"] as any[]) ?? [])];
    }
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
