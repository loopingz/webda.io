import { Token } from "antlr4ts";
import { CodeCompletionCore } from "antlr4-c3";
import { WebdaQLParserParser } from "./WebdaQLParserParser.js";
import { createTolerantParser } from "./query.js";
import { escapeValue } from "./webdaql-string.js";

/**
 * Kind of candidate offered by code completion
 */
export type CompletionKind = "keyword" | "operator" | "field" | "value" | "parameter" | "punctuation";

/**
 * Field metadata used to provide field completions and contextual value suggestions
 */
export interface CompletionField {
  /** Dotted path, e.g. "profile.email" */
  name: string;
  /** JSON schema type, used for value candidates */
  type?: "string" | "number" | "integer" | "boolean" | "array" | "object";
  /** Enum values from the schema */
  enum?: (string | number | boolean)[];
  /** Field description */
  description?: string;
}

/**
 * Relation metadata used to provide the candidates of a HYDRATE clause
 */
export interface CompletionRelation {
  /** Dotted relation path from the queried model, e.g. "project" or "project.team" */
  name: string;
  /** Identifier of the related model, shown as detail */
  model?: string;
}

/**
 * The relations of a model that can be hydrated: the subset of the `Metadata.Relations` of a model read by
 * {@link relationsFromGraph}
 */
export interface RelationGraphLike {
  /** Parent relation */
  parent?: { attribute: string; model: string };
  /** Links to other models */
  links?: { attribute: string; model: string }[];
}

/**
 * Options configuring WebdaQL code completion
 */
export interface CompletionOptions {
  /** Known fields; without them no field candidates are returned */
  fields?: CompletionField[];
  /**
   * Relations that can be hydrated (see {@link relationsFromGraph}): the candidates after `HYDRATE`, instead of the
   * fields. Without them no candidate is returned there
   */
  relations?: CompletionRelation[];
  /** Only offer filter-query syntax (no SELECT / DELETE / UPDATE): for REST, GraphQL, MCP Query operations */
  filterOnly?: boolean;
  /**
   * With `filterOnly`, also offer a `SELECT f1, f2 WHERE ...` field list (no aggregate functions, GROUP BY, DELETE
   * or UPDATE) and the `HYDRATE` clause: for the Query operations that return partial results (REST, gRPC, MCP).
   * `HYDRATE`, `INNER` and `LEFT` are not offered with `filterOnly` alone
   */
  fieldList?: boolean;
  /**
   * With `filterOnly`, also offer the `DELETE [WHERE ...]` and `UPDATE SET a = v [WHERE ...]` statements: for the
   * Query operations of the models that run them (see the `queryStatements` parameter of the DomainService)
   */
  statements?: boolean;
  /** Named parameters available (offered as `:name` where a value is expected) */
  parameters?: string[];
  /** Max candidates, default 50 */
  limit?: number;
}

/**
 * A single code completion suggestion
 */
export interface CompletionItem {
  /** Shown text, e.g. "ORDER BY", "priority", "TRUE" */
  label: string;
  /** Text to insert, e.g. "ORDER BY ", "'open'" */
  insertText: string;
  /** Category of the completion */
  kind: CompletionKind;
  /** Detail information (e.g. field type or description) */
  detail?: string;
  /** Range of the query replaced by insertText, [start, end) char offsets */
  range: [number, number];
}

/**
 * Result of querying completions at a caret position
 */
export interface CompletionResult {
  /** List of completion candidates */
  items: CompletionItem[];
  /** Partial word before the caret used for filtering */
  prefix: string;
}

/**
 * Minimal JSON Schema 7 subset for schema flattening without external dependencies
 */
export interface JSONSchema7Like {
  /**
   * Type
   */
  type?: string | string[];
  /**
   * Properties
   */
  properties?: Record<string, JSONSchema7Like | boolean>;
  /**
   * Enum
   */
  enum?: (string | number | boolean)[];
  /**
   * Description
   */
  description?: string;
  /**
   * Items
   */
  items?: JSONSchema7Like | boolean | (JSONSchema7Like | boolean)[];
  /**
   * $ref
   */
  $ref?: string;
  [key: string]: any;
}

const PREFERRED_RULES = new Set<number>([
  WebdaQLParserParser.RULE_identifier,
  WebdaQLParserParser.RULE_values,
  WebdaQLParserParser.RULE_booleanLiteral,
  WebdaQLParserParser.RULE_stringLiteral,
  WebdaQLParserParser.RULE_parameter
]);

const IGNORED_TOKENS = new Set<number>([
  WebdaQLParserParser.SPACE,
  WebdaQLParserParser.SINGLE_QUOTE_SYMB,
  WebdaQLParserParser.DOUBLE_QUOTE_SYMB,
  WebdaQLParserParser.IDENTIFIER_WITH_NUMBER,
  WebdaQLParserParser.FUNCTION_IDENTIFIER_WITH_UNDERSCORE,
  WebdaQLParserParser.DQUOTED_STRING_LITERAL,
  WebdaQLParserParser.SQUOTED_STRING_LITERAL,
  WebdaQLParserParser.INTEGER_LITERAL,
  WebdaQLParserParser.NUMBER_LITERAL,
  Token.EOF
]);

const COMPARISON_TOKENS = new Set<number>([
  WebdaQLParserParser.EQUAL,
  WebdaQLParserParser.NOT_EQUAL,
  WebdaQLParserParser.GREATER,
  WebdaQLParserParser.GREATER_OR_EQUAL,
  WebdaQLParserParser.LESS,
  WebdaQLParserParser.LESS_OR_EQUAL,
  WebdaQLParserParser.LIKE,
  WebdaQLParserParser.IN,
  WebdaQLParserParser.CONTAINS
]);

const PUNCTUATION_TOKENS = new Set<number>([
  WebdaQLParserParser.LR_BRACKET,
  WebdaQLParserParser.RR_BRACKET,
  WebdaQLParserParser.COMMA,
  WebdaQLParserParser.LR_SQ_BRACKET,
  WebdaQLParserParser.RR_SQ_BRACKET,
  WebdaQLParserParser.STAR
]);

const FILTER_ONLY_DROPPED = new Set<string>([
  "SELECT",
  "DELETE",
  "UPDATE",
  "SET",
  "WHERE",
  "GROUP BY",
  "AS",
  "DISTINCT",
  "COUNT",
  "SUM",
  "AVG",
  "MIN",
  "MAX",
  "HYDRATE",
  "INNER",
  "LEFT"
]);

/**
 * Kept with `filterOnly` and `fieldList`: a plain `SELECT` field list, its `WHERE` and the `HYDRATE` clause
 */
const FIELD_LIST_KEPT = ["SELECT", "WHERE", "HYDRATE", "INNER", "LEFT"];

/**
 * Kept with `filterOnly` and `statements`: the DELETE and UPDATE statements and their `WHERE`
 */
const STATEMENTS_KEPT = ["DELETE", "UPDATE", "SET", "WHERE"];

/**
 * The words `filterOnly` drops from the candidates, less what `fieldList` and `statements` keep
 * @param options - the completion options
 * @returns the dropped words
 */
function droppedWords(options: CompletionOptions): Set<string> {
  const kept = [...(options.fieldList ? FIELD_LIST_KEPT : []), ...(options.statements ? STATEMENTS_KEPT : [])];
  return new Set([...FILTER_ONLY_DROPPED].filter(word => !kept.includes(word)));
}

/**
 * Tokens that end a HYDRATE clause
 */
const AFTER_HYDRATE_TOKENS = new Set<number>([
  WebdaQLParserParser.ORDER_BY,
  WebdaQLParserParser.LIMIT,
  WebdaQLParserParser.OFFSET
]);

/**
 * Whether the caret is inside a HYDRATE clause: an identifier there is a relation path, not a field
 * @param tokens - the tokens of the query
 * @param caretTokenIndex - index of the token at the caret
 * @returns true after `HYDRATE`, until the next clause
 */
function isInHydrateClause(tokens: Token[], caretTokenIndex: number): boolean {
  for (let i = Math.min(caretTokenIndex, tokens.length) - 1; i >= 0; i--) {
    if (tokens[i].type === WebdaQLParserParser.HYDRATE) {
      return true;
    }
    if (AFTER_HYDRATE_TOKENS.has(tokens[i].type)) {
      return false;
    }
  }
  return false;
}

/**
 * The relations a HYDRATE clause can name, as completion candidates: the parent and the links of a model, and the
 * relations of their targets as dotted paths
 *
 * Reverse relations (`queries`), maps, polymorphic links, binaries and behaviors cannot be hydrated and are not
 * listed.
 * @param relations - the `Metadata.Relations` of the queried model
 * @param relations.parent - its parent relation
 * @param relations.links - its links
 * @param resolve - returns the `Metadata.Relations` of a model identifier, for the nested paths
 * @param maxDepth - the deepest path listed (default 2, the default hydration depth)
 * @returns the relation paths with their target model
 */
export function relationsFromGraph(
  relations: RelationGraphLike | undefined,
  resolve?: (model: string) => RelationGraphLike | undefined,
  maxDepth: number = 2
): CompletionRelation[] {
  const result: CompletionRelation[] = [];
  /**
   * List the relations of one model, then those of their targets
   * @param graph - the relations of the model
   * @param prefix - the path of the model from the queried model
   * @param depth - the depth of the listed paths
   */
  const collect = (graph: RelationGraphLike | undefined, prefix: string, depth: number): void => {
    for (const relation of [...(graph?.parent ? [graph.parent] : []), ...(graph?.links ?? [])]) {
      if (typeof relation?.attribute !== "string" || !relation.attribute) {
        continue;
      }
      const name = `${prefix}${relation.attribute}`;
      result.push({ name, model: relation.model });
      if (depth < maxDepth && resolve) {
        collect(resolve(relation.model), `${name}.`, depth + 1);
      }
    }
  };
  collect(relations, "", 1);
  return result;
}

const KIND_RANK: Record<CompletionKind, number> = {
  field: 1,
  value: 2,
  operator: 3,
  keyword: 4,
  parameter: 5,
  punctuation: 6
};

/**
 * Classify a grammar token into its CompletionKind
 *
 * @param type - ANTLR token type ID
 * @returns corresponding CompletionKind
 */
function classifyToken(type: number): CompletionKind {
  if (COMPARISON_TOKENS.has(type)) return "operator";
  if (PUNCTUATION_TOKENS.has(type)) return "punctuation";
  return "keyword";
}

/**
 * Check whether a token type is an identifier or keyword suitable for prefix matching
 *
 * @param type - ANTLR token type ID
 * @returns true if token is identifier or keyword
 */
function isIdentifierOrKeyword(type: number): boolean {
  if (type === WebdaQLParserParser.IDENTIFIER || type === WebdaQLParserParser.IDENTIFIER_WITH_NUMBER) return true;
  if (type === WebdaQLParserParser.SPACE || type === Token.EOF) return false;
  return !PUNCTUATION_TOKENS.has(type) && !COMPARISON_TOKENS.has(type);
}

/**
 * Context of a caret located inside a string literal
 */
interface StringLiteralContext {
  /**
   * Whether inside is enabled
   */
  inside: boolean;
  /**
   * Start
   */
  start: number;
  /**
   * End
   */
  end: number;
  /**
   * Prefix
   */
  prefix: string;
  /**
   * Range
   */
  range: [number, number];
}

/**
 * Check if the caret position is located inside an unclosed or closed string literal
 *
 * @param query - WebdaQL query string
 * @param caret - 0-based character offset of the caret
 * @returns StringLiteralContext describing if and where caret is inside a string
 */
function getStringLiteralContext(query: string, caret: number): StringLiteralContext {
  let inSingle = false;
  let inDouble = false;
  let quoteStart = -1;

  for (let i = 0; i < query.length; i++) {
    const ch = query[i];
    if (ch === "\\" && (inSingle || inDouble)) {
      i++;
      continue;
    }
    if (ch === "'" && !inDouble) {
      if (inSingle) {
        if (caret > quoteStart && caret <= i) {
          return {
            inside: true,
            start: quoteStart,
            end: i + 1,
            prefix: query.slice(quoteStart + 1, caret),
            range: [quoteStart, i + 1]
          };
        }
        inSingle = false;
        quoteStart = -1;
      } else {
        inSingle = true;
        quoteStart = i;
      }
    } else if (ch === '"' && !inSingle) {
      if (inDouble) {
        if (caret > quoteStart && caret <= i) {
          return {
            inside: true,
            start: quoteStart,
            end: i + 1,
            prefix: query.slice(quoteStart + 1, caret),
            range: [quoteStart, i + 1]
          };
        }
        inDouble = false;
        quoteStart = -1;
      } else {
        inDouble = true;
        quoteStart = i;
      }
    }
  }

  if ((inSingle || inDouble) && caret > quoteStart) {
    return {
      inside: true,
      start: quoteStart,
      end: caret,
      prefix: query.slice(quoteStart + 1, caret),
      range: [quoteStart, caret]
    };
  }

  return { inside: false, start: -1, end: -1, prefix: "", range: [caret, caret] };
}

/**
 * Walk back over token stream to find the identifier associated with an operator
 *
 * @param tokens - list of parsed tokens
 * @param beforeIndex - token index to start walking backwards from
 * @returns identifier name if found, undefined otherwise
 */
function findFieldBeforeOperator(tokens: Token[], beforeIndex: number): string | undefined {
  let operatorIndex = -1;
  for (let i = beforeIndex - 1; i >= 0; i--) {
    const t = tokens[i];
    if (COMPARISON_TOKENS.has(t.type) || t.type === WebdaQLParserParser.EQUAL) {
      operatorIndex = i;
      break;
    }
  }
  if (operatorIndex <= 0) return undefined;
  for (let i = operatorIndex - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.type === WebdaQLParserParser.IDENTIFIER || t.type === WebdaQLParserParser.IDENTIFIER_WITH_NUMBER) {
      return t.text;
    }
    if (
      t.type === WebdaQLParserParser.AND ||
      t.type === WebdaQLParserParser.OR ||
      t.type === WebdaQLParserParser.WHERE ||
      t.type === WebdaQLParserParser.SELECT ||
      t.type === WebdaQLParserParser.UPDATE ||
      t.type === WebdaQLParserParser.DELETE
    ) {
      break;
    }
  }
  return undefined;
}

/**
 * Flatten a JSON schema into completion fields (nested objects as dotted paths, max depth 3)
 *
 * @param schema - JSON Schema 7 like object
 * @param maxDepth - Maximum nesting depth (default 3)
 * @returns Array of completion fields
 */
export function fieldsFromSchema(schema: JSONSchema7Like, maxDepth = 3): CompletionField[] {
  if (!schema || typeof schema !== "object" || !schema.properties) {
    return [];
  }

  /**
   * Recursively collect fields from properties
   *
   * @param properties - JSON schema properties map
   * @param prefix - dotted path prefix for nested fields
   * @param currentDepth - current recursion depth
   * @returns array of flattened completion fields
   */
  function collect(
    properties: Record<string, JSONSchema7Like | boolean>,
    prefix: string,
    currentDepth: number
  ): CompletionField[] {
    const result: CompletionField[] = [];

    for (const [key, prop] of Object.entries(properties)) {
      if (typeof prop === "boolean") {
        if (prop) {
          result.push({ name: prefix ? `${prefix}.${key}` : key });
        }
        continue;
      }
      if (prop.$ref) {
        continue;
      }

      const fieldName = prefix ? `${prefix}.${key}` : key;
      const propType = Array.isArray(prop.type) ? prop.type.find(t => t !== "null") : prop.type;

      if (propType === "object" && prop.properties && currentDepth < maxDepth) {
        result.push(...collect(prop.properties, fieldName, currentDepth + 1));
      } else {
        const item: CompletionField = { name: fieldName };
        if (typeof propType === "string") {
          item.type = propType as any;
        }
        if (Array.isArray(prop.enum)) {
          item.enum = prop.enum;
        }
        if (typeof prop.description === "string") {
          item.description = prop.description;
        }
        result.push(item);
      }
    }

    return result;
  }

  return collect(schema.properties, "", 1);
}

/**
 * Get code completion items for a WebdaQL query at the specified caret offset
 *
 * @param query - The WebdaQL query string
 * @param caret - 0-based character offset of the caret
 * @param options - Completion configuration options
 * @returns Completion results with candidates and filtering prefix
 */
export function getCompletions(query: string, caret: number, options?: CompletionOptions): CompletionResult {
  try {
    if (typeof query !== "string") {
      return { items: [], prefix: "" };
    }
    const clampedCaret = Math.max(0, Math.min(query.length, typeof caret === "number" ? caret : 0));

    // Handle caret inside a string literal
    const strCtx = getStringLiteralContext(query, clampedCaret);
    if (strCtx.inside) {
      const { tokens } = createTolerantParser(query.slice(0, strCtx.start));
      tokens.fill();
      const allTokens = tokens.getTokens();
      const fieldName = findFieldBeforeOperator(allTokens, allTokens.length);
      const field = options?.fields?.find(f => f.name === fieldName);

      if (!field || !field.enum) {
        return { items: [], prefix: strCtx.prefix };
      }

      const items: CompletionItem[] = [];
      for (const val of field.enum) {
        const escaped = escapeValue(val);
        items.push({
          label: escaped,
          insertText: escaped,
          kind: "value",
          detail: field.description || field.type,
          range: strCtx.range
        });
      }

      const filtered = items.filter(it => {
        const unquoted = it.label.replace(/^['"]|['"]$/g, "");
        return unquoted.startsWith(strCtx.prefix) || it.label.startsWith(strCtx.prefix);
      });

      return { items: filtered, prefix: strCtx.prefix };
    }

    // Normal parsing
    const { parser, tokens } = createTolerantParser(query);
    tokens.fill();
    const allTokens = tokens.getTokens();

    let prefix = "";
    let range: [number, number] = [clampedCaret, clampedCaret];
    let caretTokenIndex = allTokens.length - 1;

    for (let i = 0; i < allTokens.length; i++) {
      const t = allTokens[i];
      if (t.type === Token.EOF) continue;
      if (isIdentifierOrKeyword(t.type)) {
        if (clampedCaret > t.startIndex && clampedCaret <= t.stopIndex + 1) {
          prefix = query.slice(t.startIndex, clampedCaret);
          range = [t.startIndex, t.stopIndex + 1];
          caretTokenIndex = t.tokenIndex;
          break;
        }
      }
    }

    if (prefix === "") {
      for (let i = 0; i < allTokens.length; i++) {
        const t = allTokens[i];
        if (t.stopIndex + 1 >= clampedCaret) {
          caretTokenIndex = t.tokenIndex;
          break;
        }
      }
    }

    const c3 = new CodeCompletionCore(parser);
    c3.preferredRules = PREFERRED_RULES;
    c3.ignoredTokens = IGNORED_TOKENS;

    const res = c3.collectCandidates(caretTokenIndex);
    let items: CompletionItem[] = [];

    // 1. Process candidate rules
    for (const [ruleIndex] of res.rules) {
      if (ruleIndex === WebdaQLParserParser.RULE_identifier) {
        if (isInHydrateClause(allTokens, caretTokenIndex)) {
          // A relation path: `project`, and `project.team` once `project.` is typed (candidates are prefix-filtered)
          for (const relation of options?.relations ?? []) {
            items.push({
              label: relation.name,
              insertText: relation.name,
              kind: "field",
              detail: relation.model,
              range
            });
          }
        } else if (options?.fields) {
          for (const f of options.fields) {
            items.push({
              label: f.name,
              insertText: f.name,
              kind: "field",
              detail: f.description || f.type,
              range
            });
          }
        }
      } else if (
        ruleIndex === WebdaQLParserParser.RULE_values ||
        ruleIndex === WebdaQLParserParser.RULE_booleanLiteral ||
        ruleIndex === WebdaQLParserParser.RULE_stringLiteral
      ) {
        const fieldName = findFieldBeforeOperator(allTokens, caretTokenIndex);
        const field = options?.fields?.find(f => f.name === fieldName);
        if (field) {
          if (field.enum) {
            for (const val of field.enum) {
              const escaped = escapeValue(val);
              items.push({
                label: escaped,
                insertText: escaped,
                kind: "value",
                detail: field.description || field.type,
                range
              });
            }
          }
          if (field.type === "boolean") {
            items.push({
              label: "TRUE",
              insertText: "TRUE",
              kind: "value",
              detail: field.description || field.type,
              range
            });
            items.push({
              label: "FALSE",
              insertText: "FALSE",
              kind: "value",
              detail: field.description || field.type,
              range
            });
          }
        }
      } else if (ruleIndex === WebdaQLParserParser.RULE_parameter) {
        items.push({ label: "?", insertText: "?", kind: "parameter", range });
        if (options?.parameters) {
          for (const p of options.parameters) {
            const name = p.startsWith(":") ? p : `:${p}`;
            items.push({ label: name, insertText: name, kind: "parameter", range });
          }
        }
      }
    }

    // 2. Process candidate tokens
    for (const [tokenType, followList] of res.tokens) {
      if (tokenType === WebdaQLParserParser.IS) {
        items.push({ label: "IS NULL", insertText: "IS NULL ", kind: "operator", range });
        items.push({ label: "IS NOT NULL", insertText: "IS NOT NULL ", kind: "operator", range });
        continue;
      }

      const rawName = parser.vocabulary.getLiteralName(tokenType) || parser.vocabulary.getSymbolicName(tokenType);
      if (!rawName) continue;
      const cleanName = rawName.replace(/^['"]|['"]$/g, "");
      const kind = classifyToken(tokenType);

      if (followList && followList.length > 0) {
        const followKeywordNames: string[] = [];
        let allKeywords = true;
        for (const t of followList) {
          if (classifyToken(t) === "keyword") {
            const name = (parser.vocabulary.getLiteralName(t) || parser.vocabulary.getSymbolicName(t) || "").replace(
              /^['"]|['"]$/g,
              ""
            );
            if (name) followKeywordNames.push(name);
          } else {
            allKeywords = false;
            break;
          }
        }
        if (allKeywords && followKeywordNames.length > 0) {
          const combined = [cleanName, ...followKeywordNames].join(" ");
          items.push({ label: combined, insertText: `${combined} `, kind, range });
        }
      }

      const insertText = kind === "punctuation" ? cleanName : `${cleanName} `;
      items.push({ label: cleanName, insertText, kind, range });
    }

    // 3. Filter by prefix
    if (prefix) {
      items = items.filter(it => {
        if (it.kind === "field") {
          return it.label.startsWith(prefix);
        } else if (it.kind === "keyword" || it.kind === "operator") {
          return it.label.toLowerCase().startsWith(prefix.toLowerCase());
        } else if (it.kind === "value") {
          const unquoted = it.label.replace(/^['"]|['"]$/g, "");
          return unquoted.startsWith(prefix) || it.label.startsWith(prefix);
        } else {
          return it.label.startsWith(prefix);
        }
      });
    }

    // 4. Handle filterOnly option
    if (options?.filterOnly) {
      const dropped = droppedWords(options);
      // A whole label ("GROUP BY") or one of its words ("COUNT (")
      items = items.filter(it => !dropped.has(it.label) && !it.label.split(/\s+/).some(w => dropped.has(w)));
    }

    // 5. Deduplicate items by label
    const seen = new Set<string>();
    const deduped: CompletionItem[] = [];
    for (const it of items) {
      if (!seen.has(it.label)) {
        seen.add(it.label);
        deduped.push(it);
      }
    }

    // 6. Rank by kind then alphabetically
    deduped.sort((a, b) => {
      const diff = KIND_RANK[a.kind] - KIND_RANK[b.kind];
      if (diff !== 0) return diff;
      return a.label.localeCompare(b.label);
    });

    const limit = options?.limit ?? 50;
    return { items: deduped.slice(0, limit), prefix };
  } catch (_e) {
    return { items: [], prefix: "" };
  }
}
