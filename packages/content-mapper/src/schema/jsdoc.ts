/**
 * Symbol documentation resolution, reproduced on the TypeScript 7.1 AST.
 *
 * `Symbol.getDocumentationComment` exists in 7.1 but answers a narrower
 * question than the 6.x services layer did, and the committed
 * `webda.module.json` was generated against the wider one. Three behaviours
 * are missing, each of which silently drops a `description`:
 *
 * 1. **The JSDoc host walk.** `models: { [key: string]: string[] }` documents
 *    the property, but the schema is built from the anonymous type literal.
 *    TypeScript 6 walks from the type literal up to the property declaration
 *    to find the comment; 7.1 does not.
 * 2. **Inheritance from base types.** A member with tags but no prose — say
 *    `httpOnly?: boolean` carrying only `@default true` — takes its
 *    description from the `implements`/`extends` clause. Most of
 *    `CookieOptions` is documented this way, by the `cookie` package.
 * 3. **Raw `{@link}` text.** 7.1 flattens a link to its target name; 6.x
 *    reconstructed the braces, and whether the target resolves changes the
 *    result by one space.
 *
 * All three are reimplemented here rather than worked around, because the
 * alternative is a schema that quietly loses documentation — exactly the
 * class of failure stage 7 is meant to make impossible.
 */
import type { Checker, Project, Symbol as TsSymbol } from "typescript/unstable/sync";
import { SyntaxKind } from "typescript/unstable/ast";
import type { Node } from "typescript/unstable/ast";

/** A JSDoc comment node: either literal text or a `{@link}`. */
interface CommentPart {
  kind: SyntaxKind;
  text: string;
  name?: Node;
}

/** A JSDoc block attached to a node. */
interface JSDocBlock {
  comment?: readonly CommentPart[];
}

/**
 * The documentation comment for a symbol, as TypeScript 6 rendered it.
 * @param symbol - the symbol to document
 * @param checker - checker used to resolve link targets and base types
 * @param project - project used to resolve declaration handles
 * @returns the comment text, empty when there is none
 */
export function documentationOf(symbol: TsSymbol, checker: Checker, project: Project): string {
  const declarations: Node[] = symbol.declarations.map(handle => handle.resolve(project)).filter(isNode);

  const blocks: string[] = [];
  for (const declaration of unique(declarations)) {
    for (const block of commentHavingNodes(declaration)) {
      if (!block.comment || block.comment.length === 0) continue;
      const rendered = renderComment(block.comment, checker, project);
      if (!blocks.includes(rendered)) blocks.push(rendered);
    }
  }
  if (blocks.length > 0) return blocks.join("\n");

  // Nothing of its own: take the base declaration's documentation, which is
  // how a member that only carries tags is still described.
  for (const declaration of unique(declarations)) {
    const inherited = baseSymbolOf(declaration, symbol.name, checker);
    if (inherited) {
      const text = documentationOf(inherited, checker, project);
      if (text) return text;
    }
  }
  return "";
}

/**
 * JSDoc blocks that document a node, including those on enclosing nodes.
 *
 * A type literal, an initialiser and a return expression are all documented
 * by their parent, so the chain is followed upwards. Only the last block on
 * each node counts — an earlier one documents whatever came before it.
 * @param node - the declaration to document
 * @returns the blocks, nearest first
 */
function commentHavingNodes(node: Node): JSDocBlock[] {
  const blocks: JSDocBlock[] = [];
  let current: Node | undefined = node;
  while (current?.parent) {
    const own = current.jsDoc;
    if (own && own.length > 0) blocks.push(own[own.length - 1] as JSDocBlock);
    current = nextCommentLocation(current);
  }
  return blocks;
}

/**
 * The enclosing node that may document this one.
 * @param node - the current node
 * @returns the parent when it documents `node`, otherwise undefined
 */
function nextCommentLocation(node: Node): Node | undefined {
  const parent = node.parent;
  if (!parent) return undefined;
  switch (parent.kind) {
    case SyntaxKind.PropertyAssignment:
    case SyntaxKind.ExportAssignment:
    case SyntaxKind.PropertyDeclaration:
    case SyntaxKind.ReturnStatement:
      return parent;
    case SyntaxKind.ExpressionStatement:
      return node.kind === SyntaxKind.PropertyAccessExpression ? parent : undefined;
    default:
      return undefined;
  }
}

/**
 * Render a JSDoc comment array to text.
 * @param parts - the comment nodes
 * @param checker - checker used to resolve link targets
 * @param project - project used to resolve declaration handles
 * @returns the rendered comment
 */
function renderComment(parts: readonly CommentPart[], checker: Checker, project: Project): string {
  let out = "";
  for (const part of parts) {
    out += part.kind === SyntaxKind.JSDocText ? part.text : renderLink(part, checker, project);
  }
  // A block closed by a blank `*` line, or one followed by tags, leaves a
  // trailing newline in the 7.1 AST that 6.x trimmed before handing the
  // comment out. Keeping it would put `\n` at the end of a third of the
  // descriptions in the corpus.
  return out.replace(/\s+$/, "");
}

/**
 * Render a `{@link}`, `{@linkcode}` or `{@linkplain}` back to source form.
 *
 * The trailing space when the target does not resolve is not a quirk worth
 * smoothing over: it is in the committed schemas, so removing it is a diff.
 * @param part - the link node
 * @param checker - checker used to resolve the target
 * @param project - project used to resolve declaration handles
 * @returns the rendered link, braces included
 */
function renderLink(part: CommentPart, checker: Checker, project: Project): string {
  const prefix =
    part.kind === SyntaxKind.JSDocLinkCode
      ? "linkcode"
      : part.kind === SyntaxKind.JSDocLinkPlain
        ? "linkplain"
        : "link";
  if (!part.name) return `{@${prefix} ${part.text}}`;

  const suffix = linkNameEnd(part.text);
  const name = nameText(part.name) + part.text.slice(0, suffix);
  const text = stripSeparator(part.text.slice(suffix));

  const symbol = checker.getSymbolAtLocation(part.name);
  const declaration = symbol?.valueDeclaration?.resolve(project) ?? symbol?.declarations[0]?.resolve(project);
  const body = declaration ? name + text : name + (suffix ? "" : " ") + text;
  return `{@${prefix} ${body}}`;
}

/**
 * How much of a link's trailing text still belongs to the target name.
 *
 * `{@link fn()}` and `{@link Box<T>}` carry the call or type arguments in the
 * text rather than the name node.
 * @param text - the text following the link name
 * @returns the number of leading characters belonging to the name
 */
function linkNameEnd(text: string): number {
  if (text.startsWith("()")) return 2;
  if (text[0] !== "<") return 0;
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "<") depth++;
    if (text[index] === ">") depth--;
    if (depth === 0) return index + 1;
  }
  return 0;
}

/**
 * Drop the `|` separator between a link target and its display text.
 * @param text - the text after the target name
 * @returns the display text
 */
function stripSeparator(text: string): string {
  if (text[0] !== "|") return text;
  return text.slice(1).replace(/^ +/, "");
}

/**
 * Source text of an entity name.
 * @param node - an identifier or qualified name
 * @returns the dotted name
 */
function nameText(node: Node): string {
  const qualified = node as { left?: Node; right?: { text: string }; text?: string };
  if (qualified.left && qualified.right) return `${nameText(qualified.left)}.${qualified.right.text}`;
  return qualified.text ?? "";
}

/**
 * The same-named member on a declaration's base or implemented types.
 * @param declaration - the member declaration
 * @param name - the member name
 * @param checker - checker used to resolve heritage types
 * @returns the base member's symbol, when one exists
 */
function baseSymbolOf(declaration: Node, name: string, checker: Checker): TsSymbol | undefined {
  const owner = declaration.parent;
  if (!owner) return undefined;
  const heritage = (owner as { heritageClauses?: readonly { types: readonly Node[] }[] }).heritageClauses;
  if (!heritage) return undefined;

  for (const clause of heritage) {
    for (const typeNode of clause.types) {
      const baseType = checker.getTypeAtLocation(typeNode);
      const member = checker.getPropertyOfType(baseType, name);
      if (member) return member;
    }
  }
  return undefined;
}

/**
 * Narrow away undefined entries.
 * @param node - a possibly missing value
 * @returns true when present
 * @typeParam T - the value type
 */
function isNode<T>(node: T | undefined): node is T {
  return node !== undefined;
}

/**
 * Deduplicate declarations while preserving order.
 * @param nodes - the declarations
 * @returns the distinct declarations
 */
function unique(nodes: Node[]): Node[] {
  return nodes.filter((node, index) => nodes.indexOf(node) === index);
}
