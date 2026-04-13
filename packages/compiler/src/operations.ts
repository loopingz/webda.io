import { JSONSchema7 } from "json-schema";
import { WebdaModule, ModelMetadata } from "./definition";
import { useLog } from "@webda/workout";

/**
 * Format for exported operations
 */
export interface OperationsExportFormat {
  operations: { [key: string]: OperationEntry };
  schemas: { [key: string]: JSONSchema7 };
}

export interface OperationEntry {
  id: string;
  input?: string;
  output?: string;
}

/**
 * Standard CRUD action names that map to DomainService operations
 */
const CRUD_ACTIONS = new Set(["create", "update", "delete", "get", "query"]);

/**
 * Generate operations from a WebdaModule
 *
 * This replicates at compile time what DomainService.initOperations() does at runtime.
 * It derives operations from model Actions metadata and service/bean operation schemas.
 *
 * @param mod The merged WebdaModule (including dependencies)
 * @returns OperationsExportFormat with operations and referenced schemas
 */
export function generateOperations(mod: WebdaModule): OperationsExportFormat {
  const result: OperationsExportFormat = {
    operations: {},
    schemas: {}
  };

  // Process model operations
  if (mod.models) {
    for (const modelKey of Object.keys(mod.models)) {
      processModelOperations(mod, modelKey, mod.models[modelKey], result);
    }
  }

  // Process service/bean operations from schemas
  processServiceOperations(mod, result);

  return result;
}

/**
 * Process operations for a single model
 * @param mod - the Webda module
 * @param modelKey - the model identifier
 * @param model - the model metadata
 * @param result - the result to populate
 */
function processModelOperations(
  mod: WebdaModule,
  modelKey: string,
  model: ModelMetadata,
  result: OperationsExportFormat
) {
  const shortId = modelKey.split("/").pop();
  const plural = model.Plural || shortId + "s";
  const actions = model.Actions || {};
  const actionNames = Object.keys(actions);

  if (actionNames.length === 0) {
    return;
  }

  // CRUD operations
  for (const action of actionNames) {
    if (!CRUD_ACTIONS.has(action)) {
      continue;
    }
    const capitalized = action.charAt(0).toUpperCase() + action.slice(1);

    switch (action) {
      case "create":
        addOperation(result, `${shortId}.${capitalized}`, {
          output: modelKey
        });
        addModelSchema(mod, modelKey, result);
        break;
      case "update":
        addOperation(result, `${shortId}.${capitalized}`, {
          input: "uuidRequest",
          output: modelKey
        });
        // Also add Patch operation
        addOperation(result, `${shortId}.Patch`, {
          input: "uuidRequest"
        });
        addModelSchema(mod, modelKey, result);
        break;
      case "delete":
        addOperation(result, `${shortId}.${capitalized}`, {
          input: "uuidRequest"
        });
        break;
      case "get":
        addOperation(result, `${shortId}.${capitalized}`, {
          input: "uuidRequest",
          output: modelKey
        });
        addModelSchema(mod, modelKey, result);
        break;
      case "query":
        addOperation(result, `${plural}.Query`, {
          input: "searchRequest"
        });
        break;
    }
  }

  // Custom action operations
  for (const action of actionNames) {
    if (CRUD_ACTIONS.has(action)) {
      continue;
    }
    const capitalized = action.charAt(0).toUpperCase() + action.slice(1);
    const id = `${shortId}.${capitalized}`;
    const inputSchema = `${modelKey}.${action}.input`;
    const outputSchema = `${modelKey}.${action}.output`;

    const entry: Partial<OperationEntry> = {};
    // Instance actions require a uuid; global (static) ones use their own input schema
    if (!actions[action].global) {
      entry.input = "uuidRequest";
    } else if (mod.schemas?.[inputSchema]) {
      entry.input = inputSchema;
      result.schemas[inputSchema] = mod.schemas[inputSchema];
    }
    if (mod.schemas?.[outputSchema]) {
      entry.output = outputSchema;
      result.schemas[outputSchema] = mod.schemas[outputSchema];
    }
    addOperation(result, id, entry);
  }
}

/**
 * Process service and bean operations from schema naming convention
 *
 * Operations on services/beans are detected by schemas following the pattern:
 * {ClassName}.{methodName}.input / {ClassName}.{methodName}.output
 * @param mod - the Webda module
 * @param result - the result to populate
 */
function processServiceOperations(mod: WebdaModule, result: OperationsExportFormat) {
  if (!mod.schemas) {
    return;
  }

  // Collect all service/bean class names (short names without namespace)
  const serviceClasses = new Set<string>();
  for (const key of Object.keys(mod.beans || {})) {
    serviceClasses.add(key.split("/").pop());
  }
  for (const key of Object.keys(mod.moddas || {})) {
    serviceClasses.add(key.split("/").pop());
  }

  // Find operation schemas that belong to services/beans (not models)
  // Pattern: {ClassName}.{methodName}.input
  const operationPattern = /^([^.]+)\.([^.]+)\.(input|output)$/;
  const detectedOps = new Map<string, { input?: string; output?: string }>();

  for (const schemaName of Object.keys(mod.schemas)) {
    const match = schemaName.match(operationPattern);
    if (!match) {
      continue;
    }
    const [, className, methodName, kind] = match;

    // Only process if this class is a known service/bean
    if (!serviceClasses.has(className)) {
      continue;
    }

    const capitalized = methodName.charAt(0).toUpperCase() + methodName.slice(1);
    const opId = `${className}.${capitalized}`;

    if (!detectedOps.has(opId)) {
      detectedOps.set(opId, {});
    }
    const op = detectedOps.get(opId);
    op[kind] = schemaName;
  }

  // Register detected operations
  for (const [opId, schemas] of detectedOps) {
    const entry: Partial<OperationEntry> = {};
    if (schemas.input) {
      entry.input = schemas.input;
      result.schemas[schemas.input] = mod.schemas[schemas.input];
    }
    if (schemas.output) {
      entry.output = schemas.output;
      result.schemas[schemas.output] = mod.schemas[schemas.output];
    }
    addOperation(result, opId, entry);
  }
}

/**
 * Add an operation to the result
 * @param result - the operations result
 * @param id - the operation identifier
 * @param entry - the operation entry data
 */
function addOperation(result: OperationsExportFormat, id: string, entry: Partial<OperationEntry>) {
  result.operations[id] = {
    id,
    ...entry
  } as OperationEntry;
  useLog("DEBUG", `Registered operation: ${id}`);
}

/**
 * Add model schema to the result if available
 * @param mod - the Webda module
 * @param modelKey - the model identifier
 * @param result - the operations result
 */
function addModelSchema(mod: WebdaModule, modelKey: string, result: OperationsExportFormat) {
  const model = mod.models?.[modelKey];
  if (model?.Schemas?.Input) {
    result.schemas[modelKey] ??= model.Schemas.Input;
  }
}
