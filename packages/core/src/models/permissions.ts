import { QueryValidator } from "@webda/ql";
import { useLog } from "@webda/workout";
import type { IOperationContext } from "../contexts/icontext.js";
import * as WebdaError from "../errors/errors.js";

/**
 * Result of a model's static `getPermissionQuery(context)`
 */
export type PermissionQuery = {
  /**
   * WebdaQL filter ANDed with the client query (filter only: no ORDER BY, LIMIT or OFFSET)
   */
  query: string;
  /**
   * The filter only narrows the results: `canAct(context, "get")` decides for each of them
   */
  partial: boolean;
};

/**
 * Ask a model instance whether the current caller may perform `action` on it
 *
 * - an object without `canAct` is allowed: the framework default for models that do not define permissions
 * - `canAct` returning `true`, or the object itself, allows the action
 * - anything else (`false`, a refusal reason string, `undefined`...) refuses it
 *
 * @param object - the model instance
 * @param context - the caller context
 * @param action - the action name ("get", "create", "update", "delete", an action name or "attribute.action")
 * @returns true when allowed, otherwise the refusal (a reason string or the value canAct returned)
 */
export async function getModelPermission(object: any, context: IOperationContext, action: string): Promise<any> {
  if (typeof object?.canAct !== "function") {
    return true;
  }
  const allowed = await object.canAct(context, action);
  if (allowed === true || allowed === object) {
    return true;
  }
  return allowed === false || allowed === undefined || allowed === null ? false : allowed;
}

/**
 * Whether the current caller may perform `action` on a model instance (see {@link checkModelPermission})
 * @param object - the model instance
 * @param context - the caller context
 * @param action - the action name
 * @returns true when allowed
 */
export async function isModelActionAllowed(object: any, context: IOperationContext, action: string): Promise<boolean> {
  return (await getModelPermission(object, context, action)) === true;
}

/**
 * Enforce a model's permission for an action: the single check used by every DomainService operation (REST, gRPC,
 * MCP and any transport dispatching operations)
 *
 * The refusal reason returned by `canAct` is logged, never sent to the client.
 *
 * @param object - the model instance
 * @param context - the caller context
 * @param action - the action name
 * @throws WebdaError.Forbidden when `canAct` refuses
 */
export async function checkModelPermission(object: any, context: IOperationContext, action: string): Promise<void> {
  const allowed = await getModelPermission(object, context, action);
  if (allowed === true) {
    return;
  }
  useLog(
    "DEBUG",
    `Permission refused for '${action}' on ${object?.constructor?.name ?? "object"}`,
    typeof allowed === "string" ? allowed : ""
  );
  throw new WebdaError.Forbidden(`Action ${action} not allowed`);
}

/**
 * AND the model's permission query into a client query
 *
 * Both sides are parsed and combined on the expression tree, so a client `OR` keeps its precedence. The client
 * ORDER BY, LIMIT and OFFSET are kept.
 *
 * @param query - the client query
 * @param permission - the permission query, if any
 * @returns the query to run
 * @throws SyntaxError if the client query is invalid
 */
export function mergePermissionQuery(query: string, permission?: PermissionQuery | null): string {
  if (!permission?.query) {
    return query;
  }
  return new QueryValidator(query ?? "").merge(permission.query, "AND").toString();
}

/**
 * Query a model as the caller: the model's static `getPermissionQuery(context)` is ANDed into the query, then, when
 * the model defines `canAct`, every result is checked with `canAct(context, "get")` and refused ones are dropped
 *
 * A page can therefore come back shorter than its LIMIT (even empty) while a `continuationToken` is still returned:
 * clients must page on the token, not on the page size.
 *
 * @param model - the model class
 * @param query - the client query
 * @param context - the caller context
 * @returns the query results the caller may read
 */
export async function queryModelWithPermissions<T = any>(
  model: any,
  query: string,
  context: IOperationContext
): Promise<{ results: T[]; continuationToken?: string }> {
  const permission: PermissionQuery | null | undefined =
    typeof model.getPermissionQuery === "function" ? model.getPermissionQuery(context) : undefined;
  const res = await model.query(mergePermissionQuery(query ?? "", permission));
  // Even with a non partial permission query, canAct stays the reference: a subclass overriding canAct while
  // inheriting getPermissionQuery must not leak objects its canAct refuses
  if (typeof model.prototype?.canAct === "function") {
    const allowed = await Promise.all((res.results ?? []).map(r => isModelActionAllowed(r, context, "get")));
    res.results = res.results.filter((_r, i) => allowed[i]);
  }
  return res;
}
