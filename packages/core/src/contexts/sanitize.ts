import type sanitize from "sanitize-html";
import { resolveInputSchema } from "../rest/binding.js";
import { NotImplemented } from "../errors/errors.js";
import { useModelMetadata } from "../core/hooks.js";

/**
 * sanitize-html, imported with the first input to sanitize: it loads an HTML and CSS parsing stack
 */
let sanitizeHtml: typeof sanitize;

/**
 * The packages the `markdown` mode needs: optional peer dependencies, installed by the applications that use it
 */
export const MARKDOWN_PACKAGES: readonly string[] = ["micromark", "micromark-util-decode-string"];

/**
 * A text cannot be sanitized because the packages of its mode are not installed
 *
 * It is never replaced by another sanitization, nor by none: the request fails, and so does an operation whose
 * input holds such a text.
 */
export class SanitizerUnavailable extends NotImplemented {
  /**
   * Create a new SanitizerUnavailable
   * @param cause - the import error
   */
  constructor(cause?: unknown) {
    super(
      `The \`markdown\` sanitization (\`@sanitize markdown\`, "x-webda-sanitize": "markdown") requires the packages ` +
        `${MARKDOWN_PACKAGES.join(" and ")}: install them in the application ` +
        `(pnpm add ${MARKDOWN_PACKAGES.join(" ")})`
    );
    this.cause = cause;
  }
}

/**
 * The micromark functions the `markdown` mode needs, imported with the first Markdown text to sanitize
 */
let markdown: {
  /**
   * Parse a Markdown source into micromark events (`[kind, token, context]`), without compiling it to HTML
   */
  events: (value: string) => [string, { type: string; start: { offset: number }; end: { offset: number } }, unknown][];
  /**
   * Resolve the backslash escapes and the character references of a Markdown string
   */
  decodeString: (value: string) => string;
};

/**
 * JSON Schema keyword naming how the sanitization of client input treats a text
 *
 * Set by the compiler from a `@sanitize` JSDoc tag, one of the {@link SANITIZE_MODES}. Any other value (a mode this
 * version does not know) is sanitized like `text`.
 */
export const SANITIZE_KEYWORD = "x-webda-sanitize";

/**
 * Mode of {@link SANITIZE_KEYWORD} keeping a text as the client sent it
 */
export const SANITIZE_NONE = "none";

/**
 * Mode of {@link SANITIZE_KEYWORD} for rich text: the default allowlist of sanitize-html (formatting, links, lists
 * and tables; no script, style or image)
 */
export const SANITIZE_HTML = "html";

/**
 * Mode of {@link SANITIZE_KEYWORD} for a Markdown source: kept as written, except raw HTML and unsafe link schemes
 */
export const SANITIZE_MARKDOWN = "markdown";

/**
 * Mode of {@link SANITIZE_KEYWORD} naming the default: every tag is removed, entities are escaped
 */
export const SANITIZE_TEXT = "text";

/**
 * The modes of {@link SANITIZE_KEYWORD} that change how a text is sanitized: `text`, and any unknown mode, is the
 * default sanitization
 */
export const SANITIZE_MODES: readonly string[] = [SANITIZE_NONE, SANITIZE_HTML, SANITIZE_MARKDOWN];

/**
 * Last segment of a path standing for the value at the path and everything below it, at any depth
 * (`meta.**`): the mode of a free-form value
 */
export const SANITIZE_DEEP = "**";

/**
 * Sanitization mode per path: a dotted path, `*` standing for any array index or object key (`tags.*`,
 * `items.*.label`), and one of the {@link SANITIZE_MODES}. A path ending with {@link SANITIZE_DEEP} applies to every
 * text of the value at its prefix, unless a more specific path names another mode
 */
export type SanitizeModes = Record<string, string>;

/**
 * Options of the input sanitization: the sanitize-html options of the default (`text`) sanitization, plus what is
 * sanitized another way
 */
export type SanitizeInputOptions = sanitize.IOptions & {
  /**
   * `true` skips the sanitization, a list names the keys (dotted paths) whose whole value is left untouched
   */
  raw?: boolean | string[];
  /**
   * The paths whose **string** value is sanitized with another mode (`none`, `html`, `markdown`); a path ending
   * with {@link SANITIZE_DEEP} names every string below its prefix. A value that is not a string is sanitized like
   * any other.
   */
  modes?: SanitizeModes;
};

/**
 * Sanitization applied when no option is given: every tag is removed, entities are escaped
 */
export const DEFAULT_SANITIZE_OPTIONS: sanitize.IOptions = { allowedTags: [], allowedAttributes: {} };

/**
 * URL schemes a Markdown link, image or autolink may use
 */
const SAFE_MARKDOWN_SCHEME = /^(https?|mailto|tel)$/i;

/**
 * Times a Markdown text is parsed and edited before giving up: an edit can reveal a construct (a link inside what
 * was an HTML block), which the next pass handles
 */
const MAX_MARKDOWN_PASSES = 3;

/**
 * A sanitization mode and the path it applies to
 */
type ModePattern = {
  /**
   * The path, split in segments, without its trailing {@link SANITIZE_DEEP}
   */
  segments: string[];
  /**
   * The path ended with {@link SANITIZE_DEEP}: it also matches every path below it
   */
  deep: boolean;
  /**
   * The mode
   */
  mode: string;
};

/**
 * Check whether a Markdown destination uses a scheme a renderer must not link to
 * @param destination - the destination, as written in the source
 * @returns true when it has a scheme (a `:` before any `/`, `?` or `#`) other than http, https, mailto or tel
 */
function hasUnsafeScheme(destination: string): boolean {
  const url = markdown.decodeString(destination);
  const colon = url.indexOf(":");
  if (colon < 0 || /[/?#]/.test(url.slice(0, colon))) {
    return false;
  }
  return !SAFE_MARKDOWN_SCHEME.test(url.slice(0, colon));
}

/**
 * The edits that neutralize the active content of a Markdown source: raw HTML and unsafe destinations
 * @param value - the Markdown source, without byte order mark
 * @returns the replacements, as `[start, end, text]`
 */
function markdownEdits(value: string): [number, number, string][] {
  const edits: [number, number, string][] = [];
  for (const [kind, token] of markdown.events(value)) {
    if (kind !== "enter") {
      continue;
    }
    const start = token.start.offset;
    const end = token.end.offset;
    if (token.type === "htmlFlow" || token.type === "htmlText") {
      // Escaped, not removed: `Array<string>` written outside a code span stays readable
      edits.push([start, end, value.slice(start, end).replace(/</g, "&lt;")]);
    } else if (token.type === "autolinkProtocol" && hasUnsafeScheme(value.slice(start, end))) {
      // The `<` opening the autolink
      edits.push([start - 1, start, "&lt;"]);
    } else if (
      (token.type === "resourceDestinationString" || token.type === "definitionDestinationString") &&
      hasUnsafeScheme(value.slice(start, end))
    ) {
      edits.push([start, end, "#"]);
    }
  }
  return edits;
}

/**
 * Sanitize a Markdown source, micromark and sanitize-html being loaded
 * @param value - the Markdown source
 * @returns the source, without raw HTML nor unsafe destination
 */
function sanitizeMarkdownText(value: string): string {
  // micromark drops a leading byte order mark, and counts its offsets without it
  const bom = value.charCodeAt(0) === 0xfeff ? value[0] : "";
  let text = value.slice(bom.length);
  // One parse more than the passes: the text is only returned once a parse finds nothing left to neutralize
  for (let pass = 0; pass <= MAX_MARKDOWN_PASSES; pass++) {
    const edits = markdownEdits(text);
    if (edits.length === 0) {
      return bom + text;
    }
    // From the end, so the offsets of the edits still to apply stay valid
    for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) {
      text = text.slice(0, start) + replacement + text.slice(end);
    }
  }
  // Still not clean: nothing of it is trusted. As text it holds no `<` anymore, so no raw HTML, autolink nor
  // `<destination>`; the links and the definitions that are left are broken too (`](` and `]:` escaped), since their
  // destination was not checked
  return sanitizeHtml(value, DEFAULT_SANITIZE_OPTIONS).replace(/\](?=[(:])/g, "]\\");
}

/**
 * Import micromark, with the first Markdown text to sanitize
 * @throws SanitizerUnavailable when micromark or micromark-util-decode-string is not installed
 */
async function loadMarkdown(): Promise<void> {
  if (markdown) {
    return;
  }
  try {
    const { parse, preprocess, postprocess } = await import("micromark");
    const { decodeString } = await import("micromark-util-decode-string");
    markdown = {
      /**
       * Parse a Markdown source into events: the parser only, nothing is compiled to HTML
       * @param value - the Markdown source
       * @returns the events
       */
      events: function events(value: string) {
        return postprocess(
          parse()
            .document()
            .write(preprocess()(value, undefined, true))
        ) as any;
      },
      decodeString
    };
  } catch (err) {
    throw new SanitizerUnavailable(err);
  }
}

/**
 * Sanitize a Markdown source (CommonMark, as parsed by micromark)
 *
 * The source is kept as written (`&`, `>`, code spans and code blocks are untouched), except what a renderer would
 * pass through as active content:
 * - raw HTML, block or inline: every `<` of it is replaced by `&lt;`;
 * - an autolink (`<scheme:...>`) with an unsafe scheme: its `<` is replaced by `&lt;`;
 * - the destination of a link, an image or a reference definition with an unsafe scheme: replaced by `#`.
 *
 * A scheme is unsafe when it is not http, https, mailto or tel; relative URLs and anchors are kept. The result is
 * parsed again until nothing is left to neutralize; a text that does not settle is sanitized like `text`, and its
 * links and reference definitions are escaped (`]\(`, `]\:`).
 *
 * This is defense in depth: the renderer must still not enable raw HTML, or must sanitize its output. It does not
 * cover MDX, nor syntax extensions that give other constructs a meaning.
 * @param value - the Markdown source
 * @returns the sanitized source
 * @throws SanitizerUnavailable when micromark or micromark-util-decode-string is not installed
 */
export async function sanitizeMarkdown(value: string): Promise<string> {
  sanitizeHtml ??= (await import("sanitize-html")).default;
  await loadMarkdown();
  return sanitizeMarkdownText(value);
}

/**
 * The mode of a path
 *
 * The first pattern with the same segments wins (`*` matching any); else the deep pattern (`a.**`) with the longest
 * prefix of the path, so a mode named for an attribute of a free-form value overrides the mode of the value.
 * @param patterns - the modes, their path split in segments
 * @param segments - the path of a value
 * @returns the mode, undefined for the default
 */
function getMode(patterns: ModePattern[], segments: string[]): string | undefined {
  /**
   * Check whether the segments of a pattern match the start of the path
   * @param pattern - the pattern
   * @returns true when each segment of the pattern is `*` or the segment of the path at its index
   */
  const prefixOf = function prefixOf(pattern: ModePattern): boolean {
    return pattern.segments.every(function sameSegment(part, i) {
      return part === "*" || part === segments[i];
    });
  };
  const exact = patterns.find(
    pattern => !pattern.deep && pattern.segments.length === segments.length && prefixOf(pattern)
  );
  if (exact) {
    return exact.mode;
  }
  let deepest: ModePattern | undefined;
  for (const pattern of patterns) {
    if (
      pattern.deep &&
      pattern.segments.length <= segments.length &&
      (!deepest || pattern.segments.length > deepest.segments.length) &&
      prefixOf(pattern)
    ) {
      deepest = pattern;
    }
  }
  return deepest?.mode;
}

/**
 * Keys never copied from client input: writing them could reach a prototype
 */
const UNSAFE_KEYS = ["__proto__", "constructor", "prototype"];

/**
 * What a pass over an input found that it could not do
 */
type SanitizeState = {
  /**
   * A Markdown text was met while micromark was not loaded: the pass is to be run again once it is
   */
  markdownNeeded: boolean;
};

/**
 * Sanitize a text with its mode
 * @param value - the text
 * @param mode - its mode, undefined for the default
 * @param options - the options of the default sanitization
 * @param state - what the pass could not do
 * @returns the sanitized text
 */
function sanitizeText(
  value: string,
  mode: string | undefined,
  options: SanitizeInputOptions,
  state: SanitizeState
): string {
  switch (mode) {
    case SANITIZE_NONE:
      return value;
    case SANITIZE_HTML:
      // The default allowlist of sanitize-html
      return sanitizeHtml(value);
    case SANITIZE_MARKDOWN:
      if (!markdown) {
        // micromark is only imported when there is a Markdown text to sanitize: the result of this pass is dropped
        state.markdownNeeded = true;
        return value;
      }
      return sanitizeMarkdownText(value);
    default:
      return sanitizeHtml(value, options);
  }
}

/**
 * Sanitize every string of a parsed JSON value
 *
 * Nothing is written to the value: arrays and objects are built again, an object from its own entries
 * (`Object.fromEntries` defines own properties, so no key of the client can reach a setter or a prototype).
 * @param value - the value
 * @param options - the sanitization options
 * @param patterns - the modes, their path split in segments
 * @param segments - the path of the value
 * @param state - what the pass could not do
 * @returns the sanitized value
 */
function sanitizeValue(
  value: any,
  options: SanitizeInputOptions,
  patterns: ModePattern[],
  segments: string[],
  state: SanitizeState
): any {
  if (typeof value === "string") {
    // The root of an input has an empty path: it matches no pattern, so it is never a text with a mode
    return sanitizeText(value, getMode(patterns, segments), options, state);
  }
  /**
   * Sanitize an item of an array or a value of an object
   * @param child - the item or the value
   * @param key - its index or its key
   * @returns the sanitized child, or the child itself when its key is one of the `raw` ones
   */
  const sanitizeChild = function sanitizeChild(child: any, key: string): any {
    const path = [...segments, key];
    if (Array.isArray(options.raw) && options.raw.includes(path.join("."))) {
      return child;
    }
    return sanitizeValue(child, options, patterns, path, state);
  };
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeChild(item, String(index)));
  }
  if (value !== null && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    // Anything else (a Date...) is not JSON: it holds no client text and is handed over as it is
    if (prototype === Object.prototype || prototype === null) {
      const copy = Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => !UNSAFE_KEYS.includes(key))
          .map(([key, child]) => [key, sanitizeChild(child, key)])
      );
      return prototype === null ? Object.setPrototypeOf(copy, null) : copy;
    }
  }
  return value;
}

/**
 * Sanitize every string of a parsed JSON value, with the given sanitize-html options as they are
 *
 * The value is not modified: a sanitized copy is returned, without the `__proto__`, `constructor` and `prototype`
 * keys.
 * @param value - the parsed JSON value
 * @param options - the sanitize-html options, and the paths sanitized another way
 * @returns the sanitized value
 * @throws SanitizerUnavailable when a text is Markdown and micromark is not installed
 */
export async function sanitizeInputWith<T = any>(value: T, options: SanitizeInputOptions): Promise<T> {
  const patterns = compileModes(options.modes);
  sanitizeHtml ??= (await import("sanitize-html")).default;
  const state: SanitizeState = { markdownNeeded: false };
  const result = sanitizeValue(value, options, patterns, [], state);
  if (!state.markdownNeeded) {
    return result as T;
  }
  // The first Markdown text of the process: import micromark, then sanitize the value again, as it was received
  await loadMarkdown();
  return sanitizeValue(value, options, patterns, [], state) as T;
}

/**
 * Split the paths of sanitization modes in segments
 * @param modes - the modes per dotted path
 * @returns the patterns of the modes that change how a text is sanitized
 */
function compileModes(modes: SanitizeModes = {}): ModePattern[] {
  return Object.entries(modes)
    .filter(([, mode]) => SANITIZE_MODES.includes(mode))
    .map(function splitPath([path, mode]) {
      const segments = path.split(".");
      const deep = segments[segments.length - 1] === SANITIZE_DEEP;
      return { segments: deep ? segments.slice(0, -1) : segments, deep, mode };
    });
}

/**
 * The sanitization mode of a path, among the modes of an input schema
 * @param modes - the modes per dotted path (see {@link getSanitizeModes})
 * @param path - the path of a value, in segments
 * @returns the mode (`none`, `html` or `markdown`), undefined for the default sanitization
 */
export function getSanitizeMode(modes: SanitizeModes, path: string[]): string | undefined {
  return getMode(compileModes(modes), path);
}

/**
 * Sanitize one text with a mode, exactly as the input sanitization does for a text at a path of that mode
 *
 * For a value that is compared with stored texts rather than stored itself: the literal of a query.
 * @param value - the text
 * @param mode - its mode, undefined for the default
 * @returns the sanitized text
 * @throws SanitizerUnavailable when the mode is `markdown` and micromark is not installed
 */
export async function sanitizeString(value: string, mode?: string): Promise<string> {
  return (await sanitizeInput({ value }, mode ? { modes: { value: mode } } : {})).value;
}

/**
 * Sanitization modes of the texts of a model: the attributes its Input schema marks `x-webda-sanitize`
 * (`@sanitize none`, `html` or `markdown` on the property, see {@link getSanitizeModes})
 * @param model - the model class
 * @returns the modes per dotted path, `*` standing for any array index or record key
 */
export function getModelSanitizeModes(model: any): SanitizeModes {
  try {
    return getSanitizeModes(useModelMetadata(model)?.Schemas?.Input);
  } catch {
    return {};
  }
}

/**
 * Sanitize every string of a parsed JSON value: every tag is removed and entities are escaped, unless the options
 * say otherwise
 *
 * The value is not modified: a sanitized copy is returned, without the `__proto__`, `constructor` and `prototype`
 * keys.
 * @param value - the parsed JSON value
 * @param options - sanitize-html options replacing the defaults, and the paths sanitized another way
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
 * Check whether a schema accepts any JSON value, or any object: a free-form value, whose content no schema describes
 * @param schema - the schema
 * @param root - the schema carrying the definitions
 * @returns true for `{}`, `true`, an untyped schema and an object whose extra properties are free-form
 */
function isFreeFormSchema(schema: any, root: any): boolean {
  schema = resolveInputSchema(schema, root);
  if (schema === true) {
    return true;
  }
  if (!schema || typeof schema !== "object" || schema.$ref !== undefined) {
    return false;
  }
  if (
    ["anyOf", "oneOf", "allOf", "enum", "const", "properties", "items", "patternProperties"].some(key => key in schema)
  ) {
    return false;
  }
  if (schema.type === undefined) {
    return true;
  }
  if (schema.type !== "object") {
    return false;
  }
  const extra = schema.additionalProperties;
  return extra === undefined || extra === true || isFreeFormSchema(extra, root);
}

/**
 * Deepest schema nesting followed while looking for sanitization modes
 */
const MAX_SCHEMA_DEPTH = 32;

/**
 * Sanitization modes per schema object: a schema is walked once, not on every call
 */
const sanitizeModesCache = new WeakMap<object, SanitizeModes>();

/**
 * The sanitization modes an input schema declares (`x-webda-sanitize`), per dotted path
 *
 * The keyword counts on a string, an array of strings or a record of strings, and on a free-form value (`{}`,
 * `unknown`, `Record<string, unknown>`), listed as `<path>.**`: every text of the value, at any depth, gets the mode.
 * On an object with declared properties it is ignored: each attribute is tagged on its own. Nested properties, array
 * items (`items.*.label`) and record values are followed, as are local `$ref`s; the keyword written next to a `$ref`
 * counts. `text` and unknown modes are the default: they are not listed.
 * @param schema - the input schema
 * @param root - the schema carrying the definitions
 * @returns the modes per path, `*` standing for any array index or record key
 */
export function getSanitizeModes(schema: any, root: any = schema): SanitizeModes {
  if (!schema || typeof schema !== "object") {
    return {};
  }
  const cached = root === schema ? sanitizeModesCache.get(schema) : undefined;
  if (cached) {
    return cached;
  }
  const modes: SanitizeModes = {};
  const visiting = new Set<any>();
  /**
   * Collect the modes below a schema node
   * @param node - the schema node
   * @param path - its path in the input
   * @param inherited - the mode of the array or the record above it, or of the union this node is a branch of
   * @param branch - the node is a branch of a union: an inherited mode only applies to it if it is a text
   */
  const visit = function visit(node: any, path: string[], inherited?: string, branch = false) {
    // The keyword written next to a `$ref` (an attribute whose type is a definition) is the one of the attribute
    const own: string | undefined = node && typeof node === "object" ? node[SANITIZE_KEYWORD] : undefined;
    node = resolveInputSchema(node, root);
    if (!node || typeof node !== "object" || visiting.has(node) || path.length > MAX_SCHEMA_DEPTH) {
      return;
    }
    const mode: string | undefined = own ?? node[SANITIZE_KEYWORD] ?? inherited;
    if (isTextSchema(node, root)) {
      // The root of an input is never a text: only a property, an item or a record value has a mode
      if (SANITIZE_MODES.includes(mode) && path.length > 0) {
        modes[path.join(".")] ??= mode;
      }
      return;
    }
    if (isFreeFormSchema(node, root)) {
      // No schema below to name a text: the mode covers the whole value. In a mixed union only a text branch takes
      // the mode of the union (an object sent there is sanitized), unless the branch names its own
      const deepMode = branch ? (own ?? node[SANITIZE_KEYWORD]) : mode;
      if (SANITIZE_MODES.includes(deepMode) && path.length > 0) {
        modes[[...path, SANITIZE_DEEP].join(".")] ??= deepMode;
      }
      return;
    }
    visiting.add(node);
    for (const choice of [...(node.anyOf ?? []), ...(node.oneOf ?? []), ...(node.allOf ?? [])]) {
      visit(choice, path, mode, true);
    }
    // A mode is inherited by the items of an array and the values of a record, never by the properties of an object
    for (const [name, property] of Object.entries(node.properties ?? {})) {
      // A dot or a star in a name cannot be told from a path separator or a wildcard: such a property stays
      // sanitized as text, like a private (`__`) one, which is never taken from a client
      if (!name.includes(".") && name !== "*" && !name.startsWith("__")) {
        visit(property, [...path, name]);
      }
    }
    for (const items of Array.isArray(node.items) ? node.items : [node.items]) {
      visit(items, [...path, "*"], mode);
    }
    if (node.additionalProperties && typeof node.additionalProperties === "object") {
      visit(node.additionalProperties, [...path, "*"], node.properties ? undefined : mode);
    }
    visiting.delete(node);
  };
  visit(schema, []);
  if (root === schema) {
    sanitizeModesCache.set(schema, modes);
  }
  return modes;
}
