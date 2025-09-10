import { QueryValidator } from "@webda/ql";
import { OperationDefinition } from "./icore";
import { OperationContext } from "../contexts/operationcontext";
import * as WebdaError from "../errors/errors";
import { ValidationError } from "../schemas/hooks";
import { useInstanceStorage } from "./instancestorage";
import { useModel } from "../application/hooks";
import { useService } from "./hooks";
import { emitCoreEvent } from "../events/events";

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
  this.log("DEBUG", "Call operation", operationId);
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
      if (!this.getApplication().hasSchema(operations[operationId][key])) {
        delete operations[operationId][key];
      }
    });
}
