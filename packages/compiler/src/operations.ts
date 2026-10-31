import { JSONSchema7 } from "json-schema";
import { WebdaModule, ModelMetadata } from "./definition.js";
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
  input: string;
  output: string;
  rest?: { method: string; path: string; body?: string };
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

  const pkFields = model.PrimaryKey?.length ? model.PrimaryKey : ["uuid"];

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
    // Instance actions take the object uuid then their parameters; global (static) ones their own input schema
    if (!actions[action].global) {
      if (mod.schemas?.[inputSchema]) {
        entry.input = `${modelKey}.${action}.request`;
        result.schemas[entry.input] = actionRequestSchema(`${modelKey}.${action}`, mod.schemas[inputSchema], pkFields);
      } else {
        entry.input = `${modelKey}.primaryKey`;
        result.schemas[entry.input] = actionRequestSchema(
          `${modelKey}.${action}`,
          { type: "object", properties: {} },
          pkFields
        );
      }
    } else if (mod.schemas?.[inputSchema]) {
      entry.input = inputSchema;
      result.schemas[inputSchema] = mod.schemas[inputSchema];
    }
    if (mod.schemas?.[outputSchema]) {
      entry.output = outputSchema;
      result.schemas[outputSchema] = mod.schemas[outputSchema];
    }
    entry.rest = actionRest(
      actions[action],
      action,
      mod.schemas?.[inputSchema],
      actions[action].global ? [] : pkFields
    );
    addOperation(result, id, entry);
  }

  for (const relation of model.Relations?.behaviors ?? []) {
    const behavior = mod.behaviors?.[relation.behavior];
    for (const [action, metadata] of Object.entries(behavior?.Actions ?? {})) {
      const input = mod.schemas?.[`${relation.behavior}.${action}.input`] ?? { type: "object", properties: {} };
      const request = `${modelKey}.${relation.attribute}.${action}.request`;
      result.schemas[request] = actionRequestSchema(`${relation.behavior}.${action}`, input, pkFields);
      const output = `${relation.behavior}.${action}.output`;
      if (mod.schemas?.[output]) result.schemas[output] = mod.schemas[output];
      const route = metadata.rest?.path ?? metadata.rest?.route;
      const suffix =
        route === "."
          ? relation.attribute
          : route
            ? `${relation.attribute}/${route}`
            : `${relation.attribute}.${action}`;
      addOperation(result, `${shortId}.${capitalize(relation.attribute)}.${capitalize(action)}`, {
        input: request,
        output: mod.schemas?.[output] ? output : "void",
        rest: actionRest({ ...metadata, rest: { ...metadata.rest, path: suffix } }, action, input, pkFields)
      });
    }
  }
}

/**
 * REST hint of an exported operation, with implicit primary keys and GET/DELETE query fields.
 * @param action - action metadata
 * @param name - action name
 * @param input - method parameters
 * @param keys - implicit primary key fields
 * @returns REST hint
 */
function actionRest(
  action: any,
  name: string,
  input: JSONSchema7 | undefined,
  keys: string[] = []
): OperationEntry["rest"] {
  const hint = action.rest ?? {};
  const method = String(hint.method ?? action.methods?.[0] ?? action.method ?? "put").toLowerCase();
  let path = hint.path ?? name;
  const missing = keys.filter(key => !path.includes(`{${key}}`));
  if (missing.length) path = missing.map(key => `{${key}}`).join("/") + "/" + path;
  if (["get", "delete"].includes(method)) {
    const binding = (input as any)?.["x-webda-rest"];
    const query: { name: string; required?: boolean; catchAll?: boolean }[] =
      binding?.query ??
      Object.keys(input?.properties ?? {})
        .filter(key => !path.includes(`{${key}}`))
        .map(key => ({ name: key, required: input?.required?.includes(key) }));
    if (query.length)
      path =
        path.split("{?")[0] +
        "{?" +
        query.map(q => q.name + (q.catchAll ? (q.required ? "+" : "*") : q.required ? "" : "?")).join(",") +
        "}";
  }
  return { method, path, ...(hint.body ? { body: hint.body } : {}) };
}

/**
 * @param name - method or attribute name
 * @returns capitalized name
 */
function capitalize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Input schema of an instance action operation: the object `uuid` then the action parameters
 *
 * Mirrors `DomainService.actionRequestSchema` in `@webda/core`.
 * @param id - `<model>.<action>`, for the error message
 * @param input - the action `.input` schema
 * @param keys - implicit primary key fields
 * @returns the request schema
 * @throws Error when an action parameter is named `uuid`
 */
function actionRequestSchema(id: string, input: JSONSchema7, keys: string[] = ["uuid"]): JSONSchema7 {
  const conflict = keys.find(key => input.properties?.[key] !== undefined);
  if (conflict) {
    // The uuid identifies the object: a parameter with the same name would receive it, or break the schema
    throw new Error(
      `${id}: parameter "${conflict}" conflicts with the object primary key, rename the action parameter`
    );
  }
  const args = (input as Record<string, unknown>)["x-webda-arguments"] as string[] | undefined;
  return {
    ...input,
    type: "object",
    properties: { ...Object.fromEntries(keys.map(key => [key, { type: "string" }])), ...input.properties },
    required: [...keys, ...(input.required ?? [])],
    "x-webda-arguments": [...keys, ...(args ?? Object.keys(input.properties ?? {}))]
  } as JSONSchema7;
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
    serviceClasses.add(key.split("/").at(-1) ?? key);
  }
  for (const key of Object.keys(mod.moddas || {})) {
    serviceClasses.add(key.split("/").at(-1) ?? key);
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

    const op = detectedOps.get(opId) ?? {};
    if (kind === "input") op.input = schemaName;
    else op.output = schemaName;
    detectedOps.set(opId, op);
  }

  // Register detected operations
  for (const [opId, schemas] of detectedOps) {
    const entry: Partial<OperationEntry> = {};
    if (schemas.input) {
      entry.input = schemas.input;
      result.schemas[schemas.input] = mod.schemas[schemas.input];
      const binding: any = (mod.schemas[schemas.input] as any)["x-webda-rest"];
      if (binding)
        entry.rest = actionRest(
          { rest: { method: binding.method, path: binding.template, body: binding.bodyParameter } },
          "",
          mod.schemas[schemas.input]
        );
    }
    if (schemas.output) {
      entry.output = schemas.output;
      result.schemas[schemas.output] = mod.schemas[schemas.output];
    }
    // addOperation defaults missing input/output to "void"
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
    input: "void",
    output: "void",
    ...entry
  };
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
