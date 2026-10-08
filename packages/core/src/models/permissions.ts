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
 * Message of the NotFound error for a missing object, also used for an object the caller may not read
 */
export const NOT_FOUND_MESSAGE = "Object not found";

/**
 * Ask canAct, treating a 401/403 thrown by it (e.g. RoleModel without user) as a refusal
 * @param object - the model instance
 * @param context - the caller context
 * @param action - the action
 * @returns true when allowed, otherwise the refusal
 */
async function askPermission(object: any, context: IOperationContext, action: string): Promise<any> {
  try {
    return await getModelPermission(object, context, action);
  } catch (err) {
    if (err instanceof WebdaError.HttpError && [401, 403].includes(err.getResponseCode())) {
      return err.message;
    }
    throw err;
  }
}

/**
 * Enforce a model's permission for an action: the single check used by every DomainService operation (REST, gRPC,
 * MCP and any transport dispatching operations)
 *
 * A caller who may not read the object (`canAct(ctx, "get")` refused) gets exactly the error of a missing object
 * (`NotFound("Object not found")`), whatever the action, so a refusal never reveals that the key exists. A caller who
 * may read the object but not perform the action gets a `Forbidden`. On `"create"` the object does not exist yet: a
 * refusal is always a `Forbidden`.
 *
 * The refusal reason returned by `canAct` is logged, never sent to the client.
 *
 * @param object - the model instance
 * @param context - the caller context
 * @param action - the action name
 * @throws WebdaError.NotFound when the caller may not read the object
 * @throws WebdaError.Forbidden when the caller may read the object but not perform the action
 */
export async function checkModelPermission(object: any, context: IOperationContext, action: string): Promise<void> {
  const allowed = await askPermission(object, context, action);
  if (allowed === true) {
    return;
  }
  useLog(
    "DEBUG",
    `Permission refused for '${action}' on ${object?.constructor?.name ?? "object"}`,
    typeof allowed === "string" ? allowed : ""
  );
  if (action !== "create" && (action === "get" || (await askPermission(object, context, "get")) !== true)) {
    throw new WebdaError.NotFound(NOT_FOUND_MESSAGE);
  }
  throw new WebdaError.Forbidden(`Action ${action} not allowed`);
}

/**
 * Persist a new object with the repository `create`, which refuses an existing key (atomically in every bundled
 * repository), instead of `save()`, which upserts
 * @param object - the new model instance
 * @returns the object
 * @throws WebdaError.Conflict when an object with the same primary key exists
 */
export async function createModel<T = any>(object: T): Promise<T> {
  try {
    await (object as any).getRepository().create(object);
  } catch (err) {
    if (/^Already exists/.test(`${err?.message}`)) {
      throw new WebdaError.Conflict("Object already exists");
    }
    throw err;
  }
  return object;
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
 * Maximum number of rows a permission-filtered query scans to fill one page: ten times the page LIMIT, at least
 * {@link MIN_SCANNED_ROWS}
 */
export const SCAN_FACTOR = 10;
/**
 * Lower bound of the scan budget of a permission-filtered page
 */
export const MIN_SCANNED_ROWS = 100;

/**
 * Whether the caller may read a query result: a `canAct` that throws refuses that row only
 * @param object - the result
 * @param context - the caller context
 * @returns true when readable
 */
async function isReadable(object: any, context: IOperationContext): Promise<boolean> {
  try {
    return await isModelActionAllowed(object, context, "get");
  } catch (err) {
    useLog("WARN", `canAct failed on a query result of ${object?.constructor?.name ?? "object"}`, err);
    return false;
  }
}

/**
 * Query a model as the caller: the model's static `getPermissionQuery(context)` is ANDed into the query, then, when
 * the model defines `canAct`, every result is checked with `canAct(context, "get")` and refused ones are dropped
 *
 * Refused rows are replaced by continuing the scan in the store (next pages, with the remaining LIMIT), so a page is
 * full unless the store has no more matches or the scan budget (`SCAN_FACTOR` x LIMIT rows, at least
 * `MIN_SCANNED_ROWS`) is spent. When the budget is spent the continuation token is returned only if the page holds
 * visible results: an empty page never carries a token, so a token never reveals that only hidden rows matched.
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
  const merged = mergePermissionQuery(query ?? "", permission);
  // Even with a non partial permission query, canAct stays the reference: a subclass overriding canAct while
  // inheriting getPermissionQuery must not leak objects its canAct refuses
  if (typeof model.prototype?.canAct !== "function") {
    return model.query(merged);
  }
  const limit = new QueryValidator(merged).getLimit();
  const budget = Math.max(limit * SCAN_FACTOR, MIN_SCANNED_ROWS);
  const results: T[] = [];
  let scanned = 0;
  let res = await model.query(merged);
  while (true) {
    const rows = res.results ?? [];
    scanned += rows.length;
    const readable = await Promise.all(rows.map(r => isReadable(r, context)));
    results.push(...rows.filter((_r, i) => readable[i]));
    if (!res.continuationToken || results.length >= limit) {
      // Store exhausted, or page full: the store token is exact
      return { ...res, results };
    }
    if (scanned >= budget) {
      // Budget spent: a token on an empty page would only reveal hidden matches
      return results.length ? { ...res, results } : { ...res, results, continuationToken: undefined };
    }
    // Refill: continue after the last scanned row, asking only for the rows still missing
    const next = new QueryValidator(merged).merge(
      `LIMIT ${limit - results.length} OFFSET ${JSON.stringify(String(res.continuationToken))}`
    );
    res = await model.query(next.toString());
  }
}
