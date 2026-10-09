import type { Expression } from "./query.js";
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
