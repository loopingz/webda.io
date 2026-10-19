import type { JSONSchema7 } from "json-schema";
import type { ModelDescriptor, ModelsManifest, OperationDescriptor, OperationsManifest } from "../client/types.js";
import type { SdkManifest, SdkManifestModel } from "../manifest.js";

/**
 * @param schema - a model schema
 * @returns the attributes formatted as dates
 */
export function dateAttributes(schema: JSONSchema7 | undefined): string[] {
  return Object.entries(schema?.properties ?? {})
    .filter(([, prop]) => typeof prop === "object" && (prop.format === "date-time" || prop.format === "date"))
    .map(([name]) => name);
}

/**
 * The runtime descriptor of a model
 * @param manifest - the manifest
 * @param model - the model
 * @returns the descriptor
 */
export function modelDescriptor(manifest: SdkManifest, model: SdkManifestModel): ModelDescriptor {
  const operations: ModelDescriptor["operations"] = { actions: {}, behaviors: {} };
  for (const id of model.operations) {
    const op = manifest.operations[id];
    if (!op) continue;
    switch (op.kind) {
      case "get":
      case "query":
      case "create":
      case "update":
      case "patch":
      case "delete":
        operations[op.kind] = id;
        break;
      case "action":
        if (op.action) operations.actions[op.action.name] = id;
        break;
      case "behavior":
        if (op.behavior) operations.behaviors[`${op.behavior.attribute}.${op.behavior.action}`] = id;
        break;
    }
  }
  const { relations } = model;
  return {
    id: model.id,
    shortName: model.shortName,
    plural: model.plural,
    primaryKey: model.primaryKey,
    ...(model.primaryKeySeparator ? { primaryKeySeparator: model.primaryKeySeparator } : {}),
    ancestors: model.ancestors,
    ...(relations.parent ? { parent: { attribute: relations.parent.attribute, model: relations.parent.model } } : {}),
    links: (relations.links ?? []).map(link => ({ attribute: link.attribute, model: link.model, type: link.type })),
    queries: (relations.queries ?? []).map(query => ({
      attribute: query.attribute,
      model: query.model,
      targetAttribute: query.targetAttribute ?? ""
    })),
    dates: dateAttributes(manifest.schemas[model.schema]),
    operations
  };
}

/**
 * The runtime descriptor of an operation: the manifest entry without the documentation
 * @param manifest - the manifest
 * @param id - operation id
 * @returns the descriptor
 */
export function operationDescriptor(manifest: SdkManifest, id: string): OperationDescriptor {
  const { summary, description, permission, deprecated, ...rest } = manifest.operations[id];
  void summary;
  void description;
  void permission;
  void deprecated;
  return rest;
}

/**
 * @param manifest - the manifest
 * @returns the runtime manifests of the operations and the models
 */
export function runtimeManifests(manifest: SdkManifest): { operations: OperationsManifest; models: ModelsManifest } {
  return {
    operations: Object.fromEntries(Object.keys(manifest.operations).map(id => [id, operationDescriptor(manifest, id)])),
    models: Object.fromEntries(
      Object.values(manifest.models).map(model => [model.id, modelDescriptor(manifest, model)])
    )
  };
}
