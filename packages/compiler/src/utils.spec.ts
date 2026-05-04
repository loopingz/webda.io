import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as ts from "typescript";
import {
  getTagsName,
  getTypeIdFromTypeNode,
  isSymbolMapper,
  getParent,
  displayParents,
  displayTree,
  displayItem,
  getKeyKind
} from "./utils.js";

/**
 * Compile a tiny TS source string and return the source-file plus its
 * type checker. Many helpers in `utils.ts` need a real `ts.Program` (not
 * just an AST) because they call `getTypeFromTypeNode` etc.
 */
function compile(source: string, fileName = "fixture.ts") {
  const host = ts.createCompilerHost({ target: ts.ScriptTarget.ES2022 });
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (name, target, onError, shouldCreate) => {
    if (name === fileName) {
      return ts.createSourceFile(name, source, target, true);
    }
    return original(name, target, onError, shouldCreate);
  };
  const program = ts.createProgram([fileName], { target: ts.ScriptTarget.ES2022, noEmit: true }, host);
  const sourceFile = program.getSourceFile(fileName);
  return { program, sourceFile, checker: program.getTypeChecker() };
}

@suite
class CompilerUtilsTest {
  /**
   * `getTagsName` extracts JSDoc tags whose name starts with `Webda` or
   * `Schema`. Other tags (e.g. plain `@param`) are ignored.
   */
  @test
  testGetTagsName() {
    const src = `
      /**
       * @WebdaModel WebdaSample/Sample
       * @WebdaSchema other
       * @SchemaTitle SampleTitle
       * @param ignored ignore me
       */
      export class Sample {}
    `;
    const { sourceFile } = compile(src);
    let cls!: ts.ClassDeclaration;
    sourceFile.forEachChild(node => {
      if (ts.isClassDeclaration(node)) cls = node;
    });
    const tags = getTagsName(cls);
    assert.strictEqual(tags.WebdaModel, "WebdaSample/Sample");
    assert.strictEqual(tags.WebdaSchema, "other");
    assert.strictEqual(tags.SchemaTitle, "SampleTitle");
    assert.strictEqual(tags.param, undefined, "non-Webda/Schema tags are filtered out");
  }

  /**
   * When a `@WebdaXxx` tag has no payload, the helper falls back to the
   * class name. This exercises the `tag.comment` falsy branch.
   */
  @test
  testGetTagsNameDefaultsToClassName() {
    const src = `
      /**
       * @WebdaModel
       */
      export class Default {}
    `;
    const { sourceFile } = compile(src);
    let cls!: ts.ClassDeclaration;
    sourceFile.forEachChild(node => {
      if (ts.isClassDeclaration(node)) cls = node;
    });
    const tags = getTagsName(cls);
    assert.strictEqual(tags.WebdaModel, "Default");
  }

  /**
   * `getTypeIdFromTypeNode` returns a `SymbolMapper` carrying the type's
   * id and source text. The id is opaque but must be stable across
   * repeated calls on the same node.
   */
  @test
  testGetTypeIdFromTypeNode() {
    const src = `
      type MyType = string;
      const x: MyType = "v";
    `;
    const { sourceFile, checker } = compile(src);
    let typeNode!: ts.TypeNode;
    sourceFile.forEachChild(node => {
      if (ts.isVariableStatement(node)) {
        const decl = node.declarationList.declarations[0];
        if (decl.type) typeNode = decl.type;
      }
    });
    const mapper = getTypeIdFromTypeNode(typeNode, checker);
    assert.strictEqual(mapper.symbolMap, true);
    assert.strictEqual(mapper.type, "MyType");
    assert.strictEqual(typeof mapper.id, "number");
    // Stable
    assert.strictEqual(getTypeIdFromTypeNode(typeNode, checker).id, mapper.id);
  }

  /**
   * `isSymbolMapper` discriminates the typed envelope from a plain
   * string. Only objects carrying `symbolMap: true` qualify.
   */
  @test
  testIsSymbolMapper() {
    assert.strictEqual(isSymbolMapper({ id: 1, type: "x", symbolMap: true }), true);
    assert.strictEqual(isSymbolMapper("plain"), false);
    assert.strictEqual(isSymbolMapper({} as any), false);
    assert.strictEqual(isSymbolMapper(undefined as any), false);
  }

  /**
   * `getParent` walks the AST upward and returns the first ancestor
   * matching `kind`. Returns `undefined` when no match is found.
   */
  @test
  testGetParent() {
    const src = `
      class Outer {
        m() {
          return 1;
        }
      }
    `;
    const { sourceFile } = compile(src);
    let returnStmt!: ts.ReturnStatement;
    sourceFile.forEachChild(function visit(node: ts.Node) {
      if (ts.isReturnStatement(node)) returnStmt = node;
      ts.forEachChild(node, visit);
    });
    const cls = getParent(returnStmt, ts.SyntaxKind.ClassDeclaration) as ts.ClassDeclaration;
    assert.ok(cls);
    assert.strictEqual(cls.name?.getText(), "Outer");
    // No JSDocComment ancestor exists for this fixture.
    assert.strictEqual(getParent(returnStmt, ts.SyntaxKind.JSDocComment), undefined);
  }

  /**
   * `displayParents`, `displayTree`, and `displayItem` write to an
   * optional stream. Confirm they don't throw and the stream receives
   * at least one line per node visited.
   */
  @test
  testDisplayHelpers() {
    const src = `
      const a = 1;
    `;
    const { sourceFile } = compile(src);
    let leaf!: ts.Node;
    sourceFile.forEachChild(function visit(node: ts.Node) {
      if (ts.isNumericLiteral(node)) leaf = node;
      ts.forEachChild(node, visit);
    });
    const lines: string[] = [];
    const stream = (s: string) => lines.push(s);

    displayParents(leaf, stream);
    assert.ok(lines.length > 0, "displayParents must emit at least one line");

    lines.length = 0;
    displayTree(sourceFile, stream);
    assert.ok(lines.length > 0, "displayTree must emit at least one line");

    lines.length = 0;
    displayItem(leaf, stream, 2);
    assert.ok(lines.length > 0, "displayItem with a stream must emit a line");

    // No stream falls back to console.log — should still not throw.
    const logged: any[] = [];
    const original = console.log;
    console.log = (...args: any[]) => logged.push(args);
    try {
      displayItem(leaf, undefined, 0);
    } finally {
      console.log = original;
    }
    assert.ok(logged.length > 0, "displayItem without stream falls back to console.log");
  }

  /**
   * `getKeyKind` classifies a declaration's property key. Identifiers
   * and string literals are `string`, numeric literals are `number`,
   * computed `Symbol.iterator`-style expressions are `symbol`, and
   * everything else (e.g. a computed expression resolving to `unknown`)
   * is `other-computed`.
   */
  @test
  testGetKeyKind() {
    const src = `
      const SYM = Symbol("k");
      const COMPUTED: string = "x";
      class K {
        plain = 1;
        "stringKey" = 2;
        123 = 3;
        [SYM] = 4;
        [COMPUTED] = 5;
        [\`literal\`] = 6;
        [42] = 7;
      }
    `;
    const { sourceFile, checker } = compile(src);
    let cls!: ts.ClassDeclaration;
    sourceFile.forEachChild(n => {
      if (ts.isClassDeclaration(n)) cls = n;
    });
    const props = cls.members.filter(ts.isPropertyDeclaration);
    assert.strictEqual(getKeyKind(props[0], checker), "string", "plain identifier");
    assert.strictEqual(getKeyKind(props[1], checker), "string", "string literal");
    assert.strictEqual(getKeyKind(props[2], checker), "number", "numeric literal");
    assert.strictEqual(getKeyKind(props[3], checker), "symbol", "Symbol() typed");
    assert.strictEqual(getKeyKind(props[4], checker), "other-computed", "string-typed computed");
    assert.strictEqual(getKeyKind(props[5], checker), "string", "computed string literal");
    assert.strictEqual(getKeyKind(props[6], checker), "number", "computed numeric literal");
  }
}
