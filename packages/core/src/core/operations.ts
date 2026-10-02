import { QueryValidator } from "@webda/ql";
import { OperationDefinition, OperationDefinitionInfo } from "./icore.js";
import { OperationContext } from "../contexts/operationcontext.js";
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
import { runWithContext } from "../contexts/execution.js";

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
function checkOperationPermission(
  context: OperationContext,
  operationId: string,
  operation?: OperationDefinition & { permissionQuery?: QueryValidator }
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
  } else {
    const input = context.getExtension<any>("operationResolvedInput") ?? context.getParameters() ?? {};
    // Behavior operations (Post.MainImage.Attach) route the key as `{uuid}` whatever the
    // model's real primary key field is, and register no pkFields
    key = serializeSubjectKey(pkFields, pkFields.length === 1 ? (input[pkFields[0]] ?? input.uuid) : input);
  }
  if (key === undefined && result && typeof result.getPrimaryKey === "function") {
    // Create: the key only exists once the object is saved
    key = serializeSubjectKey(pkFields, result.getPrimaryKey());
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
 * Coerce string-shaped path/query params to the primitive type their schema
 * declares. URL slots arrive as strings even when the operation method
 * expects a number/boolean (e.g. `setMetadata(index: number, ...)` mounted
 * at `{index}/{hash}` — `index` is the literal `"0"` until we coerce).
 *
 * We mutate `merged` in place (caller forwards the same object to
 * `resolveArguments`). We do NOT use AJV's `coerceTypes` flag because that
 * setting on the singleton AJV instance flips a global mode and silently
 * widens type validation across every other call site (e.g. coercing
 * `123` → `"123"` to satisfy a `string` schema), which is the wrong default
 * for model validation.
 * @param schema - operation input schema with `properties` describing the
 * expected primitive types
 * @param merged - merged params + body object to coerce in place
 */
function coerceMergedToSchema(schema: any, merged: Record<string, any>): void {
  if (!schema?.properties) return;
  for (const [name, propSchema] of Object.entries(schema.properties as Record<string, any>)) {
    const value = merged[name];
    if (typeof value !== "string") continue;
    const target = (propSchema as any)?.type;
    if (target === "number" || target === "integer") {
      const n = Number(value);
      if (!Number.isNaN(n)) merged[name] = n;
    } else if (target === "boolean") {
      if (value === "true") merged[name] = true;
      else if (value === "false") merged[name] = false;
    }
  }
}

/**
 * Check if an operation can be executed with the current context.
 * @param context - the execution context
 * @param operationId - the operation identifier
 */
async function checkOperation(context: OperationContext, operationId: string) {
  const operations = useInstanceStorage().operations;
  if (!checkOperationPermission(context, operationId, operations[operationId])) {
    throw new WebdaError.Forbidden(`${operationId} PermissionDenied`);
  }
  try {
    if (operations[operationId].input && operations[operationId].input !== "void") {
      // Validate the merged (path params + request body) against the input schema.
      // Path params (e.g., {uuid}, {hash}) are provided via context.getParameters()
      // and must be merged with the body before validation because schemas like
      // uuidRequest and binaryHashRequest declare them as required properties.
      const params = context.getParameters() || {};
      let body: any;
      try {
        body = await context.getInput();
      } catch {
        // No body (e.g., GET request) — skip validation
      }
      // Merge path params with body (body overrides params for same keys)
      const merged = { ...params, ...(typeof body === "object" && body !== null ? body : {}) };
      // Coerce string path params (e.g. `"0"`) to the primitive type the
      // schema declares before validation runs, so AJV doesn't reject
      // `index: "0"` against `{ type: "number" }`. Mutates `merged` in
      // place so `resolveArguments` sees the typed value too.
      const app = useApplication();
      const inputSchema = app.getSchema(operations[operationId].input);
      coerceMergedToSchema(inputSchema, merged);
      validateSchema(operations[operationId].input, merged);
      context.setExtension("operationResolvedInput", merged);
    }
  } catch (err) {
    if (err instanceof ValidationError) {
      // Include the failing attribute path (AJV `instancePath`) in the human
      // message so the client can tell *which* field is invalid; attach the
      // raw `errors[]` as structured `details` so consumers can map errors
      // to fields without parsing the string.
      const summary = err.errors
        .map(e => {
          const path = e.instancePath || (e.params && (e.params as any).missingProperty
            ? `/${(e.params as any).missingProperty}`
            : "/");
          return `${path} ${e.message}`;
        })
        .join("; ");
      throw new WebdaError.BadRequest(`${operationId} InvalidInput: ${summary}`, {
        errors: err.errors
      });
    }
    throw err;
  }
}

/**
 * Resolve method arguments from the OperationContext using the operation's input schema metadata.
 *
 * The REST transport merges path/query params into the context so that `context.getParameters()`
 * contains URL-derived values (e.g., `{uuid}`) while `context.getInput()` contains the request
 * body. This function merges both sources (body overrides params) and extracts arguments based
 * on the `input` schema property names and order.
 *
 * @param context - the execution context
 * @param operation - the operation definition
 * @returns an array of resolved arguments to pass to the operation method
 */
export async function resolveArguments(context: OperationContext, operation: OperationDefinition): Promise<any[]> {
  // Prefer the merged-and-coerced object that `checkOperation` left on the
  // context. Re-merging here would discard AJV's `coerceTypes` rewrites
  // (e.g. string `"0"` from a `{index}` URL slot back to a `number`).
  // Falls back to a fresh merge for code paths that bypass `checkOperation`
  // (currently only `Test.Op` unit tests).
  let merged = context.getExtension<any>("operationResolvedInput");
  let input: any;
  try {
    input = await context.getInput();
  } catch {
    // No input (e.g., GET request)
  }
  if (!merged) {
    const params = context.getParameters() || {};
    merged = { ...params, ...(typeof input === "object" && input !== null ? input : {}) };
  }

  // Use input schema properties to determine argument order
  if (operation.input && operation.input !== "void") {
    const app = useApplication();
    const schema = app.getSchema(operation.input);
    if (schema?.properties) {
      const propNames = Object.keys(schema.properties);
      // Extract values by schema property names from the merged params + body
      return propNames.map(name => merged[name]);
    }
  }

  // No schema: pass input as single arg if present
  if (input !== undefined && input !== null) {
    return [input];
  }
  return [];
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
  try {
    context.setExtension("operation", operationId);
    await checkOperation(context, operationId);
    context.setExtension("operationContext", operations[operationId].context || {});
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
      if (operations[operationId].static === false) {
        // Instance method — load the model instance and call the method on it
        // The first argument should be the primary key (uuid)
        const uuid = callArgs[0];
        result = await runWithContext(context, async () => {
          const instance = await modelClass.ref(uuid).get();
          if (!instance || (instance as any).isDeleted?.()) {
            throw new WebdaError.NotFound("Object not found");
          }
          return instance[operations[operationId].method](...callArgs.slice(1));
        });
      } else {
        // Static/class method — call on the model class directly
        result = await runWithContext(context, () =>
          modelClass[operations[operationId].method](...callArgs)
        );
      }
    } else {
      throw new Error(`${operationId} NoServiceOrModel`);
    }

    // Handle return value — only write if the method hasn't already
    // written to the context (avoid duplicating the response body when
    // both the method and callOperation try to write the same value).
    if (result !== undefined && result !== null) {
      if (typeof result[Symbol.asyncIterator] === "function") {
        // AsyncGenerator — stream each yielded value
        for await (const chunk of result) {
          context.write(chunk);
        }
      } else if (context.getOutput() === undefined) {
        // Normal return — write to context only if nothing written yet
        context.write(result);
      }
    }

    await Promise.all([
      emitCoreEvent("Webda.OperationSuccess", {
        context,
        operationId,
        subject: subjectOf(context, operationId, callArgs, result)
      })
      //emitCoreEvent(operationId, <any>context.getExtension("event") || {})
    ]);
  } catch (err) {
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
export function registerOperation(operationId: string, definition: Omit<OperationDefinition, "id" | "input" | "output"> & { input?: string; output?: string }) {
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
}

function Operation<T = {}>(
  options?: T & OperationParameters
): (target: (this: OperationTarget, ...args: any) => any, context: ClassMethodDecoratorContext) => void;
function Operation(
  target: (this: OperationTarget, ...args: any) => any,
  context: ClassMethodDecoratorContext
): void;
/**
 * Decorator that registers a class method as an operation with optional configuration
 * @param args - additional arguments
 * @returns the result
 */
function Operation(...args: any[]) {
  const annotate = (
    target: AnyMethod,
    context: ClassMethodDecoratorContext,
    options: any = {}
  ) => {
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
