import { createModel, sanitizeModelInput, WebdaError } from "@webda/core";
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
 * Whether `canAct` allows the action; GraphQL is strict: a model without canAct is refused, and a 401/403 thrown by
 * canAct is a refusal
 * @param object - model instance
 * @param context - request context
 * @param action - action name
 * @returns true when allowed
 */
async function allows(object: any, context: any, action: string): Promise<boolean> {
  try {
    return (await object?.canAct?.(context, action)) === true;
  } catch (err) {
    if (err instanceof WebdaError.HttpError && [401, 403].includes(err.getResponseCode())) {
      return false;
    }
    throw err;
  }
}

/**
 * Load an object for an action: a missing object and an object the caller may not read answer the same NOT_FOUND
 * error; an object the caller may read but not act on answers PERMISSION_DENIED
 * @param model - model class
 * @param uuid - primary key
 * @param context - request context
 * @param action - the action ("get", "update", "delete"...)
 * @returns the object
 */
export async function loadForAction(model: any, uuid: any, context: any, action: string): Promise<any> {
  let object: any;
  try {
    object = await model.ref(uuid).get();
  } catch {
    // Repositories throw when the object does not exist
  }
  if (!object || object.isDeleted?.() || !(await allows(object, context, "get"))) {
    throw notFound();
  }
  if (action !== "get" && !(await allows(object, context, action))) {
    throw permissionDenied();
  }
  return object;
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
  const object = new model();
  object.load(sanitizeModelInput(model, input ?? {}));
  // Let the model set its server-managed fields (e.g. the owner) from the caller, like the REST create
  await object.prepareCreate?.(context);
  if ((await object.canAct?.(context, "create")) !== true) {
    throw permissionDenied();
  }
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
  for (const field of model.Metadata?.PrimaryKey ?? ["uuid"]) {
    if (input[field] !== undefined && String(input[field]) !== String(uuid)) {
      throw new GraphQLError("Primary key mismatch", { extensions: { code: "BAD_USER_INPUT" } });
    }
    delete input[field];
  }
  const object = await loadForAction(model, uuid, context, "update");
  return object.load(input).save();
}
