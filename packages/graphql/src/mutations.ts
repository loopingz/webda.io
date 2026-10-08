import {
  checkModelParent,
  checkModelPermission,
  checkModelReparent,
  createModel,
  getParentRelation,
  loadModelForAction,
  prepareCreateInput,
  sanitizeModelInput,
  useModelMetadata,
  WebdaError
} from "@webda/core";
import type { ModelGraph } from "@webda/compiler";
import { GraphQLError } from "graphql";

/**
 * @returns the GraphQL error of a refused mutation
 */
function permissionDenied(): GraphQLError {
  return new GraphQLError("Permission denied", {
    extensions: {
      code: "PERMISSION_DENIED"
    }
  });
}

/**
 * @returns the GraphQL error of a missing object, also used for an object the caller may not read
 */
export function notFound(): GraphQLError {
  return new GraphQLError("Object not found", {
    extensions: {
      code: "NOT_FOUND"
    }
  });
}

/**
 * Run a core permission check, turning its WebdaErrors into the GraphQL errors of this module
 * @param check - the core check
 * @returns what the check returns
 */
export async function asGraphQL<T>(check: () => Promise<T>): Promise<T> {
  try {
    return await check();
  } catch (err) {
    if (err instanceof WebdaError.NotFound) {
      throw notFound();
    }
    if (err instanceof WebdaError.Forbidden || err instanceof WebdaError.Unauthorized) {
      throw permissionDenied();
    }
    throw err;
  }
}

/**
 * Load an object for an action as the caller, with the core rules (the model's static `canAct`, deny by default): a
 * missing object and an object the caller may not read answer the same NOT_FOUND error; an object the caller may
 * read but not act on answers PERMISSION_DENIED
 * @param model - model class
 * @param uuid - primary key
 * @param context - request context
 * @param action - the action ("get", "update", "delete"...)
 * @returns the object
 */
export async function loadForAction(model: any, uuid: any, context: any, action: string): Promise<any> {
  return asGraphQL(() => loadModelForAction(model, uuid, context, action));
}

/**
 * Whether a model attribute is part of the generated GraphQL input type: private (`__`), server-managed (`_`) and
 * behavior attributes can only be changed server-side (or through the behavior's own actions)
 * @param attribute - attribute name
 * @param graph - relations of the model
 * @param writable - `_`-prefixed attributes the model accepts from clients (`getClientWritableAttributes()`)
 * @returns true when clients may send it
 */
export function isInputAttribute(attribute: string, graph?: ModelGraph, writable: string[] = []): boolean {
  if (attribute.startsWith("__") || (attribute.startsWith("_") && !writable.includes(attribute))) {
    return false;
  }
  return !(graph?.behaviors ?? []).some(b => b.attribute === attribute);
}

/**
 * Create mutation: the client input is sanitized like the REST create (behavior and `__` fields removed)
 * @param model - model class
 * @param input - client input
 * @param context - request context
 * @returns the created object
 * @throws GraphQLError PERMISSION_DENIED when the object refuses the create
 */
export async function createFromInput(model: any, input: any, context: any): Promise<any> {
  // Same input rules as the REST create: sanitized, parent link kept, client uuid ignored for UuidModels
  const data: any = prepareCreateInput(model, input ?? {});
  const object = new model();
  object.load(data);
  // The parent must exist and be readable: an unreadable parent answers like a missing one
  await asGraphQL(() => checkModelParent(model, data?.[getParentRelation(model)?.attribute ?? ""], context));
  // Let the model set its server-managed fields (e.g. the owner) from the caller, like the REST create
  await object.prepareCreate?.(context);
  // The same check as the REST create: the model's static canAct, a throwing canAct refuses
  await asGraphQL(() => checkModelPermission(object, context, "create", model));
  try {
    // Create, never upsert: an existing key must not be overwritten
    await createModel(object);
  } catch (err) {
    if (err instanceof WebdaError.Conflict) {
      throw new GraphQLError("Object already exists", { extensions: { code: "CONFLICT" } });
    }
    throw err;
  }
  return object;
}

/**
 * @param model - model class
 * @returns its primary key fields (from the application metadata), `["uuid"]` when unknown
 */
function primaryKeyFields(model: any): string[] {
  try {
    const fields = useModelMetadata(model)?.PrimaryKey;
    return fields?.length ? fields : ["uuid"];
  } catch {
    return ["uuid"];
  }
}

/**
 * Update mutation: like the REST update, the sanitized input is loaded onto the stored object, so the stored
 * behavior state is kept
 * @param model - model class
 * @param uuid - primary key
 * @param input - client input
 * @param context - request context
 * @returns the updated object
 * @throws GraphQLError PERMISSION_DENIED when the object refuses the update
 */
export async function updateFromInput(model: any, uuid: string, input: any, context: any): Promise<any> {
  input = sanitizeModelInput(model, input ?? {});
  // The key comes from the arguments: a body carrying another key would write over that other object
  for (const field of primaryKeyFields(model)) {
    if (input[field] !== undefined && String(input[field]) !== String(uuid)) {
      throw new GraphQLError("Primary key mismatch", { extensions: { code: "BAD_USER_INPUT" } });
    }
    delete input[field];
  }
  const object = await loadForAction(model, uuid, context, "update");
  // Moving the object to another parent requires reading the new parent
  await asGraphQL(() => checkModelReparent(model, object, input, context));
  return object.load(input).save();
}
