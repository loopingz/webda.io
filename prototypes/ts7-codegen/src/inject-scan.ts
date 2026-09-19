/**
 * Scanner-based injection for the LSP proxy.
 *
 * The proxy runs on every keystroke, so it cannot afford a type-checked
 * analysis. It uses `typescript/unstable/ast/scanner` — a real tokenizer, not a
 * regex — to find coercible property declarations syntactically. This matches
 * how the existing transform resolves builtin coercions anyway: on the
 * *source-level type name* (`coercions[sourceTypeName]` in
 * `packages/ts-plugin/src/transforms/accessors.ts`), not on a resolved type.
 *
 * Generation is deliberately **line-aligned**: the accessor pair is emitted on a
 * single line, replacing a single-line property declaration. Line numbers
 * therefore match exactly between what the author sees and what the server
 * checks, so no line mapping is required anywhere — only column positions on
 * the rewritten lines differ.
 */
import { SyntaxKind } from "typescript/unstable/ast";
import { createScanner } from "typescript/unstable/ast/scanner";

/** A property declaration that will be replaced by an accessor pair. */
export interface InjectionSite {
  name: string;
  typeName: string;
  /** Offset of the type reference token. */
  typeStart: number;
  /** Offset of the start of the declaration. */
  start: number;
  /** Offset just past the terminating `;`. */
  end: number;
}

/** Widened setter types, mirroring `DEFAULT_COERCIONS`. */
const SETTER_TYPES: Record<string, string> = {
  Date: "string | number | Date"
};

/** Base classes that mark a class as a Webda model. */
const MODEL_BASES = new Set(["Model", "UuidModel"]);

/**
 * Find coercible property declarations in a source text.
 *
 * Deliberately conservative: it only rewrites single-line declarations of the
 * form `name: Type;` (optionally `readonly`/access-modified) inside a class
 * that extends a known model base. Anything it is unsure about is left alone,
 * which degrades to today's behaviour rather than to broken code.
 * @param text - the document text
 * @returns the sites to rewrite, in source order
 */
export function findInjectionSites(text: string): InjectionSite[] {
  const scanner = createScanner(/*skipTrivia*/ true);
  scanner.setText(text);

  const sites: InjectionSite[] = [];

  let braceDepth = 0;
  /** Brace depth at which the current model class body lives, or -1. */
  let modelBodyDepth = -1;
  let sawClass = false;
  let sawExtends = false;
  let isModelClass = false;

  // Rolling state for a candidate `name : Type ;` at class-body depth.
  let candidateName: string | undefined;
  let candidateStart = -1;
  let sawColon = false;
  let candidateType: string | undefined;
  let candidateTypeStart = -1;
  let disqualified = false;

  /** Reset the per-member candidate state. */
  const resetCandidate = () => {
    candidateName = undefined;
    candidateStart = -1;
    sawColon = false;
    candidateType = undefined;
    candidateTypeStart = -1;
    disqualified = false;
  };

  // Guard: a bare token scan cannot correctly traverse template literals,
  // regex literals or JSX — the scanner needs re-scan calls driven by parser
  // context. Without them it can emit zero-width tokens and spin forever (e.g.
  // `#` inside `\`#/components/schemas/${x}\``). Rather than pretend, bail out
  // and leave the file untouched.
  let lastEnd = -1;
  let stalled = 0;
  for (;;) {
    const token = scanner.scan();
    if (token === SyntaxKind.EndOfFile) break;
    const tokenEnd = scanner.getTokenEnd();
    if (tokenEnd === lastEnd) {
      if (++stalled > 2) return [];
    } else {
      stalled = 0;
      lastEnd = tokenEnd;
    }

    switch (token) {
      case SyntaxKind.ClassKeyword:
        sawClass = true;
        sawExtends = false;
        isModelClass = false;
        resetCandidate();
        continue;

      case SyntaxKind.ExtendsKeyword:
        if (sawClass) sawExtends = true;
        continue;

      case SyntaxKind.OpenBraceToken:
        braceDepth++;
        if (sawClass) {
          if (isModelClass) modelBodyDepth = braceDepth;
          sawClass = false;
          sawExtends = false;
        }
        resetCandidate();
        continue;

      case SyntaxKind.CloseBraceToken:
        if (braceDepth === modelBodyDepth) modelBodyDepth = -1;
        braceDepth--;
        resetCandidate();
        continue;
    }

    // Resolve the base class name right after `extends`.
    if (sawExtends && token === SyntaxKind.Identifier) {
      if (MODEL_BASES.has(scanner.getTokenValue())) isModelClass = true;
      sawExtends = false;
      continue;
    }

    // Only track candidates directly inside a model class body.
    if (braceDepth !== modelBodyDepth || modelBodyDepth === -1) continue;

    switch (token) {
      // Anything that means "this is not a plain property declaration".
      case SyntaxKind.StaticKeyword:
      case SyntaxKind.GetKeyword:
      case SyntaxKind.SetKeyword:
      case SyntaxKind.OpenParenToken:
      case SyntaxKind.EqualsToken:
      case SyntaxKind.QuestionToken:
      case SyntaxKind.ExclamationToken:
      case SyntaxKind.AtToken:
        disqualified = true;
        continue;

      case SyntaxKind.SemicolonToken: {
        if (!disqualified && candidateName && sawColon && candidateType && SETTER_TYPES[candidateType]) {
          sites.push({
            name: candidateName,
            typeName: candidateType,
            typeStart: candidateTypeStart,
            start: candidateStart,
            end: scanner.getTokenEnd()
          });
        }
        resetCandidate();
        continue;
      }

      case SyntaxKind.ColonToken:
        if (candidateName) sawColon = true;
        continue;

      case SyntaxKind.Identifier:
        if (disqualified) continue;
        if (!candidateName) {
          candidateName = scanner.getTokenValue();
          candidateStart = scanner.getTokenStart();
        } else if (sawColon && !candidateType) {
          candidateType = scanner.getTokenValue();
          candidateTypeStart = scanner.getTokenStart();
        } else {
          disqualified = true;
        }
        continue;

      default:
        // Any other token between name and `;` means this is something more
        // complex than we are willing to rewrite (unions, generics, etc.).
        if (candidateName) disqualified = true;
        continue;
    }
  }

  return sites;
}

/**
 * Render the accessor pair for a site as a **single line**, preserving the
 * document's line count.
 * @param site - the injection site
 * @returns one line of TypeScript
 */
function renderInline(site: InjectionSite): string {
  const slot = `this[WEBDA_STORAGE][${JSON.stringify(site.name)}]`;
  const setterType = SETTER_TYPES[site.typeName];
  return (
    `get ${site.name}(): ${site.typeName} { return ${slot}; } ` +
    `set ${site.name}(value: ${setterType}) { ${slot} = value !== undefined && value !== null ? new ${site.typeName}(value) : value; }`
  );
}

/**
 * A span of authored text and where it landed in the generated text, both as
 * columns within the same line. This replaces the earlier constant shift, which
 * was only correct for the property identifier and silently wrong for the type
 * annotation (hovering `Date` returned nothing).
 */
export interface Segment {
  aStart: number;
  aEnd: number;
  iStart: number;
  iEnd: number;
}

/** Result of injecting into a document. */
export interface Injection {
  /** The rewritten text handed to the server. */
  text: string;
  /** Zero-based line numbers that were rewritten. */
  rewrittenLines: Set<number>;
  /** Per-rewritten-line column mappings. */
  segments: Map<number, Segment[]>;
  /** True when nothing was changed. */
  unchanged: boolean;
}

/**
 * Map a column from authored to generated coordinates.
 * @param segs - segments for the line
 * @param col - authored column
 * @returns generated column
 */
export function mapForward(segs: Segment[], col: number): number {
  for (const s of segs) {
    if (col >= s.aStart && col <= s.aEnd) return s.iStart + (col - s.aStart);
  }
  return segs.length ? segs[0].iStart : col;
}

/**
 * Map a column from generated back to authored coordinates.
 * @param segs - segments for the line
 * @param col - generated column
 * @returns authored column
 */
export function mapBack(segs: Segment[], col: number): number {
  for (const s of segs) {
    if (col >= s.iStart && col <= s.iEnd) return s.aStart + (col - s.iStart);
  }
  // Anything inside generated-only text collapses onto the declaration.
  return segs.length ? segs[0].aStart : col;
}

/**
 * Convert an offset to a zero-based line number.
 * @param text - document text
 * @param offset - character offset
 * @returns the line number
 */
function lineOf(text: string, offset: number): number {
  let line = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * Inject accessors into a document, preserving line count.
 * @param text - the authored document text
 * @returns the injection result
 */
export function inject(text: string, storageModule = process.env.WEBDA_STORAGE_MODULE ?? "@webda/models"): Injection {
  const sites = findInjectionSites(text);
  if (!sites.length) {
    return { text, rewrittenLines: new Set(), segments: new Map(), unchanged: true };
  }

  // Only rewrite sites that live entirely on one line, so line count is stable.
  const usable = sites.filter(s => lineOf(text, s.start) === lineOf(text, s.end));

  let out = text;
  const rewrittenLines = new Set<number>();
  const segments = new Map<number, Segment[]>();

  for (const site of [...usable].sort((a, b) => b.start - a.start)) {
    const line = lineOf(text, site.start);
    const lineStart = text.lastIndexOf("\n", site.start - 1) + 1;
    const replacement = renderInline(site);
    out = out.slice(0, site.start) + replacement + out.slice(site.end);
    rewrittenLines.add(line);

    // Generated form is `get <name>(): <Type> { ... } set ...`, so within the
    // replacement the identifier sits at +4 and the return type at
    // +4 + name.length + "(): ".length.
    const declCol = site.start - lineStart;
    const nameCol = declCol + "get ".length;
    const typeCol = nameCol + site.name.length + "(): ".length;

    segments.set(line, [
      { aStart: declCol, aEnd: declCol + site.name.length, iStart: nameCol, iEnd: nameCol + site.name.length },
      {
        aStart: site.typeStart - lineStart,
        aEnd: site.typeStart - lineStart + site.typeName.length,
        iStart: typeCol,
        iEnd: typeCol + site.typeName.length
      }
    ]);
  }

  // The document must still declare WEBDA_STORAGE. Append the import to the
  // first line so no line is added.
  if (!/\bWEBDA_STORAGE\b.*\bfrom\b/.test(text)) {
    const nl = out.indexOf("\n");
    const head = nl === -1 ? out : out.slice(0, nl);
    const tail = nl === -1 ? "" : out.slice(nl);
    out = `${head} import { WEBDA_STORAGE } from "${storageModule}";${tail}`;
  }

  return { text: out, rewrittenLines, segments, unchanged: usable.length === 0 };
}
