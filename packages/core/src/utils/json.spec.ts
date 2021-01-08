import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { JSONUtils } from "./json";
import * as path from "path";
import { readFileSync } from "fs";

const TEST_FOLDER = __dirname + "/../../test/jsonutils/";
@suite
class UtilsTest {
  @test("LoadJSON File")
  fileJson() {
    assert.deepStrictEqual(JSONUtils.loadFile(TEST_FOLDER + "test.json"), { test: "ok" });
  }

  @test("LoadYAML File")
  fileYml() {
    assert.deepStrictEqual(JSONUtils.loadFile(TEST_FOLDER + "test.yml"), {
      test: { ok: "plop" },
      tab: ["ok", "item2"]
    });
  }

  @test("LoadYAML Multiple Docs File")
  fileYaml() {
    assert.strictEqual(JSONUtils.loadFile(TEST_FOLDER + "mdocs.yaml").length, 2);
  }

  @test("CircularJSON")
  circularJSON() {
    let a: any = {
      b: "test",
      c: {},
      __test: true
    };
    a.c.a = a;
    assert.deepStrictEqual(JSONUtils.stringify(a), JSON.stringify({ b: "test", c: {} }, undefined, 2));
    assert.deepStrictEqual(
      JSONUtils.stringify(
        a,
        (key, value) => {
          if (key !== "b") return value;
          return undefined;
        },
        3
      ),
      JSON.stringify({ c: {} }, undefined, 3)
    );
  }

  @test("DuplicateJSON")
  duplicatedJSON() {
    let a: any = {
      b: "test",
      c: {
        plop: "bouzouf"
      },
      __test: true
    };
    a.d = a.c;
    assert.deepStrictEqual(
      JSONUtils.stringify(a),
      JSON.stringify({ b: "test", c: { plop: "bouzouf" }, d: { plop: "bouzouf" } }, undefined, 2)
    );
  }

  @test("Write JSON/YAML")
  writeJSON() {
    let file = path.join(TEST_FOLDER, "writeTest.json");
    JSONUtils.saveFile({ test: "plop" }, file);
    assert.strictEqual(readFileSync(file).toString(), '{\n  "test": "plop"\n}');
    file = path.join(TEST_FOLDER, "writeTest.yaml");
    JSONUtils.saveFile({ test: "plop" }, file);
    assert.strictEqual(readFileSync(file).toString(), `test: plop\n`);
  }
}
