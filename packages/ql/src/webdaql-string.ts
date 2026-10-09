/**
 * Marker brand for WebdaQL query strings. `T` is the type whose attributes
 * `@webda/content-mapper` validates the query against — typically the model class
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
 * Marker brand for WebdaQL statement strings (`DELETE ...`, `UPDATE SET ...`), as taken by
 * `Repository.deleteMany` / `updateMany`. `@webda/content-mapper` checks their fields against `T` and,
 * unlike {@link WebdaQLString}, does not flag them as statements where a filter query is expected.
 */
export type WebdaQLStatement<T = unknown> = string & { readonly __webdaQL?: T; readonly __webdaQLStatement?: true };

/**
 * Thrown by `escape` when an interpolated value is not representable as a
 * WebdaQL literal (object, function, symbol, NaN, Infinity, a number needing an
 * exponent, an empty or nested array, or a null value anywhere but after `=` /
 * `!=`), and by `bind` when parameters do not match the query placeholders.
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
 *     `name = ${n} AND age = ${a}`
 *
 * is rewritten by the qlvalidator transformer to:
 *
 *     escape(["name = ", " AND age = ", ""], [n, a])
 *
 * Each value is escaped according to its runtime type, then concatenated
 * with the surrounding `parts` to form a parameterised query string that
 * cannot be used to inject grammar. Strings are quoted by the escaping, so
 * the template must not quote the interpolation itself. Queries built at
 * runtime use the same escaping through `bind()` and `?` / `:name` parameters.
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
    out = values[i] === null || values[i] === undefined ? appendNull(out) : out + escapeValue(values[i]);
    out += parts[i + 1];
  }
  return out as WebdaQLString<T>;
}

/**
 * Append a `null`/`undefined` value to the query built so far
 *
 * WebdaQL has no `NULL` literal, only `IS NULL` and `IS NOT NULL`, so `x = ${null}`
 * becomes `x IS NULL` and `x != ${null}` becomes `x IS NOT NULL`. Any other position
 * cannot express a null comparison and is rejected.
 *
 * @param out - the query built so far, ending right before the value
 * @returns the query with the null comparison
 */
function appendNull(out: string): string {
  // `=` or `!=` right before the value (`>=` and `<=` are not equalities); trimEnd keeps this linear
  const head = out.trimEnd();
  const operator = head.endsWith("!=") ? "!=" : head.endsWith("=") && !/[<>!]/.test(head.at(-2) ?? "") ? "=" : "";
  if (!operator) {
    throw new WebdaQLError("A null value can only be compared with = or != in a WebdaQL query");
  }
  return `${head.slice(0, -operator.length).trimEnd()} ${operator === "=" ? "IS NULL" : "IS NOT NULL"}`;
}

/**
 * Numbers WebdaQL can write: an optional minus sign, digits and an optional decimal part
 */
const NUMBER_LITERAL = /^-?\d+(\.\d+)?$/;

/**
 * Escape a single value to its WebdaQL literal form.
 *
 * @param value - the runtime value to convert to a WebdaQL literal
 * @returns a WebdaQL literal string representing the value
 * @internal exported only for testing
 */
export function escapeValue(value: unknown): string {
  if (value === null || value === undefined) {
    throw new WebdaQLError("A null value can only be compared with = or != in a WebdaQL query");
  }
  if (typeof value === "string") return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
  if (typeof value === "number") {
    const literal = String(value);
    // WebdaQL numbers are plain decimals: NaN, Infinity and exponent forms (1e+21) cannot be written
    if (!NUMBER_LITERAL.test(literal)) {
      throw new WebdaQLError(`Cannot embed ${value} in a WebdaQL query`);
    }
    return literal;
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return `'${value.toISOString().replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new WebdaQLError("Empty arrays are not representable in WebdaQL");
    }
    const parts: string[] = [];
    for (const item of value) {
      if (Array.isArray(item)) {
        throw new WebdaQLError("Nested arrays are not representable in WebdaQL");
      }
      parts.push(escapeValue(item));
    }
    return `[${parts.join(", ")}]`;
  }
  throw new WebdaQLError(`Cannot embed value of type ${typeof value} in a WebdaQL query`);
}
