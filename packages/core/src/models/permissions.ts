import { ComparisonExpression, LogicalExpression, QueryValidator, type Expression } from "@webda/ql";
import { useLog } from "@webda/workout";
import type { IOperationContext } from "../contexts/icontext.js";
import * as WebdaError from "../errors/errors.js";
import { useModel } from "../application/hooks.js";
import { useModelMetadata } from "../core/hooks.js";
import { useCrypto } from "../services/cryptoservice.service.js";

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
 * Ask canAct; a canAct that throws (e.g. RoleModel without user, or a failing lookup) refuses: an error must not
 * answer differently from a refusal, or it would reveal that the object exists
 * @param object - the model instance
 * @param context - the caller context
 * @param action - the action
 * @returns true when allowed, otherwise the refusal
 */
async function askPermission(object: any, context: IOperationContext, action: string): Promise<any> {
  try {
    return await getModelPermission(object, context, action);
  } catch (err) {
    if (!(err instanceof WebdaError.HttpError)) {
      useLog("WARN", `canAct('${action}') failed on ${object?.constructor?.name ?? "object"}`, err);
    }
    return err?.message ?? false;
  }
}

/**
 * Load an object for an action as the caller: a missing object and an object the caller may not read throw the same
 * `NotFound("Object not found")`; a readable object whose action is refused throws `Forbidden`
 * @param model - the model class
 * @param key - the primary key
 * @param context - the caller context
 * @param action - the action ("get" to only read)
 * @returns the object
 */
export async function loadModelForAction<T = any>(
  model: any,
  key: any,
  context: IOperationContext,
  action: string
): Promise<T> {
  let object: any;
  try {
    object = await model.ref(key).get();
  } catch {
    // Repositories throw when the object does not exist
  }
  if (!object || object.isDeleted?.()) {
    throw new WebdaError.NotFound(NOT_FOUND_MESSAGE);
  }
  await checkModelPermission(object, context, action);
  return object;
}

/**
 * The parent relation (`ModelParent`) of a model, if any
 * @param model - the model class
 * @returns the parent attribute and model identifier
 */
export function getParentRelation(model: any): { attribute: string; model: string } | undefined {
  try {
    return useModelMetadata(model)?.Relations?.parent;
  } catch {
    return undefined;
  }
}

/**
 * A child can only be attached to a parent the caller may read: a missing parent and an unreadable one throw the same
 * `NotFound("Object not found")`
 * @param model - the child model class
 * @param parentId - the parent primary key
 * @param context - the caller context
 */
export async function checkModelParent(model: any, parentId: any, context: IOperationContext): Promise<void> {
  const parent = getParentRelation(model);
  if (!parent || parentId === undefined || parentId === null || parentId === "") {
    return;
  }
  let parentModel: any;
  try {
    parentModel = useModel(parent.model);
  } catch {
    // Unknown parent model: treated as a missing parent
  }
  if (!parentModel) {
    throw new WebdaError.NotFound(NOT_FOUND_MESSAGE);
  }
  await loadModelForAction(parentModel, parentId, context, "get");
}

/**
 * When an update moves an object to another parent, the caller must be able to read the new parent
 * @param model - the model class
 * @param object - the stored object
 * @param input - the sanitized update input
 * @param context - the caller context
 */
export async function checkModelReparent(model: any, object: any, input: any, context: IOperationContext) {
  const parent = getParentRelation(model);
  const value = parent ? input?.[parent.attribute] : undefined;
  if (value === undefined || value === null || String(value) === String(object?.[parent.attribute] ?? "")) {
    return;
  }
  await checkModelParent(model, value, context);
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
 * Highest LIMIT a client query can ask for: larger LIMITs are lowered to it
 */
export const MAX_QUERY_LIMIT = 1000;
/**
 * Rows a permission-filtered query scans to fill one page: ten times the page LIMIT, at least
 * {@link MIN_SCANNED_ROWS}, at most {@link MAX_SCANNED_ROWS}
 */
export const SCAN_FACTOR = 10;
/**
 * Lower bound of the scan budget of a permission-filtered page
 */
export const MIN_SCANNED_ROWS = 100;
/**
 * Absolute bound of the scan budget of a permission-filtered page
 */
export const MAX_SCANNED_ROWS = 10000;

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
 * Refuse a client query that reads private (`__`-prefixed) fields, at any depth, in its filter or ORDER BY: a filter
 * on a private field (a password hash...) would reveal its value through which rows match
 * @param query - the parsed client query
 * @throws WebdaError.BadRequest when a field path has a `__`-prefixed segment
 */
export function assertNoPrivateFields(query: QueryValidator): void {
  const isPrivate = (path: string[]) => path.some(segment => segment.startsWith("__"));
  const visit = (expression: Expression): void => {
    if (expression instanceof LogicalExpression) {
      expression.children.forEach(visit);
    } else if (expression instanceof ComparisonExpression && isPrivate(expression.attribute)) {
      throw new WebdaError.BadRequest("Private fields cannot be queried");
    }
  };
  visit(query.getExpression());
  if ((query.getQuery().orderBy ?? []).some(o => isPrivate(o.field.split(".")))) {
    throw new WebdaError.BadRequest("Private fields cannot be queried");
  }
}

/**
 * Seal a store continuation token: encrypted with the CryptoService (random IV, padded to 64 bytes) so its value
 * cannot be read, compared or forged by the client
 * @param token - the store token
 * @returns the opaque token
 */
export async function sealContinuationToken(token: string): Promise<string> {
  const base = JSON.stringify({ t: token, p: "" }).length;
  return useCrypto().encrypt({ t: token, p: "=".repeat((64 - (base % 64)) % 64) });
}

/**
 * Open a token produced by {@link sealContinuationToken}
 * @param token - the opaque token
 * @returns the store token
 * @throws WebdaError.BadRequest when the token was not produced by this application
 */
export async function unsealContinuationToken(token: string): Promise<string> {
  try {
    const data = await useCrypto().decrypt(token);
    if (typeof data?.t === "string") {
      return data.t;
    }
  } catch {
    // Invalid, forged or expired key
  }
  throw new WebdaError.BadRequest("Invalid continuation token");
}

/**
 * Query a model as the caller
 *
 * - the client query may not read private (`__`) fields (400), and its LIMIT is lowered to {@link MAX_QUERY_LIMIT};
 * - the model's static `getPermissionQuery(context)` is ANDed into the query;
 * - when the model defines `canAct`, every result is checked with `canAct(context, "get")` and refused ones are
 *   dropped. Refused rows are replaced by continuing the scan (next store pages, asking only for the missing rows),
 *   within a budget of `SCAN_FACTOR` x LIMIT rows (between `MIN_SCANNED_ROWS` and `MAX_SCANNED_ROWS`). When the
 *   budget is spent, an empty page carries no token;
 * - for those models the continuation token is sealed ({@link sealContinuationToken}): a store token counting or
 *   naming rows (Postgres/Firestore offsets, Dynamo keys) would otherwise reveal hidden matches. The client sends it
 *   back as is in `OFFSET`; any other value is a 400.
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
  const client = new QueryValidator(query ?? "");
  assertNoPrivateFields(client);
  const limit = Math.min(client.getLimit(), MAX_QUERY_LIMIT);
  const filtered = typeof model.prototype?.canAct === "function";
  let offset = client.getOffset();
  if (filtered && offset) {
    offset = await unsealContinuationToken(offset);
  }
  const permission: PermissionQuery | null | undefined =
    typeof model.getPermissionQuery === "function" ? model.getPermissionQuery(context) : undefined;
  const merged = mergePermissionQuery(query ?? "", permission);
  /**
   * @param count - the LIMIT
   * @param token - the store OFFSET
   * @returns the query to send to the store
   */
  const page = (count: number, token?: string) =>
    new QueryValidator(merged).merge(`LIMIT ${count}${token ? ` OFFSET ${JSON.stringify(token)}` : ""}`).toString();
  if (!filtered) {
    return model.query(page(limit, offset));
  }
  const budget = Math.min(Math.max(limit * SCAN_FACTOR, MIN_SCANNED_ROWS), MAX_SCANNED_ROWS);
  const results: T[] = [];
  let scanned = 0;
  let res = await model.query(page(limit, offset));
  let token: string | undefined;
  while (true) {
    const rows = res.results ?? [];
    scanned += rows.length;
    const readable = await Promise.all(rows.map(r => isReadable(r, context)));
    results.push(...rows.filter((_r, i) => readable[i]));
    token = res.continuationToken;
    if (!token || results.length >= limit) {
      // Store exhausted, or page full
      break;
    }
    if (scanned >= budget) {
      // Budget spent: a token on an empty page would only reveal hidden matches
      token = results.length ? token : undefined;
      break;
    }
    // Refill: continue after the last scanned row, asking only for the rows still missing
    res = await model.query(page(Math.min(limit - results.length, budget - scanned), token));
  }
  return { ...res, results, continuationToken: token ? await sealContinuationToken(String(token)) : undefined };
}
