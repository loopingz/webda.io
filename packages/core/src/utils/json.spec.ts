import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { JSONUtils } from "./json";

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
  ciruclarJSON() {
    let a: any = {
      b: "test",
      c: {}
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
}
