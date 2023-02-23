import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { existsSync, readFileSync, symlinkSync } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { FileUtils, JSONUtils, YAMLUtils } from "./serializers";

const TEST_FOLDER = path.dirname(fileURLToPath(import.meta.url)) + "/../../test/jsonutils/";
@suite
class UtilsTest {
  @test("LoadJSON File")
  fileJson() {
    assert.deepStrictEqual(JSONUtils.loadFile(TEST_FOLDER + "test.json"), { test: "ok" });
    assert.deepStrictEqual(YAMLUtils.loadFile(TEST_FOLDER + "test.json"), { test: "ok" });
    assert.deepStrictEqual(FileUtils.load(TEST_FOLDER + "test.json"), { test: "ok" });
    assert.throws(() => JSONUtils.loadFile("/none"), /File '\/none' does not exist/);
    assert.throws(() => JSONUtils.loadFile("./Dockerfile"), /Unknown format/);
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
      __test: true,
      n: null
    };
    a.c.a = a;
    assert.deepStrictEqual(JSONUtils.stringify(a), JSON.stringify({ b: "test", c: {}, __test: true }, undefined, 2));
    assert.deepStrictEqual(
      JSONUtils.safeStringify(a),
      JSON.stringify({ b: "test", c: {}, __test: true }, undefined, 2)
    );
    assert.deepStrictEqual(
      JSONUtils.stringify(
        a,
        (key, value) => {
          if (key !== "b" && key !== "n") return value;
          return undefined;
        },
        3,
        true
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
      JSON.stringify({ b: "test", c: { plop: "bouzouf" }, __test: true, d: { plop: "bouzouf" } }, undefined, 2)
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

    // Yaml alias
    file = path.join(TEST_FOLDER, "writeTest.json");
    YAMLUtils.saveFile({ test: "plop" }, file);
    assert.strictEqual(readFileSync(file).toString(), '{\n  "test": "plop"\n}');

    // True implem
    file = path.join(TEST_FOLDER, "writeTest.json");
    FileUtils.save({ test: "plop" }, file);
    assert.strictEqual(readFileSync(file).toString(), '{\n  "test": "plop"\n}');
    assert.throws(() => JSONUtils.saveFile({}, "./Dockerfile.zzz"), /Unknown format/);
  }

  @test
  duplicate() {
    let obj = { plop: "test" };
    let obj2 = JSONUtils.duplicate(obj);
    assert.notStrictEqual(obj, obj2);
    assert.deepStrictEqual(obj, obj2);
    obj2 = JSONUtils.parse('{"plop": "test"}');
    assert.deepStrictEqual(obj, obj2);
  }

  @test
  audience() {
    assert.strictEqual(
      JSONUtils.stringify({ __dirname: "plop", me: null, test: "plop" }, undefined, 2, true),
      '{\n  "test": "plop"\n}'
    );
    assert.throws(
      () =>
        JSONUtils.stringify({ test: true }, () => {
          throw new Error("BOUZOUF");
        }),
      /BOUZOUF/
    );
  }

  @test("YAML octal")
  octal() {
    assert.deepEqual(
      YAMLUtils.parse(
        `
plop: 0o600
`
      ),
      { plop: 384 }
    );
  }

  @test("YAML stringify")
  yaml() {
    assert.strictEqual(
      YAMLUtils.stringify({ plop: "test" }),
      `plop: test
`
    );
    assert.deepEqual(
      YAMLUtils.parse(
        `
plop: test
`
      ),
      { plop: "test" }
    );
  }

  @test
  finder() {
    let res = [];
    if (!existsSync("./test/link")) {
      symlinkSync("../templates", "test/link");
    }
    FileUtils.find("test", f => res.push(f));
    assert.ok(
      ["test/models/ident.js", "test/my-cnf.json", "test/jsonutils/mdocs.yaml", "test/data/test.png"]
        .map(c => res.includes(c))
        .reduce((v, c) => v && c, true)
    );
    res = [];
    FileUtils.find("test", f => res.push(f), { includeDir: true, followSymlinks: true });
    assert.ok(res.filter(r => r.includes("PASSPORT_EMAIL_RECOVERY")).length > 0);
  }

  @test
  async streams() {
    const st = FileUtils.getWriteStream("/tmp/webda.stream");
    let p = new Promise(resolve => st.on("finish", resolve));
    st.end();
    await p;
    FileUtils.getReadStream("/tmp/webda.stream");
  }
}
