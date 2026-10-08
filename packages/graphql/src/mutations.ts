import { sanitizeModelInput } from "@webda/core";
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
 * Whether a model attribute is part of the generated GraphQL input type: private (`__`) attributes and behavior
 * attributes can only be changed server-side (or through the behavior's own actions)
 * @param attribute - attribute name
 * @param graph - relations of the model
 * @returns true when clients may send it
 */
export function isInputAttribute(attribute: string, graph?: ModelGraph): boolean {
  if (attribute.startsWith("__")) {
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
  await object.save();
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
  const object = await model.ref(uuid).get();
  if ((await object?.canAct?.(context, "update")) !== true) {
    throw permissionDenied();
  }
  return object.load(sanitizeModelInput(model, input ?? {})).save();
}
