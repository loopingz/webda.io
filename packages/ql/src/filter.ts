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
export type PropertyPaths<T extends object> = {
  [K in Extract<keyof T, string>]: T[K] extends Function
    ? never
    : T[K] extends Primitive | Date | RegExp | Array<any> | Map<any, any> | Set<any>
      ? K
      : T[K] extends object
        ? K | `${K}.${PropertyPaths<T[K]>}`
        : K;
}[Extract<keyof T, string>];
type PathValue<T, K extends string> = K extends `${infer H}.${infer R}`
  ? H extends keyof T
    ? PathValue<NonNullable<T[H]>, R>
    : never
  : K extends keyof T
    ? T[K]
    : never;
export type PropertyPathType<T extends object, K extends PropertyPaths<T>> = PathValue<T, K>;
export type FilterOperators<V> = {
  $eq?: V | null;
  $ne?: V | null;
  $gt?: V;
  $gte?: V;
  $lt?: V;
  $lte?: V;
  $in?: V[];
  $like?: string;
  $contains?: V extends readonly (infer E)[] ? E : never;
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
export function filterToExpression(filter: ModelFilter): Expression {
  if (!filter || typeof filter !== "object" || Array.isArray(filter))
    throw new WebdaQLError("Filter must be an object");
  const parts: Expression[] = [];
  for (const key of Object.keys(filter)) {
    const value: any = (filter as any)[key];
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
    checkFieldPath(key);
    if (value === null) {
      parts.push(new ComparisonExpression("IS NULL", key, true));
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof Date) {
      parts.push(new ComparisonExpression("=", key, toFilterValue(value)));
      continue;
    }
    for (const op of Object.keys(value)) {
      const operand = value[op];
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
        parts.push(new ComparisonExpression(mapped as any, key, toFilterValue(operand)));
      }
    }
  }
  return new AndExpression(parts);
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
