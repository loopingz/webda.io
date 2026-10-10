import { suite, test } from "@webda/test";
import { getCommonJS, parseImportDescriptor, toImportSpecifier } from "./esm.js";
import * as assert from "assert";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

@suite
class EsmTest {
  @test
  normal() {
    // This is a test
    const info = getCommonJS(import.meta.url);
    assert.ok(info.__dirname.endsWith(join("packages", "utils", "src")));
    assert.ok(info.__filename.endsWith(join("packages", "utils", "src", "esm.spec.ts")));
  }

  @test
  parseImportDescriptor() {
    assert.deepStrictEqual(parseImportDescriptor("lib/services/my.js:MyService"), {
      file: "lib/services/my.js",
      exportName: "MyService"
    });
    assert.deepStrictEqual(parseImportDescriptor("lib/services/my.js"), {
      file: "lib/services/my.js",
      exportName: "default"
    });
    assert.deepStrictEqual(parseImportDescriptor("/app/lib/my.js:$My_Service1"), {
      file: "/app/lib/my.js",
      exportName: "$My_Service1"
    });
    // Windows drive letters must not be mistaken for the export separator
    assert.deepStrictEqual(parseImportDescriptor("C:\\app\\lib\\my.js:MyService"), {
      file: "C:\\app\\lib\\my.js",
      exportName: "MyService"
    });
    assert.deepStrictEqual(parseImportDescriptor("C:\\app\\lib\\my.js"), {
      file: "C:\\app\\lib\\my.js",
      exportName: "default"
    });
    assert.deepStrictEqual(parseImportDescriptor("d:/app/lib/my.js:MyService"), {
      file: "d:/app/lib/my.js",
      exportName: "MyService"
    });
  }

  @test
  toImportSpecifier() {
    // Bare and relative specifiers are left untouched
    assert.strictEqual(toImportSpecifier("@webda/core"), "@webda/core");
    assert.strictEqual(toImportSpecifier("./lib/my.js"), "./lib/my.js");
    // Absolute paths become file URLs so import() accepts them on every platform
    const abs = join(process.cwd(), "lib", "my.js");
    assert.strictEqual(toImportSpecifier(abs), pathToFileURL(abs).href);
    assert.ok(toImportSpecifier(abs).startsWith("file:///"));
  }
}
