import type { Filter } from "./types";

/**
 * Use of this MUST include one nested filter expression, where the result of this
 * filter expression is the inverse of the result of the nested expression. In other words,
 * if the nested expression evaluated to true, then the not filter expression's result is false.
 */
export interface NotFilter {
  not: Filter;
}

/**
 * Use of this MUST include one nested array of filter expressions, where at least one nested
 * filter expressions MUST evaluate to true in order for the any filter expression to be true.
 */
export interface AnyFilter {
  any: Filter[];
}

/**
 * Use of this MUST include a nested array of filter expressions, where all nested filter
 * expressions MUST evaluate to true in order for the all filter expression to be true.
 *
 * Note: there MUST be at least one filter expression in the array.
 */
export interface AllFilter {
  all: Filter[];
}
