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

/**
 * Use of this MUST have a string value, representing a CloudEvents SQL Expression.
 * The filter result MUST be true if the result value of the expression, coerced to boolean,
 * equals to the TRUE boolean value, otherwise MUST be false if an error occurred while
 * evaluating the expression or if the result value, coerced to boolean, equals to the FALSE
 * boolean value.
 *
 * Implementations SHOULD reject subscriptions with invalid CloudEvents SQL expressions.
 */
export interface SqlFilter {
  sql: string;
}

/**
 * Use of this MUST include exactly one nested property, where the key is the name of the
 * CloudEvents attribute to be matched, and its value is the String value to use in the comparison.
 * To evaluate to true the value of the matching CloudEvents attribute MUST exactly match the value
 * String specified (case sensitive).
 *
 * The attribute name and value specified in the filter express MUST NOT be empty strings.
 */
export interface ExactFilter {
  exact: { [key: string]: string };
}

/**
 * Use of this MUST include exactly one nested property, where the key is the name of the CloudEvents
 * attribute to be matched, and its value is the String value to use in the comparison.
 * To evaluate to true the value of the matching CloudEvents attribute MUST start with the value
 * String specified (case sensitive).
 *
 * The attribute name and value specified in the filter express MUST NOT be empty strings.
 */
export interface PrefixFilter {
  prefix: { [key: string]: string };
}

/**
 * Use of this MUST include exactly one nested property, where the key is the name of the CloudEvents
 * attribute to be matched, and its value is the String value to use in the comparison.
 * To evaluate to true the value of the matching CloudEvents attribute MUST end with the value
 * String specified (case sensitive).
 *
 * The attribute name and value specified in the filter express MUST NOT be empty strings.
 */
export interface SuffixFilter {
  suffix: { [key: string]: string };
}

export type Filter = NotFilter | AllFilter | SqlFilter | ExactFilter | PrefixFilter | SuffixFilter | AnyFilter;
