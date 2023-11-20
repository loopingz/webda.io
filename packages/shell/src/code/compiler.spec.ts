import { suite, test } from "@testdeck/mocha";
import { getCommonJS } from "@webda/core";
import * as assert from "assert";
import * as path from "path";
import ts from "typescript";
import { WebdaSampleApplication } from "../index.spec";
import { Compiler } from "./compiler";
import { SourceApplication } from "./sourceapplication";
const { __dirname } = getCommonJS(import.meta.url);

@suite
class CompilerTest {
  @test
  async compilerCov() {
    const node: ts.Node = {
      kind: ts.SyntaxKind.QualifiedName,
      left: {
        kind: ts.SyntaxKind.AnyKeyword,
        getText: () => "Plop"
      },
      getText: () => "Plop",
      parent: {
        kind: ts.SyntaxKind.AnyKeyword,
        getText: () => "Plop",
        // @ts-ignore
        parent: {
          kind: ts.SyntaxKind.AnyKeyword,
          getText: () => "Plop"
        }
      }
    };
    let app = new SourceApplication(WebdaSampleApplication.getAppPath(), undefined);
    await app.load();
    let compiler = new Compiler(app);
    compiler.compile();
    Compiler.displayParents(node);
    assert.strictEqual(compiler.getParent(node, ts.SyntaxKind.AnyKeyword), node.parent);
    assert.strictEqual(compiler.getParent(node, ts.SyntaxKind.AmpersandAmpersandEqualsToken), undefined);
    Compiler.displayTree(node);
    assert.strictEqual(compiler.getServiceTypePattern("Webda/Test"), "^(Webda/)?Test$");
    assert.strictEqual(compiler.getServiceTypePattern("ReTest"), "^(WebdaDemo/)?ReTest$");

    compiler.getPackageFromType({
      // @ts-ignore
      symbol: {
        getDeclarations: () => []
      }
    });

    compiler.getPackageFromType({
      // @ts-ignore
      symbol: {
        getDeclarations: () => [
          {
            // @ts-ignore
            getSourceFile: () => ({
              fileName: "/notexisting/path/for/cov"
            })
          }
        ]
      }
    });

    compiler.getJSTargetFile(compiler.tsProgram.getSourceFiles().filter(f => !f.isDeclarationFile)[0], true);
    compiler.getJSTargetFile(compiler.tsProgram.getSourceFiles().filter(f => !f.isDeclarationFile)[0]);
  }

  @test
  async specificCases() {
    const app = new SourceApplication(path.join(__dirname, "..", "..", "..", "..", "test", "compiler"), undefined);
    await app.load();
    let compiler = new Compiler(app);
    compiler.compile();
    let mod = compiler.generateModule();

    // Goodbean should be use the SubDefinition
    assert.strictEqual(mod.schemas["Webda/GoodBean"].required.length, 3);
    assert.notStrictEqual(mod.schemas["Webda/AnotherSchema"], undefined);
    assert.notStrictEqual(mod.schemas["Webda/SchemaTest"], undefined);
    // Ensure we manage failure in schema
    compiler.schemaGenerator.createSchemaFromNodes = () => {
      throw new Error();
    };
    compiler.generateModule();
    // Check if getSchema return null: 747
    // Check if getSchema return object without properties: 751
  }

  @test
  async SampleAppSchemas() {
    const app = new SourceApplication(path.join(__dirname, "..", "..", "..", "..", "sample-app"), undefined);
    await app.load();
    let compiler = new Compiler(app);
    compiler.compile();
    let mod = compiler.generateModule();
    // Check schema have no properties that start with _ in required
    assert.deepStrictEqual(
      mod.schemas["WebdaDemo/SubProject"].required.filter(i => i.startsWith("_")),
      ["_company"]
    );
    assert.deepStrictEqual(
      mod.schemas["WebdaDemo/Computer"].required.filter(i => i.startsWith("_")),
      ["_user"]
    );
  }
}
