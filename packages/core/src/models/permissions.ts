import { ComparisonExpression, LogicalExpression, QueryValidator, type Expression } from "@webda/ql";
import { Model } from "@webda/models";
import { useLog } from "@webda/workout";
import { createHash } from "node:crypto";
import type { IOperationContext } from "../contexts/icontext.js";
import * as WebdaError from "../errors/errors.js";
import { useModel } from "../application/hooks.js";
import { useDynamicService, useModelMetadata } from "../core/hooks.js";
import type { CryptoService } from "../services/cryptoservice.service.js";

/**
 * The CryptoService, resolved at call time (a static import would make a cycle through the operations module)
 * @returns the CryptoService
 */
function useCrypto(): CryptoService {
  return useDynamicService<CryptoService>("CryptoService");
}

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
 * A permission check: the static `canAct(context, action, object?)` of a model class, bound to it
 */
type PermissionCheck = (context: IOperationContext, action: string, object?: any) => any;

/**
 * The static `canAct(context, action, object?)` of a model class: the one framework entry point
 *
 * When the class defines none (a plain object in a unit test, a class built without `@webda/models`), the base
 * {@link Model.canAct} semantics apply: delegate to the instance `canAct(context, action)`, otherwise deny.
 * @param model - the model class, when known
 * @param object - the object, to find the class when `model` is not given
 * @returns the static check, bound to its class
 */
function staticCanAct(model: any, object?: any): PermissionCheck {
  const clazz = model ?? object?.constructor;
  if (typeof clazz?.canAct === "function") {
    return (context, action, target) => clazz.canAct(context, action, target);
  }
  return (context, action, target) => Model.canAct(context, action, target);
}

/**
 * Whether a model class defines a permission check at all: a static `canAct` of its own (not the base one), or an
 * instance `canAct`. A model with neither is refused on every transport
 * @param model - the model class
 * @returns true when the model defines one of the two forms
 */
export function hasModelPermissionCheck(model: any): boolean {
  return (
    (typeof model?.canAct === "function" && model.canAct !== Model.canAct) ||
    typeof model?.prototype?.canAct === "function"
  );
}

/**
 * Run a check, turning a thrown error into a refusal: an error must not answer differently from a refusal, or it
 * would reveal that the object exists (non-HTTP errors are logged at WARN)
 * @param check - the static canAct
 * @param context - the caller context
 * @param action - the action
 * @param object - the object, if any
 * @returns true when allowed, otherwise the refusal (a reason string or false)
 */
async function askPermission(
  check: PermissionCheck,
  context: IOperationContext,
  action: string,
  object?: any
): Promise<any> {
  try {
    const allowed = await check(context, action, object);
    if (allowed === true) {
      return true;
    }
    return allowed === false || allowed === undefined || allowed === null ? false : allowed;
  } catch (err) {
    if (!(err instanceof WebdaError.HttpError)) {
      useLog("WARN", `canAct('${action}') failed on ${object?.constructor?.name ?? "model"}`, err);
    }
    return err?.message ?? false;
  }
}

/**
 * Ask the model whether the current caller may perform `action` on an object
 *
 * The question goes through the static `canAct(context, action, object)` of the model class (see
 * {@link Model.canAct}): the base implementation delegates to the object's instance `canAct`, and denies when there
 * is none. `true` allows; anything else (`false`, a refusal reason string, `undefined`...) refuses, and so does a
 * `canAct` that throws.
 *
 * @param object - the model instance (the new, unsaved object on create)
 * @param context - the caller context
 * @param action - the action name ("get", "create", "update", "delete", an action name or "attribute.action")
 * @param model - the model class (defaults to the object's class)
 * @returns true when allowed, otherwise the refusal (a reason string or false)
 */
export async function getModelPermission(
  object: any,
  context: IOperationContext,
  action: string,
  model?: any
): Promise<any> {
  return askPermission(staticCanAct(model, object), context, action, object);
}

/**
 * Whether the current caller may perform `action` on a model instance (see {@link checkModelPermission}); it never
 * throws
 * @param object - the model instance
 * @param context - the caller context
 * @param action - the action name
 * @param model - the model class (defaults to the object's class)
 * @returns true when allowed
 */
export async function isModelActionAllowed(
  object: any,
  context: IOperationContext,
  action: string,
  model?: any
): Promise<boolean> {
  return (await getModelPermission(object, context, action, model)) === true;
}

/**
 * Message of the NotFound error for a missing object, also used for an object the caller may not read
 */
export const NOT_FOUND_MESSAGE = "Object not found";

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
  await checkModelPermission(object, context, action, model);
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
 * Enforce a model's permission for an action on an object: the single check used by every client path (REST, gRPC,
 * MCP, GraphQL and any transport dispatching operations)
 *
 * A caller who may not read the object (`canAct(ctx, "get", object)` refused) gets exactly the error of a missing
 * object (`NotFound("Object not found")`), whatever the action, so a refusal never reveals that the key exists. A
 * caller who may read the object but not perform the action gets a `Forbidden`. On `"create"` the object does not
 * exist yet: a refusal is always a `Forbidden`.
 *
 * The refusal reason returned by `canAct` is logged, never sent to the client.
 *
 * @param object - the model instance
 * @param context - the caller context
 * @param action - the action name
 * @param model - the model class (defaults to the object's class)
 * @throws WebdaError.NotFound when the caller may not read the object
 * @throws WebdaError.Forbidden when the caller may read the object but not perform the action
 */
export async function checkModelPermission(
  object: any,
  context: IOperationContext,
  action: string,
  model?: any
): Promise<void> {
  const check = staticCanAct(model, object);
  const allowed = await askPermission(check, context, action, object);
  if (allowed === true) {
    return;
  }
  useLog(
    "DEBUG",
    `Permission refused for '${action}' on ${object?.constructor?.name ?? "object"}`,
    typeof allowed === "string" ? allowed : ""
  );
  if (action !== "create" && (action === "get" || (await askPermission(check, context, "get", object)) !== true)) {
    throw new WebdaError.NotFound(NOT_FOUND_MESSAGE);
  }
  throw new WebdaError.Forbidden(`Action ${action} not allowed`);
}

/**
 * Enforce a model's permission for a static (class-level) action: `canAct(context, action)` without object
 *
 * There is no object to hide, so a refusal is always a `Forbidden`.
 * @param model - the model class
 * @param context - the caller context
 * @param action - the action name
 * @throws WebdaError.Forbidden when refused
 */
export async function checkStaticModelPermission(model: any, context: IOperationContext, action: string) {
  const allowed = await askPermission(staticCanAct(model), context, action, undefined);
  if (allowed === true) {
    return;
  }
  useLog(
    "DEBUG",
    `Permission refused for static '${action}' on ${model?.name ?? "model"}`,
    typeof allowed === "string" ? allowed : ""
  );
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
 * Most store pages read to fill one page, whatever their size
 */
export const MAX_REFILL_PAGES = 100;
/**
 * Lifetime of a continuation token (one hour): paging has to resume within it
 */
export const CONTINUATION_TOKEN_TTL_MS = 60 * 60 * 1000;

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
 * What a continuation token is bound to: it is only accepted back for the same model, the same query (filter and
 * ORDER BY) and the same caller
 */
export type ContinuationTokenBinding = {
  /**
   * Model identifier
   */
  model: string;
  /**
   * The query the token continues: filter and ORDER BY, without LIMIT and OFFSET
   */
  query: string;
  /**
   * Caller id, "anonymous" when not logged in
   */
  user: string;
};

/**
 * Type tag of a sealed continuation token, so no other ciphertext of the application can be sent as one
 */
const TOKEN_TYPE = "webda-query-token";

/**
 * @param binding - the token binding
 * @returns the short hash of the query
 */
function queryHash(binding: ContinuationTokenBinding): string {
  return createHash("sha256").update(binding.query).digest("base64url").substring(0, 32);
}

/**
 * Seal a store continuation token: encrypted with the CryptoService (random IV, padded to 64 bytes) so its value
 * cannot be read, compared or forged by the client; bound to the model, the query and the caller; and expiring
 * after `ttl` ({@link CONTINUATION_TOKEN_TTL_MS})
 * @param token - the store token
 * @param binding - what the token is bound to
 * @param ttl - lifetime in milliseconds
 * @returns the opaque token
 */
export async function sealContinuationToken(
  token: string,
  binding: ContinuationTokenBinding,
  ttl: number = CONTINUATION_TOKEN_TTL_MS
): Promise<string> {
  const payload = {
    typ: TOKEN_TYPE,
    t: token,
    m: binding.model,
    q: queryHash(binding),
    u: binding.user,
    exp: Date.now() + ttl,
    p: ""
  };
  const base = JSON.stringify(payload).length;
  return useCrypto().encrypt({ ...payload, p: "=".repeat((64 - (base % 64)) % 64) });
}

/**
 * Open a token produced by {@link sealContinuationToken}
 * @param token - the opaque token
 * @param binding - what the token must be bound to
 * @returns the store token
 * @throws WebdaError.BadRequest when the token was not produced by this application for this model, query and
 * caller, or has expired
 */
export async function unsealContinuationToken(token: string, binding: ContinuationTokenBinding): Promise<string> {
  let data: any;
  try {
    data = await useCrypto().decrypt(token);
  } catch {
    // Invalid, forged or expired key
  }
  if (
    data?.typ === TOKEN_TYPE &&
    typeof data.t === "string" &&
    data.m === binding.model &&
    data.q === queryHash(binding) &&
    data.u === binding.user &&
    typeof data.exp === "number" &&
    data.exp > Date.now()
  ) {
    return data.t;
  }
  throw new WebdaError.BadRequest("Invalid continuation token");
}

/**
 * @param model - the model class
 * @returns its identifier, or its class name for classes registered without metadata
 */
function modelIdentifier(model: any): string {
  try {
    return useModelMetadata(model)?.Identifier ?? model?.name ?? "model";
  } catch {
    return model?.name ?? "model";
  }
}

/**
 * Query a model as the caller
 *
 * - the client query may not read private (`__`) fields (400), and its LIMIT is lowered to {@link MAX_QUERY_LIMIT};
 * - a model defining neither `canAct` form refuses every row: the store is not asked;
 * - the model's static `getPermissionQuery(context)` is ANDed into the query;
 * - every result is checked with the static `canAct(context, "get", row)` and refused ones are dropped. Refused rows
 *   are replaced by continuing the scan (next store pages, asking only for the missing rows), within a budget of
 *   `SCAN_FACTOR` x LIMIT rows (between `MIN_SCANNED_ROWS` and `MAX_SCANNED_ROWS`) and {@link MAX_REFILL_PAGES}
 *   store pages. When the budget is spent, an empty page carries no token;
 * - the continuation token is sealed ({@link sealContinuationToken}): a store token counting or naming rows
 *   (Postgres/Firestore offsets, Dynamo keys, memory offsets) would otherwise reveal hidden matches. It is bound to
 *   the model, the query and the caller, expires after {@link CONTINUATION_TOKEN_TTL_MS}, and is sent back as is in
 *   `OFFSET`; any other value is a 400.
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
  if (!hasModelPermissionCheck(model)) {
    // Deny by default: no row can be read, the store is not even asked
    return { results: [], continuationToken: undefined };
  }
  const limit = Math.min(client.getLimit(), MAX_QUERY_LIMIT);
  const permission: PermissionQuery | null | undefined =
    typeof model.getPermissionQuery === "function" ? model.getPermissionQuery(context) : undefined;
  const merged = new QueryValidator(mergePermissionQuery(query ?? "", permission));
  // The query without its LIMIT and OFFSET: filter and ORDER BY
  const orderBy = (merged.getQuery().orderBy ?? []).map(o => `${o.field} ${o.direction}`).join(", ");
  const base = `${merged.getExpression().toString()}${orderBy ? ` ORDER BY ${orderBy}` : ""}`.trim();
  const binding: ContinuationTokenBinding = {
    model: modelIdentifier(model),
    query: base,
    user: context.getCurrentUserId() || "anonymous"
  };
  let offset = client.getOffset();
  if (offset) {
    offset = await unsealContinuationToken(offset, binding);
  }
  /**
   * @param count - the LIMIT
   * @param token - the store OFFSET
   * @returns the query to send to the store
   */
  const page = (count: number, token?: string) =>
    new QueryValidator(base).merge(`LIMIT ${count}${token ? ` OFFSET ${JSON.stringify(token)}` : ""}`).toString();
  const check = staticCanAct(model);
  const budget = Math.min(Math.max(limit * SCAN_FACTOR, MIN_SCANNED_ROWS), MAX_SCANNED_ROWS);
  const results: T[] = [];
  let scanned = 0;
  let pages = 1;
  let res = await model.query(page(limit, offset));
  let token: string | undefined;
  while (true) {
    const rows = res.results ?? [];
    scanned += rows.length;
    const readable = await Promise.all(rows.map(async r => (await askPermission(check, context, "get", r)) === true));
    results.push(...rows.filter((_r, i) => readable[i]));
    token = res.continuationToken;
    if (!token || results.length >= limit) {
      // Store exhausted, or page full
      break;
    }
    if (scanned >= budget || pages >= MAX_REFILL_PAGES || rows.length === 0) {
      // Budget spent, or a store that does not progress: a token on an empty page would only reveal hidden matches
      token = results.length ? token : undefined;
      break;
    }
    // Refill: continue after the last scanned row, asking only for the rows still missing
    pages++;
    res = await model.query(page(Math.min(limit - results.length, budget - scanned), token));
  }
  return {
    results,
    continuationToken: token ? await sealContinuationToken(String(token), binding) : undefined
  };
}
