/**
 * JSDoc-to-JSON-Schema annotation mapping.
 *
 * Webda lets a JSDoc tag set a schema keyword directly — `@minimum 0`,
 * `@format email`, `@deprecated` — and the committed `webda.module.json`
 * contains the results, so the classification below is not a design choice but
 * a compatibility surface. It reproduces `@webda/schema`'s `Annotations` table
 * and `processJsDoc` exactly, including the behaviours that look like bugs:
 *
 * - an unclassified tag becomes a keyword of its own name, so `@see` and
 *   `@returns` end up in the schema, and `@type number | string` **overwrites**
 *   the structural `type`
 * - a repeated tag collects into an array
 * - a tag with no text becomes `true`
 *
 * Those are all present in the committed output. Diverging from them is a
 * schema change, not a fix, so it does not belong in this port.
 */
import type { Checker, Project, Symbol as TsSymbol } from "typescript/unstable/sync";
import { documentationOf } from "./jsdoc.ts";
import type { JSONSchema7 } from "./types.ts";

/** How a JSDoc tag name maps onto a JSON Schema keyword. */
export const Annotations = {
  /** Emitted with a `$` prefix — `@id x` becomes `$id: "x"`. */
  dollarPrefixed: ["id", "comment", "ref"],
  /** Presence alone sets the keyword to `true`; any text is discarded. */
  boolean: ["deprecated", "readOnly", "writeOnly", "exclusiveMinimum", "exclusiveMaximum"],
  /** Tag text is copied verbatim as a string. */
  string: [
    "title",
    "description",
    "id",
    "format",
    "pattern",
    "ref",
    // Draft-07 additions.
    "comment",
    "contentMediaType",
    "contentEncoding",
    // Webda extensions.
    "discriminator",
    "markdownDescription",
    "deprecationMessage"
  ]
} as const;

/** A JSDoc comment and its tags, already rendered to text. */
export interface SymbolDocs {
  /** The free-text comment, empty when absent. */
  comment: string;
  /** Tags in declaration order. */
  tags: { name: string; text: string }[];
}

/**
 * Read a symbol's JSDoc comment and tags.
 *
 * Tags come straight from the checker; the comment is resolved by
 * {@link documentationOf}, which reproduces behaviour the 7.1 API dropped —
 * see `jsdoc.ts`.
 * @param symbol - the symbol to document
 * @param checker - the checker resolving the documentation
 * @param project - project used to resolve declaration handles
 * @returns comment text and tags
 */
export function readDocs(symbol: TsSymbol, checker: Checker, project: Project): SymbolDocs {
  return {
    comment: documentationOf(symbol, checker, project),
    tags: symbol.getJsDocTags(checker).map(tag => ({ name: tag.name, text: tag.text ?? "" }))
  };
}

/**
 * Merge a symbol's JSDoc into a schema, in place.
 *
 * Applied in three passes so that the precedence matches `@webda/schema`:
 * string tags, then boolean tags, then everything else.
 * @param definition - the schema to enrich
 * @param symbol - the symbol whose JSDoc to read; a no-op when undefined
 * @param checker - the checker resolving the documentation
 * @param project - project used to resolve declaration handles
 */
export function applyDocs(
  definition: JSONSchema7,
  symbol: TsSymbol | undefined,
  checker: Checker,
  project: Project
): void {
  if (!symbol) return;
  const docs = readDocs(symbol, checker, project);
  const target = definition as Record<string, unknown>;

  if (docs.comment) target.description = docs.comment;

  for (const tag of docs.tags) {
    if (!Annotations.string.includes(tag.name as never)) continue;
    target[Annotations.dollarPrefixed.includes(tag.name as never) ? `$${tag.name}` : tag.name] = tag.text;
  }

  for (const tag of docs.tags) {
    if (Annotations.boolean.includes(tag.name as never)) target[tag.name] = true;
  }

  for (const tag of docs.tags) {
    if (Annotations.boolean.includes(tag.name as never) || Annotations.string.includes(tag.name as never)) continue;
    let value: unknown;
    try {
      value = JSON.parse(tag.text);
    } catch {
      value = tag.text === "" ? true : tag.text;
    }
    // Truthiness, not `!== undefined`: a falsy existing value is overwritten
    // rather than collected. `@webda/schema` does the same, and the committed
    // schemas were generated that way.
    const existing = target[tag.name];
    if (Array.isArray(existing)) {
      existing.push(value);
    } else if (existing) {
      target[tag.name] = [existing, value];
    } else {
      target[tag.name] = value;
    }
  }
}
