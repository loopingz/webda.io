import { suite, test } from "@webda/test";
import * as assert from "assert";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "path";
import { Compiler } from "./index.js";
import { WebdaProject } from "./definition.js";
import { checkSanitizeModePackages, findSanitizeMode, writeModule } from "./module.js";

/**
 * A generated module whose model and operation input hold Markdown texts
 * @returns the module
 */
function markdownModule(): any {
  return {
    beans: {},
    models: {
      "Acme/Post": {
        Schemas: {
          Input: {
            type: "object",
            properties: {
              title: { type: "string", "x-webda-sanitize": "none" },
              body: { type: "string", "x-webda-sanitize": "markdown" },
              sections: { type: "array", items: { $ref: "#/definitions/Section" } }
            },
            definitions: {
              Section: { type: "object", properties: { text: { type: "string", "x-webda-sanitize": "markdown" } } }
            }
          },
          // Only what a client can send matters
          Output: { type: "object", properties: { rendered: { type: "string", "x-webda-sanitize": "markdown" } } }
        }
      },
      "Acme/NoSchema": {}
    },
    schemas: {
      "Publisher.publish.input": {
        type: "object",
        properties: { notes: { type: "array", items: { type: "string" }, "x-webda-sanitize": "markdown" } }
      },
      "Publisher.publish.output": { type: "string", "x-webda-sanitize": "markdown" }
    }
  };
}

/**
 * The build refuses `@sanitize markdown` when the application did not install micromark
 */
@suite
class SanitizePackagesTest {
  /**
   * Install an empty package in an application
   * @param dir - the application root
   * @param name - the package name
   */
  install(dir: string, name: string) {
    const folder = path.join(dir, "node_modules", name);
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, "package.json"), JSON.stringify({ name, version: "1.0.0", main: "index.js" }));
    writeFileSync(path.join(folder, "index.js"), "");
  }

  @test
  findsTaggedProperties() {
    const mod = markdownModule();
    assert.deepStrictEqual(findSanitizeMode(mod.models["Acme/Post"].Schemas.Input, "markdown"), [
      "body",
      "#Section.text"
    ]);
    assert.deepStrictEqual(findSanitizeMode(mod.schemas["Publisher.publish.input"], "markdown"), ["notes"]);
    assert.deepStrictEqual(findSanitizeMode(mod.models["Acme/Post"].Schemas.Input, "none"), ["title"]);
    // Array items, unions, and a schema that is itself tagged
    assert.deepStrictEqual(
      findSanitizeMode(
        {
          properties: {
            list: { type: "array", items: { anyOf: [{ type: "string", "x-webda-sanitize": "markdown" }, null] } }
          }
        },
        "markdown"
      ),
      ["list[]"]
    );
    assert.deepStrictEqual(findSanitizeMode({ type: "string", "x-webda-sanitize": "markdown" }, "markdown"), [""]);
    // Data is not schema
    assert.deepStrictEqual(
      findSanitizeMode(
        {
          properties: {
            a: { default: { "x-webda-sanitize": "markdown" }, examples: [{ "x-webda-sanitize": "markdown" }] },
            b: { enum: [{ "x-webda-sanitize": "markdown" }], const: { "x-webda-sanitize": "markdown" } }
          }
        },
        "markdown"
      ),
      []
    );
    assert.deepStrictEqual(findSanitizeMode(undefined, "markdown"), []);
    assert.deepStrictEqual(findSanitizeMode("string", "markdown"), []);
  }

  @test
  buildFailsWithoutThePackages() {
    // Outside the repository: nothing resolves micromark from here
    const dir = mkdtempSync(path.join(tmpdir(), "webdac-sanitize-"));
    try {
      writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "@acme/app", version: "1.0.0" }));
      writeFileSync(path.join(dir, "webda.config.json"), JSON.stringify({ version: 3, services: {} }));
      const compiler = new Compiler(new WebdaProject(dir));
      const generated = () => ({ module: markdownModule(), namingViolations: [], errors: [] });

      // Neither package: one error naming both, the install command and every use
      const [error, ...others] = checkSanitizeModePackages(dir, markdownModule());
      assert.deepStrictEqual(others, []);
      assert.match(error, /@sanitize markdown requires micromark and micromark-util-decode-string, which are not/);
      assert.ok(error.includes(`not installed in ${dir}`));
      assert.match(error, /pnpm add micromark micromark-util-decode-string/);
      assert.match(error, / - model Acme\/Post, attribute body\n/);
      assert.match(error, / - model Acme\/Post, attribute #Section\.text\n/);
      assert.match(error, / - schema Publisher\.publish\.input, property notes$/);
      assert.ok(!error.includes("rendered") && !error.includes("publish.output"), "outputs are not client input");
      // ... and it is an error: the module is not written
      assert.strictEqual(writeModule(compiler, generated()), undefined);
      assert.ok(!existsSync(path.join(dir, "webda.module.json")));

      // A module that does not use the mode builds without them
      const plain = markdownModule();
      delete plain.models["Acme/Post"];
      delete plain.schemas["Publisher.publish.input"];
      assert.deepStrictEqual(checkSanitizeModePackages(dir, plain), []);
      assert.deepStrictEqual(checkSanitizeModePackages(dir, {}), []);

      // One of the two: still an error, naming the missing one
      this.install(dir, "micromark");
      const [partial] = checkSanitizeModePackages(dir, markdownModule());
      assert.match(partial, /requires micromark-util-decode-string, which is not installed/);
      assert.strictEqual(writeModule(compiler, generated()), undefined);

      // Both installed in the application: the build goes on
      this.install(dir, "micromark-util-decode-string");
      assert.deepStrictEqual(checkSanitizeModePackages(dir, markdownModule()), []);
      assert.notStrictEqual(writeModule(compiler, generated()), undefined);
      assert.ok(existsSync(path.join(dir, "webda.module.json")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
