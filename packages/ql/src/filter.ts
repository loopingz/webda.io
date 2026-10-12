import {
  AndExpression,
  ComparisonExpression,
  OrExpression,
  checkFieldPath,
  normalizeQuery,
  type Expression,
  type OrderBy
} from "./query.js";
import { WebdaQLError } from "./webdaql-string.js";
import type { WebdaQLString } from "./webdaql-string.js";

type Primitive = string | number | boolean | bigint | symbol | null | undefined;
// Kept local: @webda/models has its own public PropertyPaths, this one only types the JSON filter
type PropertyPaths<T extends object> = {
  [K in Extract<keyof T, string>]: T[K] extends Function
    ? never
    : NonNullable<T[K]> extends Primitive | Date | RegExp | Array<any> | Map<any, any> | Set<any>
      ? K
      : NonNullable<T[K]> extends object
        ? K | `${K}.${PropertyPaths<NonNullable<T[K]>>}`
        : K;
}[Extract<keyof T, string>];
type PathValue<T, K extends string> = K extends `${infer H}.${infer R}`
  ? H extends keyof T
    ? PathValue<NonNullable<T[H]>, R>
    : never
  : K extends keyof T
    ? T[K]
    : never;
type PropertyPathType<T extends object, K extends PropertyPaths<T>> = PathValue<T, K>;
export type FilterOperators<V> = {
  $eq?: V | null;
  $ne?: V | null;
  $gt?: V;
  $gte?: V;
  $lt?: V;
  $lte?: V;
  $in?: V[];
  $like?: string;
  // WebdaQL CONTAINS only takes a string
  $contains?: V extends readonly (infer E)[] ? Extract<E, string> : never;
  $exists?: boolean;
};
export type ModelFilter<T extends object = any> = {
  [K in PropertyPaths<T>]?: PropertyPathType<T, K> | null | FilterOperators<PropertyPathType<T, K>>;
} & { $or?: ModelFilter<T>[]; $and?: ModelFilter<T>[] };
export interface FindOptions<T extends object> {
  orderBy?: { field: PropertyPaths<T>; direction: "ASC" | "DESC" }[];
  limit?: number;
  continuationToken?: string;
}
const operators: Record<string, string> = {
  $eq: "=",
  $ne: "!=",
  $gt: ">",
  $gte: ">=",
  $lt: "<",
  $lte: "<=",
  $in: "IN",
  $like: "LIKE",
  $contains: "CONTAINS"
};
/**
 * WebdaQL has no date literal: dates are compared as ISO 8601 strings, the way they are serialized
 * @param value - the filter value
 * @returns the value, with dates as ISO strings
 */
function toFilterValue(value: any): any {
  if (Array.isArray(value)) return value.map(toFilterValue);
  if (!(value instanceof Date)) return value;
  if (isNaN(value.getTime())) throw new WebdaQLError("Invalid date in filter");
  return value.toISOString();
}
/**
 * Convert a JSON filter to a WebdaQL expression
 *
 * Keys set to `undefined` are ignored, so optional criteria can be spread in. A plain object without
 * operators matches its nested fields: `{ address: { city: "Paris" } }` is `address.city = "Paris"`.
 * @param filter - the JSON filter
 * @returns the expression
 * @throws {WebdaQLError} for an invalid filter
 */
export function filterToExpression(filter: ModelFilter): Expression {
  if (!filter || typeof filter !== "object" || Array.isArray(filter))
    throw new WebdaQLError("Filter must be an object");
  const parts: Expression[] = [];
  for (const key of Object.keys(filter)) {
    const value: any = (filter as any)[key];
    if (value === undefined) continue;
    if (key === "$or" || key === "$and") {
      if (!Array.isArray(value) || !value.length) throw new WebdaQLError(`${key} requires a non-empty array`);
      parts.push(
        key === "$or"
          ? new OrExpression(value.map(filterToExpression))
          : new AndExpression(value.map(filterToExpression))
      );
      continue;
    }
    if (key.startsWith("$")) throw new WebdaQLError(`Unknown filter operator '${key}'`);
    fieldToExpressions(key, value, parts);
  }
  return new AndExpression(parts);
}
/**
 * Add the conditions on one field
 * @param key - the field path
 * @param value - a plain value, an operator object or a nested object
 * @param parts - the conditions to add to
 */
function fieldToExpressions(key: string, value: any, parts: Expression[]): void {
  checkFieldPath(key);
  if (value === null) {
    parts.push(new ComparisonExpression("IS NULL", key, true));
    return;
  }
  if (typeof value !== "object" || Array.isArray(value) || value instanceof Date) {
    parts.push(new ComparisonExpression("=", key, toFilterValue(value)));
    return;
  }
  const keys = Object.keys(value);
  if (!keys.length) throw new WebdaQLError(`Empty filter object for '${key}'`);
  const operatorKeys = keys.filter(k => k.startsWith("$"));
  if (!operatorKeys.length) {
    // Nested object: match each of its fields
    const before = parts.length;
    for (const sub of keys) {
      if (value[sub] !== undefined) fieldToExpressions(`${key}.${sub}`, value[sub], parts);
    }
    if (parts.length === before) throw new WebdaQLError(`Empty filter object for '${key}'`);
    return;
  }
  if (operatorKeys.length !== keys.length) throw new WebdaQLError(`Cannot mix operators and fields in '${key}'`);
  for (const op of keys) {
    const operand = value[op];
    if (operand === undefined) continue;
    if (op === "$exists") {
      if (typeof operand !== "boolean") throw new WebdaQLError("$exists must be a boolean");
      parts.push(new ComparisonExpression(operand ? "IS NOT NULL" : "IS NULL", key, true));
    } else if ((op === "$eq" || op === "$ne") && operand === null) {
      parts.push(new ComparisonExpression(op === "$eq" ? "IS NULL" : "IS NOT NULL", key, true));
    } else {
      const mapped = operators[op];
      if (!mapped) throw new WebdaQLError(`Unknown filter operator '${op}'`);
      if (operand === null) throw new WebdaQLError("null is only supported with $eq, $ne, or $exists");
      if (op === "$in" && (!Array.isArray(operand) || !operand.length))
        throw new WebdaQLError("$in requires a non-empty array");
      if (op === "$contains" && typeof operand !== "string") throw new WebdaQLError("$contains takes a string");
      parts.push(new ComparisonExpression(mapped as any, key, toFilterValue(operand)));
    }
  }
}
export function toWebdaQL<T extends object = any>(filter: ModelFilter<T>, options?: FindOptions<T>): WebdaQLString<T> {
  const q = normalizeQuery({
    type: "SELECT",
    filter: filterToExpression(filter),
    orderBy: options?.orderBy as OrderBy[],
    limit: options?.limit,
    continuationToken: options?.continuationToken
  } as any);
  return q.toString() as WebdaQLString<T>;
}
