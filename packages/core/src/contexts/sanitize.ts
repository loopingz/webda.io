import type sanitize from "sanitize-html";
import { resolveInputSchema } from "../rest/binding.js";

/**
 * sanitize-html, imported with the first input to sanitize: it loads an HTML and CSS parsing stack
 */
let sanitizeHtml: typeof sanitize;

/**
 * JSON Schema keyword naming how the HTML sanitization of client input treats a property
 *
 * Set by the compiler from a `@sanitize` JSDoc tag. `none` keeps the text as the client sent it, any other value
 * (`text`, the default, or a profile this version does not know) is sanitized.
 */
export const SANITIZE_KEYWORD = "x-webda-sanitize";

/**
 * Value of {@link SANITIZE_KEYWORD} opting a text out of the HTML sanitization
 */
export const SANITIZE_NONE = "none";

/**
 * Options of the input sanitization: the sanitize-html options, plus what to leave as received
 */
export type SanitizeInputOptions = sanitize.IOptions & {
  /**
   * `true` skips the sanitization, a list names the keys (dotted paths) whose whole value is left untouched
   */
  raw?: boolean | string[];
  /**
   * Dotted paths whose **string** value is kept as received, `*` standing for any array index or object key
   * (`tags.*`, `items.*.label`). A value that is not a string is sanitized like any other.
   */
  rawText?: string[];
};

/**
 * Sanitization applied when no option is given: every tag is removed, entities are escaped
 */
export const DEFAULT_SANITIZE_OPTIONS: sanitize.IOptions = { allowedTags: [], allowedAttributes: {} };

/**
 * Check whether a path is one of the raw text paths
 * @param patterns - the raw text paths, split in segments
 * @param segments - the path of a value
 * @returns true when a pattern has the same segments, `*` matching any
 */
function matchesRawText(patterns: string[][], segments: string[]): boolean {
  return patterns.some(
    pattern =>
      pattern.length === segments.length &&
      pattern.every(function sameSegment(part, i) {
        return part === "*" || part === segments[i];
      })
  );
}

/**
 * Sanitize every string of a parsed JSON value, in place
 * @param value - the value
 * @param options - the sanitization options
 * @param patterns - the raw text paths, split in segments
 * @param segments - the path of the value
 * @returns the sanitized value
 */
function sanitizeValue(value: any, options: SanitizeInputOptions, patterns: string[][], segments: string[]): any {
  if (typeof value === "string") {
    return sanitizeHtml(value, options);
  }
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) {
        delete value[key];
        continue;
      }
      const path = [...segments, key];
      if (Array.isArray(options.raw) && options.raw.includes(path.join("."))) {
        continue;
      }
      if (typeof value[key] === "string" && matchesRawText(patterns, path)) {
        continue;
      }
      value[key] = sanitizeValue(value[key], options, patterns, path);
    }
  }
  return value;
}

/**
 * HTML-sanitize every string of a parsed JSON value, in place, with the given sanitize-html options as they are
 *
 * `__proto__`, `constructor` and `prototype` keys are removed on the way.
 * @param value - the parsed JSON value
 * @param options - the sanitize-html options, and the paths to leave as received
 * @returns the sanitized value
 */
export async function sanitizeInputWith<T = any>(value: T, options: SanitizeInputOptions): Promise<T> {
  sanitizeHtml ??= (await import("sanitize-html")).default;
  const patterns = (options.rawText ?? []).map(function splitPath(path) {
    return path.split(".");
  });
  return sanitizeValue(value, options, patterns, []) as T;
}

/**
 * HTML-sanitize every string of a parsed JSON value, in place: every tag is removed and entities are escaped,
 * unless the options say otherwise
 *
 * `__proto__`, `constructor` and `prototype` keys are removed on the way.
 * @param value - the parsed JSON value
 * @param options - sanitize-html options replacing the defaults, and the paths to leave as received
 * @returns the sanitized value
 */
export async function sanitizeInput<T = any>(value: T, options: SanitizeInputOptions = {}): Promise<T> {
  return sanitizeInputWith(value, { ...DEFAULT_SANITIZE_OPTIONS, ...options });
}

/**
 * Check whether a schema only accepts a string (or null)
 * @param schema - the schema, references resolved
 * @param root - the schema carrying the definitions
 * @returns true for `string`, `string | null` and unions of those
 */
function isTextSchema(schema: any, root: any): boolean {
  schema = resolveInputSchema(schema, root);
  if (!schema || typeof schema !== "object") {
    return false;
  }
  const choices = schema.anyOf ?? schema.oneOf;
  if (Array.isArray(choices)) {
    return (
      choices.some(choice => resolveInputSchema(choice, root)?.type !== "null") &&
      choices.every(choice => resolveInputSchema(choice, root)?.type === "null" || isTextSchema(choice, root))
    );
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  return types.includes("string") && types.every(type => type === "string" || type === "null");
}

/**
 * Deepest schema nesting followed while looking for raw text paths
 */
const MAX_SCHEMA_DEPTH = 32;

/**
 * Raw text paths per schema object: a schema is walked once, not on every call
 */
const rawTextPathsCache = new WeakMap<object, string[]>();

/**
 * Dotted paths of the texts an input schema opts out of the HTML sanitization (`x-webda-sanitize: none`)
 *
 * The keyword only counts on a string, an array of strings or a record of strings: on any other schema it is
 * ignored, so an object or a free-form value is always sanitized. Nested properties, array items (`items.*.label`)
 * and record values are followed, as are local `$ref`s.
 * @param schema - the input schema
 * @param root - the schema carrying the definitions
 * @returns the paths, `*` standing for any array index or record key
 */
export function getRawTextPaths(schema: any, root: any = schema): string[] {
  if (!schema || typeof schema !== "object") {
    return [];
  }
  const cached = root === schema ? rawTextPathsCache.get(schema) : undefined;
  if (cached) {
    return cached;
  }
  const paths = new Set<string>();
  const visiting = new Set<any>();
  /**
   * Collect the raw text paths below a schema node
   * @param node - the schema node
   * @param path - its path in the input
   * @param none - whether an array or a record above it opted out
   */
  const visit = function visit(node: any, path: string[], none: boolean) {
    node = resolveInputSchema(node, root);
    if (!node || typeof node !== "object" || visiting.has(node) || path.length > MAX_SCHEMA_DEPTH) {
      return;
    }
    none ||= node[SANITIZE_KEYWORD] === SANITIZE_NONE;
    if (isTextSchema(node, root)) {
      // The root of an input is never a text: only a property, an item or a record value can be kept
      if (none && path.length > 0) {
        paths.add(path.join("."));
      }
      return;
    }
    visiting.add(node);
    for (const branch of [...(node.anyOf ?? []), ...(node.oneOf ?? []), ...(node.allOf ?? [])]) {
      visit(branch, path, none);
    }
    // An opt-out is inherited by the items of an array and the values of a record, never by the properties of an object
    for (const [name, property] of Object.entries(node.properties ?? {})) {
      // A dot or a star in a name cannot be told from a path separator or a wildcard: such a property stays
      // sanitized, like a private (`__`) one, which is never taken from a client
      if (!name.includes(".") && name !== "*" && !name.startsWith("__")) {
        visit(property, [...path, name], false);
      }
    }
    for (const items of Array.isArray(node.items) ? node.items : [node.items]) {
      visit(items, [...path, "*"], none);
    }
    if (node.additionalProperties && typeof node.additionalProperties === "object") {
      visit(node.additionalProperties, [...path, "*"], none && !node.properties);
    }
    visiting.delete(node);
  };
  visit(schema, [], false);
  const result = [...paths];
  if (root === schema) {
    rawTextPathsCache.set(schema, result);
  }
  return result;
}
