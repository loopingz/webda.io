import { CharStreams, Token } from "antlr4ts";
import { WebdaQLLexer } from "./WebdaQLLexer.js";
import { validateSyntax } from "./query.js";
import { escape, WebdaQLError, type WebdaQLString } from "./webdaql-string.js";

/**
 * Values for the placeholders of a query: an array for `?`, an object for `:name`
 */
export type QueryParameters = readonly unknown[] | Readonly<Record<string, unknown>>;

/**
 * Tokenize a query, throwing on characters the lexer does not know
 * @param query - the query string
 * @returns the tokens
 */
function tokenize(query: string): Token[] {
  const lexer = new WebdaQLLexer(CharStreams.fromString(query));
  lexer.removeErrorListeners();
  lexer.addErrorListener({
    syntaxError: (_recognizer, _symbol, _line, _position, msg) => {
      throw new SyntaxError(`${msg} (Query: ${query})`);
    }
  });
  return lexer.getAllTokens();
}

/**
 * Number of values given as parameters
 * @param params - the parameters
 * @returns the count of values
 */
function countParameters(params: QueryParameters | undefined): number {
  if (params === undefined) return 0;
  return Array.isArray(params) ? params.length : Object.keys(params).length;
}

/**
 * Plural helper for error messages
 * @param count - the count
 * @param word - the singular word
 * @returns the count with the word, pluralized
 */
function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * Bind the `?` or `:name` placeholders of a WebdaQL query to values
 *
 * ```ts
 * bind("status = ? AND owner IN ?", ["open", ["alice", "bob"]]);
 * // status = 'open' AND owner IN ['alice', 'bob']
 * bind("owner = :owner AND priority >= :min", { owner: "alice", min: 2 });
 * // owner = 'alice' AND priority >= 2
 * ```
 *
 * Placeholders are found by the WebdaQL lexer, so a `?` or `:name` inside a quoted string is
 * left alone, and the grammar only accepts them where a value is expected: a placeholder can
 * never become an attribute, an operator or a keyword. Values are escaped exactly like the
 * template literals rewritten at compile time (see {@link escape}), including `= ?` with
 * `null` or `undefined` becoming `IS NULL` and `!= ?` becoming `IS NOT NULL`.
 *
 * @param query - the query, with `?` or `:name` placeholders
 * @param params - an array of values for `?`, an object of values for `:name`
 * @returns the query with every placeholder replaced by its escaped value
 * @throws {SyntaxError} if the query does not follow the grammar, e.g. a placeholder used as an attribute
 * @throws {WebdaQLError} if parameters are missing, extra, unused, mixed, or not representable
 */
export function bind<T = unknown>(query: string, params?: QueryParameters): WebdaQLString<T> {
  query ??= "";
  const placeholders = tokenize(query).filter(
    token => token.type === WebdaQLLexer.POSITIONAL_PARAMETER || token.type === WebdaQLLexer.NAMED_PARAMETER
  );
  if (placeholders.length === 0) {
    if (countParameters(params) > 0) {
      throw new WebdaQLError(`WebdaQL query has no parameters, but ${plural(countParameters(params), "value")} given`);
    }
    return query as WebdaQLString<T>;
  }
  if (params === undefined) {
    throw new WebdaQLError(`Unbound parameter '${placeholders[0].text}' in WebdaQL query: no parameters given`);
  }
  const named = placeholders[0].type === WebdaQLLexer.NAMED_PARAMETER;
  if (placeholders.some(token => (token.type === WebdaQLLexer.NAMED_PARAMETER) !== named)) {
    throw new WebdaQLError("Cannot mix positional (?) and named (:name) parameters in one WebdaQL query");
  }
  // Placeholders are only allowed where a value is expected
  validateSyntax(query);

  const values = named ? namedValues(placeholders, params) : positionalValues(placeholders, params);
  const parts: string[] = [];
  let position = 0;
  for (const token of placeholders) {
    parts.push(query.substring(position, token.startIndex));
    position = token.stopIndex + 1;
  }
  parts.push(query.substring(position));

  const bound = escape<T>(parts, values);
  try {
    // A value can still be invalid where it is used, e.g. an array compared with `=`
    validateSyntax(bound);
  } catch (err) {
    throw new WebdaQLError(`Invalid parameter value in WebdaQL query: ${(err as Error).message}`);
  }
  return bound;
}

/**
 * Values of the `?` placeholders, in order
 * @param placeholders - the placeholder tokens
 * @param params - the parameters
 * @returns the values
 */
function positionalValues(placeholders: Token[], params: QueryParameters): unknown[] {
  if (!Array.isArray(params)) {
    throw new WebdaQLError("WebdaQL positional parameters need an array of values");
  }
  if (params.length !== placeholders.length) {
    throw new WebdaQLError(
      `WebdaQL query has ${plural(placeholders.length, "positional parameter")} but ${plural(params.length, "value")} ${params.length === 1 ? "was" : "were"} given`
    );
  }
  return [...params];
}

/**
 * Values of the `:name` placeholders, in order; a name can be used several times
 * @param placeholders - the placeholder tokens
 * @param params - the parameters
 * @returns the values
 */
function namedValues(placeholders: Token[], params: QueryParameters): unknown[] {
  if (Array.isArray(params)) {
    throw new WebdaQLError("WebdaQL named parameters need an object of values");
  }
  const record = params as Readonly<Record<string, unknown>>;
  const used = new Set<string>();
  const values = placeholders.map(token => {
    const name = token.text!.substring(1);
    // Own properties only: `:constructor` must not read Object.prototype
    if (!Object.prototype.hasOwnProperty.call(record, name)) {
      throw new WebdaQLError(`Missing named parameter ':${name}' in WebdaQL query`);
    }
    used.add(name);
    return record[name];
  });
  const unused = Object.keys(record).filter(name => !used.has(name));
  if (unused.length) {
    throw new WebdaQLError(
      `Unused named parameter${unused.length === 1 ? "" : "s"} '${unused.join("', '")}' in WebdaQL query`
    );
  }
  return values;
}
