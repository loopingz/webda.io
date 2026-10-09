import { assertFilterQuery, ComparisonExpression, parse, type Expression } from "./query.js";
import { bind, type QueryParameters } from "./bind.js";
import { WebdaQLError } from "./webdaql-string.js";

/**
 * Aggregation functions supported on every backend
 */
export type AggregateFunction = "COUNT" | "COUNT_DISTINCT" | "SUM" | "AVG" | "MIN" | "MAX";

/**
 * One computed column of an aggregation
 */
export interface Metric {
  fn: AggregateFunction;
  /**
   * Dotted path of the aggregated attribute; omitted only for COUNT, meaning COUNT(*)
   */
  field?: string;
}

/**
 * Ordering of aggregated rows
 */
export interface AggregationOrder {
  /**
   * A groupBy path or a metric alias
   */
  key: string;
  direction: "ASC" | "DESC";
}

/**
 * Canonical aggregation AST consumed by every store
 */
export interface AggregationQuery {
  /**
   * Filter applied before grouping; `new AndExpression([])` matches everything
   */
  filter: Expression;
  /**
   * Dotted paths; an empty array produces a single global row
   */
  groupBy: string[];
  /**
   * alias → metric
   */
  metrics: Record<string, Metric>;
  orderBy?: AggregationOrder[];
  limit?: number;
}

/**
 * Result of an aggregation
 */
export interface AggregationResult<Row = Record<string, unknown>> {
  rows: Row[];
  /**
   * false when the in-memory fallback ran, fully or partially
   */
  native: boolean;
}

/**
 * Error codes raised by aggregations
 */
export type AggregationErrorCode = "AGGREGATION_NOT_NATIVE" | "AGGREGATION_TOO_MANY_GROUPS";

/**
 * Error raised when an aggregation is refused at runtime
 */
export class AggregationError extends WebdaQLError {
  /**
   * @param code - machine readable code
   * @param message - human readable message
   */
  constructor(
    public readonly code: AggregationErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AggregationError";
  }
}

/**
 * Valid attribute path: dotted identifiers, the only form translators interpolate
 */
export const AGGREGATION_PATH = /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/;
/**
 * Valid metric alias
 */
export const AGGREGATION_ALIAS = /^[a-zA-Z][a-zA-Z0-9_]*$/;

const FORBIDDEN_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
const FUNCTIONS = new Set<string>(["COUNT", "COUNT_DISTINCT", "SUM", "AVG", "MIN", "MAX"]);

/**
 * Check an attribute path
 * @param path - the path
 * @param what - description for the error
 */
function checkPath(path: string, what: string): void {
  if (
    typeof path !== "string" ||
    !AGGREGATION_PATH.test(path) ||
    path.split(".").some(segment => FORBIDDEN_SEGMENTS.has(segment))
  ) {
    throw new WebdaQLError(`Invalid ${what} '${path}'`);
  }
}

/**
 * Validate an aggregation query
 *
 * Paths and aliases that pass are safe to interpolate in native queries.
 * @param query - the query to validate
 * @returns the same query
 * @throws WebdaQLError when the query is invalid
 */
export function validateAggregation(query: AggregationQuery): AggregationQuery {
  const groupBy = query.groupBy ?? [];
  groupBy.forEach(path => checkPath(path, "group by path"));
  if (new Set(groupBy).size !== groupBy.length) {
    throw new WebdaQLError("Duplicate group by path");
  }
  const aliases = Object.keys(query.metrics ?? {});
  if (!aliases.length) {
    throw new WebdaQLError("An aggregation needs at least one metric");
  }
  for (const alias of aliases) {
    if (!AGGREGATION_ALIAS.test(alias) || FORBIDDEN_SEGMENTS.has(alias)) {
      throw new WebdaQLError(`Invalid metric alias '${alias}'`);
    }
    if (groupBy.includes(alias)) {
      throw new WebdaQLError(`Metric alias '${alias}' collides with a group by path`);
    }
    const metric = query.metrics[alias];
    if (!FUNCTIONS.has(metric?.fn)) {
      throw new WebdaQLError(`Unknown aggregate function '${metric?.fn}'`);
    }
    if (metric.field === undefined) {
      if (metric.fn !== "COUNT") {
        throw new WebdaQLError(`${metric.fn} needs a field`);
      }
    } else {
      checkPath(metric.field, "metric field");
    }
  }
  for (const order of query.orderBy ?? []) {
    if (!groupBy.includes(order.key) && !aliases.includes(order.key)) {
      throw new WebdaQLError(`ORDER BY '${order.key}' is neither a group by path nor a metric alias`);
    }
    if (order.direction !== "ASC" && order.direction !== "DESC") {
      throw new WebdaQLError(`Invalid ORDER BY direction '${order.direction}'`);
    }
  }
  if (query.limit !== undefined && !(Number.isInteger(query.limit) && query.limit > 0)) {
    throw new WebdaQLError(`Invalid LIMIT '${query.limit}'`);
  }
  return query;
}

const TYPE_RANK: Record<string, number> = { number: 1, bigint: 1, string: 2, boolean: 3 };

/**
 * Compare two values the way every backend orders aggregated rows
 *
 * null / undefined first, then numbers, strings (code unit order), booleans, then anything
 * else by its JSON representation.
 * @param a - first value
 * @param b - second value
 * @returns negative, zero or positive
 */
export function compareValues(a: unknown, b: unknown): number {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull || bNull) {
    return aNull === bNull ? 0 : aNull ? -1 : 1;
  }
  const rankA = TYPE_RANK[typeof a] ?? 4;
  const rankB = TYPE_RANK[typeof b] ?? 4;
  if (rankA !== rankB) {
    return rankA - rankB;
  }
  const left: any = rankA === 4 ? JSON.stringify(a) : a;
  const right: any = rankB === 4 ? JSON.stringify(b) : b;
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Running computation of one metric
 */
interface Accumulator {
  add(item: any): void;
  result(): unknown;
}

/**
 * Read a dotted path, undefined when any segment is missing
 * @param item - the object
 * @param path - dotted path
 * @returns the value
 */
function readPath(item: any, path: string): unknown {
  return ComparisonExpression.getAttributeValue(item, path.split("."));
}

/**
 * Create the accumulator of a metric
 * @param metric - the metric
 * @returns the accumulator
 */
function createAccumulator(metric: Metric): Accumulator {
  const value = (item: any): unknown => (metric.field === undefined ? item : readPath(item, metric.field));
  const present = (v: unknown): boolean => v !== null && v !== undefined;
  const numeric = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  switch (metric.fn) {
    case "COUNT": {
      let count = 0;
      return { add: item => void (present(value(item)) && count++), result: () => count };
    }
    case "COUNT_DISTINCT": {
      const seen = new Set<string>();
      return {
        add: item => {
          const v = value(item);
          if (present(v)) seen.add(JSON.stringify(v));
        },
        result: () => seen.size
      };
    }
    case "SUM": {
      let sum = 0;
      return {
        add: item => {
          const v = value(item);
          if (numeric(v)) sum += v;
        },
        result: () => sum
      };
    }
    case "AVG": {
      let sum = 0;
      let count = 0;
      return {
        add: item => {
          const v = value(item);
          if (numeric(v)) {
            sum += v;
            count++;
          }
        },
        result: () => (count ? sum / count : null)
      };
    }
    case "MIN":
    case "MAX": {
      const sign = metric.fn === "MIN" ? 1 : -1;
      let current: unknown = undefined;
      return {
        add: item => {
          const v = value(item);
          if (present(v) && (current === undefined || sign * compareValues(v, current) < 0)) current = v;
        },
        result: () => current ?? null
      };
    }
  }
}

/**
 * Streaming reference implementation of an aggregation
 *
 * Items must already match the query filter. Memory is O(groups), plus one Set per group per
 * COUNT_DISTINCT. It is the fallback engine of repositories and the oracle of the
 * conformance tests.
 */
export class Aggregator {
  protected groups = new Map<string, { keys: unknown[]; accumulators: [string, Accumulator][] }>();

  /**
   * @param query - the aggregation; validated here
   * @param maxGroups - throw AGGREGATION_TOO_MANY_GROUPS beyond this number of groups
   */
  constructor(
    protected query: AggregationQuery,
    protected maxGroups: number = Number.POSITIVE_INFINITY
  ) {
    validateAggregation(query);
  }

  /**
   * Create an empty group
   * @param keys - group key values
   * @returns the group
   */
  protected createGroup(keys: unknown[]) {
    return {
      keys,
      accumulators: Object.entries(this.query.metrics).map(
        ([alias, metric]) => [alias, createAccumulator(metric)] as [string, Accumulator]
      )
    };
  }

  /**
   * Add a matching item
   * @param item - the item
   */
  add(item: any): void {
    const keys = this.query.groupBy.map(path => readPath(item, path) ?? null);
    const id = JSON.stringify(keys);
    let group = this.groups.get(id);
    if (!group) {
      if (this.groups.size >= this.maxGroups) {
        throw new AggregationError("AGGREGATION_TOO_MANY_GROUPS", `Aggregation exceeds ${this.maxGroups} groups`);
      }
      group = this.createGroup(keys);
      this.groups.set(id, group);
    }
    for (const [, accumulator] of group.accumulators) {
      accumulator.add(item);
    }
  }

  /**
   * Compute the rows, ordered and limited
   * @returns flat rows keyed by group path and metric alias
   */
  rows(): Record<string, unknown>[] {
    const groups = [...this.groups.values()];
    if (!groups.length && !this.query.groupBy.length) {
      groups.push(this.createGroup([]));
    }
    let rows = groups.map(group => {
      const row: Record<string, unknown> = {};
      this.query.groupBy.forEach((path, i) => (row[path] = group.keys[i]));
      group.accumulators.forEach(([alias, accumulator]) => (row[alias] = accumulator.result()));
      return row;
    });
    const orderBy = this.query.orderBy ?? [];
    if (orderBy.length) {
      rows.sort((a, b) => {
        for (const order of orderBy) {
          const c = compareValues(a[order.key], b[order.key]);
          if (c) return order.direction === "ASC" ? c : -c;
        }
        return 0;
      });
    }
    if (this.query.limit) {
      rows = rows.slice(0, this.query.limit);
    }
    return rows;
  }
}

/**
 * Ergonomic metric definition used by the object API
 */
export type MetricInput =
  { count: string } | { countDistinct: string } | { sum: string } | { avg: string } | { min: string } | { max: string };

/**
 * Untyped object form of an aggregation, as accepted by repositories
 */
export interface AggregationInput {
  /**
   * WebdaQL filter, without ORDER BY / LIMIT / OFFSET
   */
  filter?: string;
  groupBy?: readonly string[];
  metrics: Record<string, MetricInput>;
  orderBy?: readonly AggregationOrder[];
  limit?: number;
}

const METRIC_KEYS: Record<string, AggregateFunction> = {
  count: "COUNT",
  countDistinct: "COUNT_DISTINCT",
  sum: "SUM",
  avg: "AVG",
  min: "MIN",
  max: "MAX"
};

/**
 * Convert the object form of an aggregation to the canonical AST
 * @param input - the object form
 * @param params - values for the `?` / `:name` placeholders of the filter
 * @returns the validated AST
 * @throws WebdaQLError when the input is invalid
 */
export function toAggregationQuery(input: AggregationInput, params?: QueryParameters): AggregationQuery {
  let filter = input.filter ?? "";
  if (params !== undefined) {
    filter = bind(filter, params);
  }
  const parsed = parse(filter);
  // DELETE / UPDATE / SELECT statements are not filters
  assertFilterQuery(parsed);
  if (parsed.limit !== undefined || parsed.orderBy?.length || parsed.continuationToken !== undefined) {
    throw new WebdaQLError("An aggregation filter cannot contain ORDER BY, LIMIT or OFFSET");
  }
  const metrics: Record<string, Metric> = {};
  for (const [alias, spec] of Object.entries(input.metrics ?? {})) {
    const entries = Object.entries(spec ?? {});
    if (entries.length !== 1 || !Object.prototype.hasOwnProperty.call(METRIC_KEYS, entries[0][0])) {
      throw new WebdaQLError(`Metric '${alias}' must define exactly one of ${Object.keys(METRIC_KEYS).join(", ")}`);
    }
    const [kind, field] = entries[0];
    const fn = METRIC_KEYS[kind];
    metrics[alias] = fn === "COUNT" && field === "*" ? { fn } : { fn, field: field as string };
  }
  return validateAggregation({
    filter: parsed.filter,
    groupBy: [...(input.groupBy ?? [])],
    metrics,
    orderBy: input.orderBy?.map(order => ({ key: order.key, direction: order.direction })),
    limit: input.limit
  });
}
