import { QueryValidator } from "@webda/ql";
import { OperationDefinition } from "./icore.js";
import { OperationContext } from "../contexts/operationcontext.js";
import * as WebdaError from "../errors/errors.js";
import { ValidationError } from "../schemas/hooks.js";
import { useInstanceStorage } from "./instancestorage.js";
import { useApplication, useModel } from "../application/hooks.js";
import { useService } from "./hooks.js";
import { emitCoreEvent } from "../events/events.js";
import { isGeneratorFunction } from "node:util/types";
import { AnyMethod } from "@webda/decorators";
import { Service } from "../services/service.js";
import { Model } from "@webda/models";
import { Behavior } from "../models/behavior.js";
import { useContext } from "../contexts/execution.js";
import { useLog } from "@webda/workout";

/**
 * Check if an operation can be executed with the current context
 * Not checking the input use `checkOperation` instead to check everything
 * @param context
 * @param operationId
 * @throws OperationError if operation is unknown
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
 * @param context
 * @param operationId
 */
async function checkOperation(context: OperationContext, operationId: string) {
  const operations = useInstanceStorage().operations;
  if (!checkOperationPermission(context, operationId, operations[operationId])) {
    throw new WebdaError.Forbidden(`${operationId} PermissionDenied`);
  }
  try {
    if (operations[operationId].input) {
      const input = await context.getInput();
      if (input === undefined || this.validateSchema(operations[operationId].input, input) !== true) {
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
      this.validateSchema(operations[operationId].parameters, context.getParameters());
    }
  } catch (err) {
    if (err instanceof ValidationError) {
      throw new WebdaError.BadRequest(`${operationId} InvalidParameters ${err.errors.map(e => e.message).join("; ")}`);
    }
    throw err;
  }
}

/**
 * Call an operation within the framework
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
    if (operations[operationId].service) {
      await this.getService(operations[operationId].service)[operations[operationId].method](context);
    } else if (operations[operationId].model) {
      await this.application.getModel(operations[operationId].model)[operations[operationId].method](context);
    } else {
      throw new Error(`${operationId} NoServiceOrModel`);
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
 * @returns
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
 * @param operationId
 * @param definition
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
    const service = useService(definition.service);
    if (!service || typeof service[definition.method] !== "function") {
      throw new Error(`Operation ${operationId} service ${definition.service} method ${definition.method} not found`);
    }
  } else {
    throw new Error(`Operation ${operationId} must have a service or a model`);
  }
  const operations = useInstanceStorage().operations;
  // Add the operation
  // We will want to cache operations for faster startup
  operations[operationId] = { ...definition, id: operationId };
  ["input", "output"]
    .filter(key => operations[operationId][key])
    .forEach(key => {
      if (!useApplication().getSchema(operations[operationId][key])) {
        delete operations[operationId][key];
      }
    });
}

export interface RestParameters {
  rest?:
    | false
    | {
        method: "get" | "post" | "put" | "delete" | "patch";
        path: string;
        responses?: {
          [statusCode: string]: {
            description?: string;
            content?: {
              [mediaType: string]: any;
            };
          };
        };
      };
}
export interface GrpcParameters {
  grpc?:
    | false
    | {
        streaming?: "none" | "client" | "server" | "bidi";
      };
}
export interface GraphQLParameters {
  graphql?:
    | false
    | {
        query?: string;
        mutation?: string;
        subscription?: string;
      };
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
  summary?: string;
  description?: string;
  tags?: string[];
  hidden?: boolean;
  deprecated?: boolean;
  /**
   * Permission query to check before executing the operation
   */
  permissionQuery?: string;
}

function Operation<T = {}>(
  options?: T & OperationParameters
): (
  target: any,
  context: ClassMethodDecoratorContext<Service | Model | Behavior | typeof Service | typeof Model>
) => void;
function Operation(
  target: any,
  context: ClassMethodDecoratorContext<Service | Model | Behavior | typeof Service | typeof Model>
): void;
function Operation(...args: any[]) {
  const annotate = (
    target: AnyMethod,
    context: ClassMethodDecoratorContext<Service | Model | Behavior | typeof Service | typeof Model>,
    options: any = {}
  ) => {
    context.metadata!["webda.operations"] ??= [];
    (context.metadata!["webda.operations"] as any[]).push({
      id: context.name,
      ...options,
      static: context.static,
      generator: isGeneratorFunction(target)
    });
    return (...args) => {
      // TODO Make sure if an Operation is called we launch it with Core to get listeners
      // it would also enforce permission checks and audit logs
      const executionContext = useContext() as OperationContext;
      let currentOperation = executionContext.getExtension("operation");
      if (!currentOperation) {
        // How to get the operation name here ?
        callOperation(executionContext, `Unknown.${context.name as string}`);
        
      }
      const res = target(...args);
      return res;
    };
  };
  if (args.length === 2 && args[1] instanceof Object && args[1].kind === "method") {
    return annotate(args[0], args[1]);
  }
  return (
    target: any,
    context: ClassMethodDecoratorContext<Service | Model | Behavior | typeof Service | typeof Model>
  ) => {
    return annotate(target, context, args[0]);
  };
}

export { Operation };
