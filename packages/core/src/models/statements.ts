import { AndExpression, ComparisonExpression, OrExpression, QueryValidator, type Expression } from "@webda/ql";
import type { IOperationContext } from "../contexts/icontext.js";
import * as WebdaError from "../errors/errors.js";
import { primaryKeyFields, subclassesOf } from "./modelfields.js";
import {
  assertNoPrivateFields,
  checkModelParent,
  getModelPermission,
  getParentRelation,
  hasModelPermissionCheck,
  MAX_QUERY_LIMIT,
  MAX_REFILL_PAGES,
  MAX_SCANNED_ROWS,
  MAX_SELECT_DEPTH,
  MAX_SELECT_FIELDS,
  mergePermissionQuery,
  MIN_SCANNED_ROWS,
  SCAN_FACTOR
} from "./permissions.js";

/**
 * Context extension a transport sets to `true` on the Query operations it dispatches when the call may write: only
 * then is a `DELETE` or `UPDATE` statement run. A transport that does not set it refuses statements: a REST `GET`
 * (a safe method must not write), MCP (its Query tools are announced read-only) and any transport unaware of
 * statements
 */
export const QUERY_STATEMENTS_ACCEPTED = "queryStatementsAccepted";

/**
 * Context extension set, to the statement type, on a Query operation call that runs a `DELETE` or `UPDATE` statement:
 * the call writes although its operation reads, which the audit trail of write operations takes into account
 */
export const QUERY_STATEMENT_RUN = "queryStatementRun";

/**
 * How the Query operation of a model writes the rows of a `DELETE` or `UPDATE` statement
 *
 * - `bulk`: with the repository `deleteMany` / `updateMany`, restricted to the rows the caller may act on: no
 *   per-object repository event, no model method (`patch()`, `delete()`) is called;
 * - `events`: object by object through the model, exactly like the `Patch` and `Delete` operations (`object.patch()`,
 *   `object.delete()`): repository events fire and the model methods run.
 */
export type StatementMode = "bulk" | "events";

/**
 * Statement types the Query operations run
 */
export type StatementType = "DELETE" | "UPDATE";

/**
 * Outcome of a `DELETE` or `UPDATE` statement run by a Query operation
 */
export type StatementResult = {
  /**
   * The statement type
   */
  type: StatementType;
  /**
   * Rows deleted or updated (with `dryRun`: rows that would be)
   */
  changed: number;
  /**
   * Rows the caller may read but not delete or update: left untouched. Rows the caller may not read are not counted
   */
  skipped: number;
  /**
   * The statement stopped before the end of the matching rows (LIMIT, the cap on LIMIT or the scan budget): send it
   * again to go on
   */
  more: boolean;
  /**
   * Nothing was written: the operation ran in dry-run mode
   */
  dryRun?: true;
};

/**
 * JSON schema of a {@link StatementResult}, used by the query result schemas (OpenAPI, gRPC, MCP)
 */
export const QUERY_STATEMENT_SCHEMA = {
  type: "object",
  description:
    "Outcome of a DELETE or UPDATE statement, absent for a query: rows changed, rows the caller may read but not " +
    "change (skipped), and whether matching rows remain (send the statement again)",
  properties: {
    type: { type: "string", enum: ["DELETE", "UPDATE"] },
    changed: { type: "integer" },
    skipped: { type: "integer" },
    more: { type: "boolean" },
    dryRun: { type: "boolean" }
  },
  required: ["type", "changed", "skipped", "more"]
};

/**
 * Keys per bulk write: a statement of `bulk` mode is written in batches of this many rows (backends bound the size
 * of an `IN` list)
 */
export const STATEMENT_WRITE_BATCH = 100;

/**
 * How a statement is run
 */
export type StatementOptions = {
  /**
   * How the rows are written
   */
  mode: StatementMode;
  /**
   * Operation-level gate of one row, asked after the model's `canAct`: whether the caller could call the `Patch`
   * (with this patch) or `Delete` operation of the model on it (operation enabled, permission, token scopes,
   * authorizers). A refused row is skipped
   */
  canWrite: (object: any, patch?: Record<string, any>) => boolean | Promise<boolean>;
  /**
   * Sanitize the client input of a model class, like the `Patch` operation does: a SET target it removes is refused
   */
  sanitize: (model: any, input: Record<string, any>) => Record<string, any>;
  /**
   * Validate the patch of one row, like the `Patch` operation validates its input
   * @throws WebdaError.BadRequest when the patch is refused
   */
  validate: (patch: Record<string, any>) => void;
  /**
   * Check and count, write nothing
   */
  dryRun?: boolean;
};

/**
 * Parse a client query when it may be a `DELETE` or `UPDATE` statement
 *
 * A statement starts with its keyword, so any other query is not parsed here: the Query operations parse it once,
 * as before.
 * @param query - the client query
 * @returns the parsed statement, undefined for anything else
 * @throws SyntaxError when the query starts like a statement and does not parse
 */
export function parseModelStatement(query: unknown): QueryValidator | undefined {
  if (typeof query !== "string" || !/^\s*(?:DELETE|UPDATE)/.test(query)) {
    return undefined;
  }
  const client = new QueryValidator(query);
  // A field can start with the same letters (`DELETED = TRUE`)
  return client.getQuery().type === "SELECT" ? undefined : client;
}

/**
 * One checked SET assignment: its path and its value, resolved once for the whole statement
 */
type CheckedAssignment = { field: string; segments: string[]; value: any };

/**
 * Set the assignments on an object, creating the intermediate objects of dotted paths
 * @param target - the object to change in place
 * @param assignments - the checked assignments
 * @returns the target
 */
function applyAssignments(target: Record<string, any>, assignments: CheckedAssignment[]): Record<string, any> {
  for (const { segments, value } of assignments) {
    let current: any = target;
    for (const segment of segments.slice(0, -1)) {
      if (current[segment] === null || typeof current[segment] !== "object") {
        current[segment] = {};
      }
      current = current[segment];
    }
    current[segments[segments.length - 1]] = value;
  }
  return target;
}

/**
 * Check the SET targets of a client UPDATE: what the `Patch` operation of the model would not take is refused, before
 * any row is read
 *
 * Refused: more than {@link MAX_SELECT_FIELDS} assignments, a path deeper than {@link MAX_SELECT_DEPTH}, an
 * `Object.prototype` member name or `prototype` as a segment, a primary key field, a field set twice or together
 * with one of its children, a field that is not one of the model (when its repository lists them), and a field the
 * input sanitization of the model or of one of its subclasses removes (protected, read-only, `_`-prefixed and
 * behavior attributes). A statement moving rows to another parent needs a parent the caller may read.
 * @param model - the model class
 * @param client - the parsed statement
 * @param context - the caller context
 * @param options - how the statement is run
 * @returns the assignments, their values resolved
 * @throws WebdaError.BadRequest naming the refused target
 * @throws WebdaError.NotFound when the new parent is missing or the caller may not read it
 */
async function checkAssignments(
  model: any,
  client: QueryValidator,
  context: IOperationContext,
  options: StatementOptions
): Promise<CheckedAssignment[]> {
  const assignments: CheckedAssignment[] = client.getQuery().assignments.map(a => ({
    field: a.field,
    segments: a.field.split("."),
    // A dynamic value (`NOW()`) is resolved here: every row gets the same value, the one that was validated
    value: a.value
  }));
  if (assignments.length > MAX_SELECT_FIELDS) {
    throw new WebdaError.BadRequest(`A statement cannot set more than ${MAX_SELECT_FIELDS} fields`);
  }
  const keys = primaryKeyFields(model);
  const known: string[] | undefined = model.getRepository().getAllowedFields();
  const fields = assignments.map(a => a.field);
  for (const { field, segments } of assignments) {
    if (segments.length > MAX_SELECT_DEPTH) {
      throw new WebdaError.BadRequest(`A SET target cannot have more than ${MAX_SELECT_DEPTH} segments`);
    }
    if (
      segments.some(segment => segment in Object.prototype || segment === "prototype") ||
      keys.includes(segments[0])
    ) {
      throw new WebdaError.BadRequest(`Cannot set "${field}"`);
    }
    if (fields.indexOf(field) !== fields.lastIndexOf(field) || fields.some(other => other.startsWith(`${field}.`))) {
      throw new WebdaError.BadRequest(`"${field}" is set more than once`);
    }
    if (known && !known.some(name => field === name || field.startsWith(`${name}.`))) {
      throw new WebdaError.BadRequest(`Unknown field "${field}"`);
    }
  }
  const input = applyAssignments({}, assignments);
  for (const clazz of [model, ...subclassesOf(model)]) {
    const kept = options.sanitize(clazz, input);
    const removed = assignments.find(a => !Object.hasOwn(kept, a.segments[0]));
    if (removed) {
      throw new WebdaError.BadRequest(`Cannot set "${removed.field}"`);
    }
  }
  const parent = getParentRelation(model);
  if (parent && Object.hasOwn(input, parent.attribute)) {
    // Like an update moving an object: the caller must be able to read the new parent
    await checkModelParent(model, input[parent.attribute], context);
  }
  return assignments;
}

/**
 * The patch an UPDATE applies to one row: its top-level fields, a dotted target rewriting a copy of the current
 * value of its field
 * @param row - the stored object
 * @param assignments - the checked assignments
 * @returns the patch
 */
function patchOf(row: any, assignments: CheckedAssignment[]): Record<string, any> {
  const patch: Record<string, any> = {};
  for (const { segments } of assignments) {
    const top = segments[0];
    if (segments.length > 1 && !Object.hasOwn(patch, top) && row[top] !== undefined) {
      // A deep copy of the current value, so a nested assignment keeps its other fields
      patch[top] = JSON.parse(JSON.stringify(row[top]));
    }
  }
  return applyAssignments(patch, assignments);
}

/**
 * The filter selecting a batch of rows by primary key
 * @param keys - the primary key fields of the model
 * @param rows - the rows
 * @returns the expression
 */
function keyFilter(keys: string[], rows: any[]): Expression {
  if (keys.length === 1) {
    return new ComparisonExpression(
      "IN",
      keys[0],
      rows.map(row => row[keys[0]])
    );
  }
  return new OrExpression(
    rows.map(row => new AndExpression(keys.map(key => new ComparisonExpression("=", key, row[key]))))
  );
}

/**
 * Run a write of the `events` mode; an object deleted since it was read is left out of the count
 * @param row - the object
 * @param write - the write
 * @returns true when written, false when the object is gone
 * @throws the write error when the object still exists
 */
async function writeIfPresent(row: any, write: () => Promise<any>): Promise<boolean> {
  try {
    await write();
    return true;
  } catch (err) {
    if (await row.getRepository().exists(row.getPrimaryKey())) {
      throw err;
    }
    return false;
  }
}

/**
 * Run a `DELETE` or `UPDATE` statement on a model as the caller
 *
 * - the statement may not name private (`__`) fields (400), and the SET targets of an UPDATE are checked like the
 *   input of the `Patch` operation ({@link checkAssignments}) before any row is read;
 * - a model defining neither `canAct` form refuses every row: the store is not asked;
 * - the model's static `getPermissionQuery(context)` is ANDed into the WHERE;
 * - each matching row is checked with `canAct(context, "get", row)`: a row the caller may not read is left untouched
 *   and is not counted, so the result never tells that it exists. A readable row is then checked with
 *   `canAct(context, "update" | "delete", row)` and the operation-level gate (`options.canWrite`): a refused row is
 *   left untouched and counted in `skipped`;
 * - at most LIMIT rows are changed, {@link MAX_QUERY_LIMIT} at most and by default (`LIMIT 0` changes nothing).
 *   Refused rows are replaced by continuing the scan, within the budget of a query page (`SCAN_FACTOR` x LIMIT rows,
 *   between `MIN_SCANNED_ROWS` and `MAX_SCANNED_ROWS`, and {@link MAX_REFILL_PAGES} store pages). `more` tells that
 *   the store held more matching rows when the statement stopped; like the token of a query page, it is not given
 *   when the budget was spent on rows the caller may not read only;
 * - every row is read, checked and (for an UPDATE) validated (`options.validate`) before the first write: a refused
 *   statement writes nothing. Writes are not a transaction: a failing write leaves the earlier ones;
 * - rows are written as `options.mode` says ({@link StatementMode}). In `bulk` mode the WHERE and the permission
 *   query are kept on the write: a row that stopped matching since it was read is not written, nor counted.
 *
 * @param model - the model class
 * @param client - the parsed statement ({@link parseModelStatement})
 * @param context - the caller context
 * @param options - how the statement is run
 * @returns no result, and the outcome of the statement
 */
export async function executeModelStatement(
  model: any,
  client: QueryValidator,
  context: IOperationContext,
  options: StatementOptions
): Promise<{ results: any[]; statement: StatementResult }> {
  assertNoPrivateFields(client);
  const parsed = client.getQuery();
  const type = parsed.type as StatementType;
  const assignments = type === "UPDATE" ? await checkAssignments(model, client, context, options) : [];
  const statement: StatementResult = { type, changed: 0, skipped: 0, more: false };
  if (options.dryRun) {
    statement.dryRun = true;
  }
  const limit = Math.min(parsed.limit ?? MAX_QUERY_LIMIT, MAX_QUERY_LIMIT);
  if (limit <= 0 || !hasModelPermissionCheck(model)) {
    // LIMIT 0 changes nothing. Deny by default: no row can be read, the store is not even asked
    return { results: [], statement };
  }
  const filter = new QueryValidator(
    mergePermissionQuery(
      parsed.filter.toString(),
      typeof model.getPermissionQuery === "function" ? model.getPermissionQuery(context) : undefined
    )
  ).getExpression();
  const base = filter.toString();
  /**
   * Query of one store page
   * @param count - the LIMIT
   * @param token - the store OFFSET
   * @returns the query to send to the store
   */
  const page = (count: number, token?: string) =>
    new QueryValidator(base).merge(`LIMIT ${count}${token ? ` OFFSET ${JSON.stringify(token)}` : ""}`).toString();
  const action = type === "UPDATE" ? "update" : "delete";
  const budget = Math.min(Math.max(limit * SCAN_FACTOR, MIN_SCANNED_ROWS), MAX_SCANNED_ROWS);
  const accepted: { row: any; patch?: Record<string, any> }[] = [];
  let scanned = 0;
  let pages = 1;
  let res = await model.query(page(limit));
  while (true) {
    const rows: any[] = res.results;
    scanned += rows.length;
    for (const row of rows) {
      if (row.isDeleted() || (await getModelPermission(row, context, "get", model)) !== true) {
        // Invisible, like an object the Patch and Delete operations answer 404 for: neither changed nor counted
        continue;
      }
      const patch = type === "UPDATE" ? patchOf(row, assignments) : undefined;
      if (
        (await getModelPermission(row, context, action, model)) !== true ||
        (await options.canWrite(row, patch)) !== true
      ) {
        statement.skipped++;
        continue;
      }
      if (patch) {
        options.validate(patch);
      }
      accepted.push({ row, patch });
    }
    const token: string | undefined = res.continuationToken;
    if (!token || accepted.length >= limit) {
      // Store exhausted, or LIMIT reached
      statement.more = !!token;
      break;
    }
    if (scanned >= budget || pages >= MAX_REFILL_PAGES || rows.length === 0) {
      // Budget spent, or a store that does not progress: telling that rows remain when the caller saw none would
      // only reveal hidden matches
      statement.more = accepted.length + statement.skipped > 0;
      break;
    }
    pages++;
    res = await model.query(page(Math.min(limit - accepted.length, budget - scanned), token));
  }
  if (options.dryRun) {
    statement.changed = accepted.length;
    return { results: [], statement };
  }
  if (options.mode === "events") {
    for (const { row, patch } of accepted) {
      if (await writeIfPresent(row, () => (patch ? row.patch(patch) : row.delete()))) {
        statement.changed++;
      }
    }
    return { results: [], statement };
  }
  const repository = model.getRepository();
  const keys = primaryKeyFields(model);
  for (let i = 0; i < accepted.length; i += STATEMENT_WRITE_BATCH) {
    const batch = accepted.slice(i, i + STATEMENT_WRITE_BATCH).map(a => a.row);
    // The WHERE is kept on the write: a row that stopped matching since it was read is left as it is
    const write = { type, filter: new AndExpression([keyFilter(keys, batch), filter]) };
    statement.changed +=
      type === "UPDATE"
        ? await repository.updateMany({
            ...write,
            assignments: assignments.map(({ field, value }) => ({ field, value }))
          })
        : await repository.deleteMany(write);
  }
  return { results: [], statement };
}
