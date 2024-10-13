import ts from "typescript";

/**
 * Load all JSDoc tags for a node
 * @param node
 * @returns
 */
export function getTagsName(node: ts.Node) {
  const tags = {};
  ts.getAllJSDocTags(node, (tag: ts.JSDocTag): tag is ts.JSDocTag => {
    return true;
  }).forEach(n => {
    const tagName = n.tagName.escapedText.toString();
    if (tagName.startsWith("Webda")) {
      tags[tagName] =
        n.comment?.toString().trim().replace("\n", " ").split(" ").shift() ||
        (<ts.ClassDeclaration>node).name?.escapedText;
    } else if (tagName.startsWith("Schema")) {
      tags[tagName] = n.comment?.toString().trim() || "";
    }
  });
  return tags;
}

/**
 * Used to store type id and type name
 * until we have a full resolution
 */
export type SymbolMapper = {
  id: number;
  type: string;
  symbolMap: true;
};

/**
 * Get id from TypeNode
 *
 * The id is not exposed in the TypeNode
 * @param type
 * @returns
 */
export function getTypeIdFromTypeNode(type: ts.TypeNode, checker: ts.TypeChecker): SymbolMapper {
  return {
    id: (<any>checker.getTypeFromTypeNode(type)).id,
    type: type.getText(),
    symbolMap: true
  };
}

/**
 * Ensure the model is of type SymbolMapper
 * @param symbol
 * @returns
 */
export function isSymbolMapper(symbol: string | SymbolMapper): symbol is SymbolMapper {
  return (symbol as SymbolMapper)?.symbolMap === true;
}

/**
 * Get a parent of a certain Type
 * @param node
 * @param type
 * @returns
 */
export function getParent(node: ts.Node, type: ts.SyntaxKind): ts.Node {
  let parent = node.parent;
  while (parent) {
    if (parent.kind === type) {
      return parent;
    }
    parent = parent.parent;
  }
  return undefined;
}
/**
 * Display all parent of a Node
 * @param node
 */
export function displayParents(node: ts.Node, stream?: any) {
  let parent = node.parent;
  const parents = [];
  while (parent !== undefined) {
    parents.unshift(parent);
    parent = parent.parent;
  }
  parents.forEach((p, ind) => {
    this.displayItem(p, stream, ind);
  });
  this.displayItem(node, stream, parents.length);
}

/********************* DEVELOPMENT UTILS ****************/

/**
 * Utils to display a tree in console
 *
 * Useful during development
 * @param node
 * @param level
 */
export function displayTree(node: ts.Node, stream?: (...args) => void, level: number = 0) {
  this.displayItem(node, stream, level);
  ts.forEachChild(node, n => this.displayTree(n, stream, level + 1));
}

/**
 * Display an item
 * @param node
 * @param level
 */
export function displayItem(node: ts.Node, log?: (...args) => void, level: number = 0) {
  if (!log) {
    log = (...args) => console.log(...args);
  }
  log(".".repeat(level), ts.SyntaxKind[node.kind], node.getText().split("\n")[0].substring(0, 60));
}
