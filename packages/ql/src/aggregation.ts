import { assertFilterQuery, ComparisonExpression, parse, type Expression } from "./query.js";
import { bind, type QueryParameters } from "./bind.js";
import { WebdaQLError } from "./webdaql-string.js";
import {
  type AggregateFunction,
  type Metric,
  type AggregationOrder,
  type AggregationQuery,
  AggregationError,
  checkAlias,
  validateAggregation
} from "./aggregation-query.js";

// Validation lives apart so query.ts can use it without importing this module back
export * from "./aggregation-query.js";

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
 *
 * A Date is returned as its ISO string, the form JSON backends store: group keys, MIN / MAX and
 * COUNT_DISTINCT then match on every backend.
 * @param item - the object
 * @param path - dotted path
 * @returns the value
 */
function readPath(item: any, path: string): unknown {
  const value = ComparisonExpression.getAttributeValue(item, path.split("."));
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return value;
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
    // Before assigning: an own `__proto__` key would otherwise change the prototype of `metrics`
    checkAlias(alias);
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
