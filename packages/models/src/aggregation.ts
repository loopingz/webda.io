import type { WebdaQLString } from "@webda/ql";
import type { NumericPropertyPaths, PropertyPaths, PropertyPathType } from "./types.js";

/**
 * Typed metric definition
 */
export type MetricSpec<T extends object> =
  | { count: "*" | PropertyPaths<T> }
  | { countDistinct: PropertyPaths<T> }
  | { sum: NumericPropertyPaths<T> }
  | { avg: NumericPropertyPaths<T> }
  | { min: PropertyPaths<T> }
  | { max: PropertyPaths<T> };

/**
 * Type of an attribute value in an aggregated row: a Date comes back as its ISO string on every backend
 */
export type RowValue<V> = V extends Date ? string : V;

/**
 * Type of the value computed by a metric
 */
export type MetricValue<T extends object, S> = S extends { count: any } | { countDistinct: any } | { sum: any }
  ? number
  : S extends { avg: any }
    ? number | null
    : S extends { min: infer P } | { max: infer P }
      ? P extends PropertyPaths<T>
        ? RowValue<PropertyPathType<T, P>> | null
        : unknown
      : never;

/**
 * Typed aggregation request
 */
export interface AggregationSpec<
  T extends object,
  G extends readonly PropertyPaths<T>[],
  M extends Record<string, MetricSpec<T>>
> {
  /**
   * WebdaQL filter, optionally with `?` / `:name` placeholders; no ORDER BY / LIMIT / OFFSET
   */
  filter?: WebdaQLString<T>;
  groupBy?: G;
  metrics: M;
  orderBy?: { key: G[number] | Extract<keyof M, string>; direction: "ASC" | "DESC" }[];
  limit?: number;
}

/**
 * One aggregated row: group paths keep their attribute type (or null), aliases their metric type;
 * Date attributes are ISO strings
 */
export type AggregatedRow<T extends object, G extends readonly string[], M> = {
  [K in G[number]]: (K extends PropertyPaths<T> ? RowValue<PropertyPathType<T, K>> : unknown) | null;
} & { [A in keyof M]: MetricValue<T, M[A]> };

/**
 * Aggregation behavior of a repository, configured by its store
 */
export interface AggregationOptions {
  /**
   * What to do when the backend cannot aggregate natively
   */
  fallback: "allow" | "warn" | "deny";
  /**
   * Maximum number of groups computed in memory, or returned without LIMIT natively
   */
  maxGroups: number;
  /**
   * Receives fallback warnings
   */
  warn?: (message: string) => void;
}
