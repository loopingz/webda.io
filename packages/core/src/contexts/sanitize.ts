import type sanitize from "sanitize-html";
import { resolveInputSchema } from "../rest/binding.js";

/**
 * sanitize-html, imported with the first input to sanitize: it loads an HTML and CSS parsing stack
 */
let sanitizeHtml: typeof sanitize;

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
 * Sanitization mode per path: a dotted path, `*` standing for any array index or object key (`tags.*`,
 * `items.*.label`), and one of the {@link SANITIZE_MODES}
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
   * The paths whose **string** value is sanitized with another mode (`none`, `html`, `markdown`). A value that is
   * not a string is sanitized like any other.
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
   * The path, split in segments
   */
  segments: string[];
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
  // Still not clean: nothing of it is trusted
  return sanitizeHtml(value, DEFAULT_SANITIZE_OPTIONS);
}

/**
 * Import sanitize-html, and micromark when a Markdown text is to be sanitized
 * @param withMarkdown - whether micromark is needed
 */
async function loadSanitizers(withMarkdown: boolean): Promise<void> {
  sanitizeHtml ??= (await import("sanitize-html")).default;
  if (withMarkdown && !markdown) {
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
 * parsed again until nothing is left to neutralize; a text that does not settle is sanitized like `text`.
 *
 * This is defense in depth: the renderer must still not enable raw HTML, or must sanitize its output. It does not
 * cover MDX, nor syntax extensions that give other constructs a meaning.
 * @param value - the Markdown source
 * @returns the sanitized source
 */
export async function sanitizeMarkdown(value: string): Promise<string> {
  await loadSanitizers(true);
  return sanitizeMarkdownText(value);
}

/**
 * The mode of a path
 * @param patterns - the modes, their path split in segments
 * @param segments - the path of a value
 * @returns the mode of the first pattern with the same segments (`*` matching any), undefined for the default
 */
function getMode(patterns: ModePattern[], segments: string[]): string | undefined {
  return patterns.find(
    pattern =>
      pattern.segments.length === segments.length &&
      pattern.segments.every(function sameSegment(part, i) {
        return part === "*" || part === segments[i];
      })
  )?.mode;
}

/**
 * Sanitize a text with a mode
 * @param value - the text
 * @param mode - its mode, undefined for the default
 * @param options - the options of the default sanitization
 * @returns the sanitized text
 */
function sanitizeString(value: string, mode: string | undefined, options: SanitizeInputOptions): string {
  switch (mode) {
    case SANITIZE_NONE:
      return value;
    case SANITIZE_HTML:
      // The default allowlist of sanitize-html
      return sanitizeHtml(value);
    case SANITIZE_MARKDOWN:
      return sanitizeMarkdownText(value);
    default:
      return sanitizeHtml(value, options);
  }
}

/**
 * Sanitize every string of a parsed JSON value, in place
 * @param value - the value
 * @param options - the sanitization options
 * @param patterns - the modes, their path split in segments
 * @param segments - the path of the value
 * @returns the sanitized value
 */
function sanitizeValue(value: any, options: SanitizeInputOptions, patterns: ModePattern[], segments: string[]): any {
  if (typeof value === "string") {
    return sanitizeString(value, getMode(patterns, segments), options);
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
      value[key] = sanitizeValue(value[key], options, patterns, path);
    }
  }
  return value;
}

/**
 * Sanitize every string of a parsed JSON value, in place, with the given sanitize-html options as they are
 *
 * `__proto__`, `constructor` and `prototype` keys are removed on the way.
 * @param value - the parsed JSON value
 * @param options - the sanitize-html options, and the paths sanitized another way
 * @returns the sanitized value
 */
export async function sanitizeInputWith<T = any>(value: T, options: SanitizeInputOptions): Promise<T> {
  const patterns = Object.entries(options.modes ?? {})
    .filter(([, mode]) => SANITIZE_MODES.includes(mode))
    .map(function splitPath([path, mode]) {
      return { segments: path.split("."), mode };
    });
  await loadSanitizers(patterns.some(pattern => pattern.mode === SANITIZE_MARKDOWN));
  // The root of an input is never a text with a mode: an empty path matches no pattern
  return sanitizeValue(value, options, patterns, []) as T;
}

/**
 * Sanitize every string of a parsed JSON value, in place: every tag is removed and entities are escaped, unless
 * the options say otherwise
 *
 * `__proto__`, `constructor` and `prototype` keys are removed on the way.
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
 * The keyword only counts on a string, an array of strings or a record of strings: on any other schema it is
 * ignored, so an object or a free-form value is always sanitized as text. Nested properties, array items
 * (`items.*.label`) and record values are followed, as are local `$ref`s. `text` and unknown modes are the default:
 * they are not listed.
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
   * @param inherited - the mode of the array or the record above it
   */
  const visit = function visit(node: any, path: string[], inherited?: string) {
    node = resolveInputSchema(node, root);
    if (!node || typeof node !== "object" || visiting.has(node) || path.length > MAX_SCHEMA_DEPTH) {
      return;
    }
    const mode: string | undefined = node[SANITIZE_KEYWORD] ?? inherited;
    if (isTextSchema(node, root)) {
      // The root of an input is never a text: only a property, an item or a record value has a mode
      if (SANITIZE_MODES.includes(mode) && path.length > 0) {
        modes[path.join(".")] ??= mode;
      }
      return;
    }
    visiting.add(node);
    for (const branch of [...(node.anyOf ?? []), ...(node.oneOf ?? []), ...(node.allOf ?? [])]) {
      visit(branch, path, mode);
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
