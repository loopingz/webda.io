import { QueryValidator } from "@webda/ql";
import { OperationDefinition, OperationDefinitionInfo } from "./icore.js";
import { OperationContext } from "../contexts/operationcontext.js";
import * as WebdaError from "../errors/errors.js";
import { validateSchema, ValidationError } from "../schemas/hooks.js";
import { useInstanceStorage } from "./instancestorage.js";
import { useApplication, useModel } from "../application/hooks.js";
import { useDynamicService, useService } from "./hooks.js";
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
 * Check if an operation can be executed with the current context
 * @param context - the execution context
 * @param operationId - the operation identifier
 */
async function checkOperation(context: OperationContext, operationId: string) {
  const operations = useInstanceStorage().operations;
  if (!checkOperationPermission(context, operationId, operations[operationId])) {
    throw new WebdaError.Forbidden(`${operationId} PermissionDenied`);
  }
  try {
    if (operations[operationId].input) {
      const input = await context.getInput();
      if (input === undefined || validateSchema(operations[operationId].input, input) !== true) {
        throw new WebdaError.BadRequest(`${operationId} InvalidInput Empty input`);
      }
    }
  } catch (err) {
    if (err instanceof ValidationError) {
      throw new WebdaError.BadRequest(`${operationId} InvalidInput ${err.errors.map(e => e.message).join("; ")}`);
    }
    throw err;
  }
  try {
    if (operations[operationId].parameters) {
      validateSchema(operations[operationId].parameters, context.getParameters());
    }
  } catch (err) {
    if (err instanceof ValidationError) {
      throw new WebdaError.BadRequest(`${operationId} InvalidParameters ${err.errors.map(e => e.message).join("; ")}`);
    }
    throw err;
  }
}

/**
 * Resolve method arguments from the OperationContext using the operation's input/parameters schema metadata.
 *
 * When both `parameters` and `input` schemas are resolvable via the application schema registry,
 * the parameters schema properties are extracted from URL/query params first, then the request
 * body is appended as the next argument. This supports signatures like `method(uuid: string, body: any)`.
 *
 * When only an `input` schema exists, properties are merged from params and body, then
 * extracted in schema property order.
 *
 * When only a `parameters` schema exists, its properties are extracted from URL/query params.
 *
 * @param context - the execution context
 * @param operation - the operation definition
 * @returns an array of resolved arguments to pass to the operation method
 */
export async function resolveArguments(context: OperationContext, operation: OperationDefinition): Promise<any[]> {
  const params = context.getParameters() || {};
  let input: any;
  try {
    input = await context.getInput();
  } catch {
    // No input (e.g., GET request)
  }

  const app = useApplication();

  // When both parameters and input schemas are resolvable, extract params then append body.
  // This supports methods like modelUpdate(uuid: string, body: any).
  if (operation.parameters && operation.input) {
    const paramsSchema = app.getSchema(operation.parameters);
    const inputSchema = app.getSchema(operation.input);
    if (paramsSchema?.properties && inputSchema) {
      const paramArgs = Object.keys(paramsSchema.properties).map(name => params[name]);
      // Append the whole body as the next argument
      return [...paramArgs, input];
    }
  }

  // When only parameters schema is resolvable (no input), extract params by schema property names.
  // This supports methods like modelGet(uuid: string) and modelQuery(query: string).
  if (operation.parameters && !operation.input) {
    const paramsSchema = app.getSchema(operation.parameters);
    if (paramsSchema?.properties) {
      return Object.keys(paramsSchema.properties).map(name => params[name]);
    }
  }

  // Merge: params + body (body overrides params for same keys)
  const merged = { ...params, ...(typeof input === "object" && input !== null ? input : {}) };

  // Use input schema properties to determine argument order
  if (operation.input) {
    const schema = app.getSchema(operation.input);
    if (schema?.properties) {
      const propNames = Object.keys(schema.properties);
      if (propNames.length === 1) {
        const key = propNames[0];
        // Single param: extract if key matches, otherwise pass whole input
        if (key in merged && Object.keys(merged).length <= Object.keys(params).length + 1) {
          return [merged[key]];
        }
        return [typeof input === "object" && input !== null ? input : merged];
      }
      // Multiple params: extract by name in schema order
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
    const callArgs = args.length > 0 ? args : [context];

    // Call the method with resolved arguments, wrapped in runWithContext
    // so that useContext() returns the operation context inside the method.
    let result: any;
    if (operations[operationId].service) {
      result = await runWithContext(context, () =>
        useService(operations[operationId].service as any)[operations[operationId].method](...callArgs)
      );
    } else if (operations[operationId].model) {
      result = await runWithContext(context, () =>
        useModel(operations[operationId].model)[operations[operationId].method](...callArgs)
      );
    } else {
      throw new Error(`${operationId} NoServiceOrModel`);
    }

    // Handle return value
    if (result !== undefined && result !== null) {
      if (typeof result[Symbol.asyncIterator] === "function") {
        // AsyncGenerator — stream each yielded value
        for await (const chunk of result) {
          context.write(chunk);
        }
      } else {
        // Normal return — write to context
        context.write(result);
      }
    }

    await Promise.all([
      emitCoreEvent("Webda.OperationSuccess", { context, operationId })
      //emitCoreEvent(operationId, <any>context.getExtension("event") || {})
    ]);
  } catch (err) {
    await Promise.all([
      emitCoreEvent("Webda.OperationFailure", { context, operationId, error: err })
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
 * Register a new operation within the app
 * @param operationId - the operation identifier
 * @param definition - the definition object
 */
export function registerOperation(operationId: string, definition: Omit<OperationDefinition, "id">) {
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
  // Add the operation
  // We will want to cache operations for faster startup
  operations[operationId] = { ...definition, id: operationId } as OperationDefinitionInfo;
  ["input", "output"]
    .filter(key => operations[operationId][key])
    .forEach(key => {
      if (!useApplication().getSchema(operations[operationId][key])) {
        delete operations[operationId][key];
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
    return function operationWrapper(this: any, ...args) {
      return target.call(this, ...args);
    };
  };
  if (args.length === 2 && args[1] instanceof Object && args[1].kind === "method") {
    return annotate(args[0], args[1]);
  }
  return (target: any, context: ClassMethodDecoratorContext) => {
    return annotate(target, context, args[0]);
  };
}

export { Operation };
