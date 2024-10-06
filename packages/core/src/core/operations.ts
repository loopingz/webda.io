import { QueryValidator } from "@webda/ql";
import { OperationDefinition } from "./icore";

export function callOperation(operationId: string, parameters: any) {}

/**
 * Check if an operation can be executed with the current context
 * Not checking the input use `checkOperation` instead to check everything
 * @param context
 * @param operationId
 * @throws OperationError if operation is unknown
 * @returns true if operation can be executed
 */
function checkOperationPermission(context: OperationContext, operationId: string): boolean {
  if (!this.operations[operationId]) {
    throw new WebdaError.NotFound(`${operationId} Unknown`);
  }
  if (this.operations[operationId].permission) {
    this.operations[operationId].permissionQuery ??= new QueryValidator(this.operations[operationId].permission);
    return this.operations[operationId].permissionQuery.eval(context.getSession());
  }
  return true;
}

/**
 * Check if an operation can be executed with the current context
 * @param context
 * @param operationId
 */
async function checkOperation(context: OperationContext, operationId: string) {
  if (!this.checkOperationPermission(context, operationId)) {
    throw new WebdaError.Forbidden(`${operationId} PermissionDenied`);
  }
  try {
    if (this.operations[operationId].input) {
      const input = await context.getInput();
      if (input === undefined || this.validateSchema(this.operations[operationId].input, input) !== true) {
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
    if (this.operations[operationId].parameters) {
      this.validateSchema(this.operations[operationId].parameters, context.getParameters());
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
async function callOperation(context: OperationContext, operationId: string): Promise<void> {
  this.log("DEBUG", "Call operation", operationId);
  try {
    context.setExtension("operation", operationId);
    await this.checkOperation(context, operationId);
    context.setExtension("operationContext", this.operations[operationId].context || {});
    await Promise.all([
      this.emit("Webda.BeforeOperation", { context, operationId }),
      this.emit(`${operationId}.Before`, <any>context.getExtension("event") || {})
    ]);
    if (this.operations[operationId].service) {
      await this.getService(this.operations[operationId].service)[this.operations[operationId].method](context);
    } else if (this.operations[operationId].model) {
      await this.application.getModel(this.operations[operationId].model)[this.operations[operationId].method](context);
    } else {
      throw new Error(`${operationId} NoServiceOrModel`);
    }
    await Promise.all([
      this.emit("Webda.OperationSuccess", { context, operationId }),
      this.emit(operationId, <any>context.getExtension("event") || {})
    ]);
  } catch (err) {
    await Promise.all([
      this.emit("Webda.OperationFailure", { context, operationId, error: err }),
      this.emit(`${operationId}.Failure`, <any>context.getExtension("event") || {})
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
function listOperations(): { [key: string]: Omit<OperationDefinition, "service" | "method"> } {
  const list = {};
  Object.keys(this.operations).forEach(o => {
    list[o] = {
      ...this.operations[o]
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
function registerOperation(operationId: string, definition: Omit<OperationDefinition, "id">) {
  // Check operation naming convention
  if (!operationId.match(/^([A-Z][A-Za-z0-9]*\.)*([A-Z][a-zA-Z0-9]*)$/)) {
    throw new Error(`OperationId ${operationId} must match ^([A-Z][A-Za-z0-9]*.)*([A-Z][a-zA-Z0-9]*)$`);
  }

  // Check if service and method exist
  if (
    definition.model !== undefined &&
    (!this.application.getModel(definition.model) ||
      typeof this.application.getModel(definition.model)[definition.method] !== "function")
  ) {
    throw new Error(`Operation ${operationId} service ${definition.service} method ${definition.method} not found`);
  }
  if (
    definition.service !== undefined &&
    (!this.getService(definition.service) ||
      typeof this.getService(definition.service)[definition.method] !== "function")
  ) {
    throw new Error(`Operation ${operationId} service ${definition.service} method ${definition.method} not found`);
  }

  // Add the operation
  // We will want to cache operations for faster startup
  this.operations[operationId] = { ...definition, id: operationId };
  ["input", "output"]
    .filter(key => this.operations[operationId][key])
    .forEach(key => {
      if (!this.getApplication().hasSchema(this.operations[operationId][key])) {
        delete this.operations[operationId][key];
      }
    });
}
