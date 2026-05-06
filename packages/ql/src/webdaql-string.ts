/**
 * Marker brand for WebdaQL query strings. `T` is the type whose attributes
 * `@webda/ts-plugin` validates the query against — typically the model class
 * for `Store.query` and the configured session type for
 * `OperationDefinition.permission`.
 *
 * Erased at runtime — `WebdaQLString<X>` IS a string, so adoption is zero
 * cost for callers and consumers. The optional brand property lets a plain
 * string variable flow into a `WebdaQLString<T>` parameter without an
 * explicit cast, while `T` still differentiates `WebdaQLString<Post>` from
 * `WebdaQLString<User>` at the type level.
 */
export type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };

/**
 * Thrown by `escape` when an interpolated value is not representable as a
 * WebdaQL literal (object, function, symbol, NaN, Infinity, nested array).
 */
export class WebdaQLError extends Error {
  /**
   * Create a new WebdaQLError with the given message.
   *
   * @param message - human-readable description of the illegal value
   */
  constructor(message: string) {
    super(message);
    this.name = "WebdaQLError";
  }
}

/**
 * Type-aware WebdaQL value escaper. Called by the rewritten output of any
 * template literal that flows into a `WebdaQLString<T>` parameter:
 *
 *     `name = '${n}' AND age = ${a}`
 *
 * is rewritten by the qlvalidator transformer to:
 *
 *     escape(["name = ", " AND age = ", ""], [n, a])
 *
 * Each value is escaped according to its runtime type, then concatenated
 * with the surrounding `parts` to form a parameterised query string that
 * cannot be used to inject grammar.
 *
 * @param parts - the static string fragments from the template literal
 * @param values - the interpolated values to escape and interleave
 * @returns a branded WebdaQL query string safe for use with Store.query
 */
export function escape<T = unknown>(
  parts: TemplateStringsArray | readonly string[],
  values: readonly unknown[]
): WebdaQLString<T> {
  let out = parts[0];
  for (let i = 0; i < values.length; i++) {
    out += escapeValue(values[i]);
    out += parts[i + 1];
  }
  return out as WebdaQLString<T>;
}

/**
 * Escape a single value to its WebdaQL literal form.
 *
 * @param value - the runtime value to convert to a WebdaQL literal
 * @returns a WebdaQL literal string representing the value
 * @internal exported only for testing
 */
export function escapeValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new WebdaQLError(`Cannot embed ${value} in a WebdaQL query`);
    }
    return String(value);
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const item of value) {
      if (Array.isArray(item)) {
        throw new WebdaQLError("Nested arrays are not representable in WebdaQL");
      }
      parts.push(escapeValue(item));
    }
    return `(${parts.join(", ")})`;
  }
  throw new WebdaQLError(`Cannot embed value of type ${typeof value} in a WebdaQL query`);
}
