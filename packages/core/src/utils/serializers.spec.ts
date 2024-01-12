import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from "fs";
import * as path from "path";
import { pipeline } from "stream/promises";
import { fileURLToPath } from "url";
import { gunzipSync } from "zlib";
import { FileUtils, JSONUtils, NDJSonReader as NDJSONReader, NDJSONStream, YAMLUtils } from "./serializers";

const TEST_FOLDER = path.dirname(fileURLToPath(import.meta.url)) + "/../../test/jsonutils/";
@suite
class UtilsTest {
  @test("LoadJSON File")
  fileJson() {
    assert.deepStrictEqual(JSONUtils.loadFile(TEST_FOLDER + "test.json"), {
      test: "ok"
    });
    assert.deepStrictEqual(YAMLUtils.loadFile(TEST_FOLDER + "test.json"), {
      test: "ok"
    });
    assert.deepStrictEqual(FileUtils.load(TEST_FOLDER + "test.json"), {
      test: "ok"
    });
    assert.throws(() => JSONUtils.loadFile("/none"), /File '\/none' does not exist/);
    assert.throws(() => JSONUtils.loadFile("./Dockerfile"), /SyntaxError/);
    assert.throws(() => FileUtils.load("./Dockerfile"), /Unknown format/);
  }

  @test("LoadYAML File")
  fileYml() {
    assert.deepStrictEqual(YAMLUtils.loadFile(TEST_FOLDER + "test.yml"), {
      test: { ok: "plop" },
      tab: ["ok", "item2"]
    });
  }

  @test("LoadYAML Multiple Docs File")
  fileYaml() {
    assert.strictEqual(FileUtils.load(TEST_FOLDER + "mdocs.yaml").length, 2);
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
      JSON.stringify(
        {
          b: "test",
          c: { plop: "bouzouf" },
          __test: true,
          d: { plop: "bouzouf" }
        },
        undefined,
        2
      )
    );
  }

  @test
  sortObject() {
    assert.deepStrictEqual(JSONUtils.sortObject({ a: 1, c: 2, b: 3 }), { a: 1, b: 3, c: 2 });
    assert.deepStrictEqual(
      JSONUtils.sortObject({ a: 1, c: 2, b: 3 }, p => (p < 3 ? p + 2 : undefined)),
      { a: 3, c: 4 }
    );
  }

  @test("Write JSON/YAML")
  writeJSON() {
    try {
      let file = path.join(TEST_FOLDER, "writeTest.json");
      JSONUtils.saveFile({ test: "plop" }, file);
      assert.strictEqual(readFileSync(file).toString(), '{\n  "test": "plop"\n}');
      file = path.join(TEST_FOLDER, "writeTest.yaml");
      FileUtils.save({ test: "plop" }, file);
      assert.strictEqual(readFileSync(file).toString(), `test: plop\n`);

      // Yaml alias
      file = path.join(TEST_FOLDER, "writeTest.json");
      YAMLUtils.saveFile({ test: "plop" }, file);
      assert.strictEqual(readFileSync(file).toString(), `test: plop\n`);

      // True implem
      file = path.join(TEST_FOLDER, "writeTest.json");
      FileUtils.save({ test: "plop" }, file);
      assert.strictEqual(readFileSync(file).toString(), '{\n  "test": "plop"\n}');

      // Gzip
      file = path.join(TEST_FOLDER, "writeTest.json.gz");
      FileUtils.save({ test: "plop" }, file);
      const buf = readFileSync(file);
      assert.strictEqual(buf[0], 0x1f);
      assert.strictEqual(buf[1], 0x8b);
      assert.deepStrictEqual(JSON.parse(gunzipSync(buf).toString()), { test: "plop" });
      assert.deepStrictEqual(FileUtils.load(file), { test: "plop" });

      assert.throws(() => FileUtils.save({}, "./Dockerfile.zzz"), /Unknown format/);
    } finally {
      FileUtils.clean(
        "test/jsonutils/writeTest.json.gz",
        "test/jsonutils/writeTest.json",
        "test/jsonutils/writeTest.yaml"
      );
    }
  }

  @test
  async ndjsonStream() {
    try {
      const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const file = ".test.ndjson";
      await pipeline(new NDJSONStream(data), createWriteStream(file));
      let counter = 0;
      await pipeline(
        createReadStream(file),
        new NDJSONReader().on("data", (d: any) => {
          counter += d.id;
        })
      );
      assert.strictEqual(counter, 6);
    } finally {
      if (existsSync(".test.ndjson")) {
        unlinkSync(".test.ndjson");
      }
    }
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

  @test
  parse() {
    let res = YAMLUtils.parse(`
apiVersion: v1
kind: Service
---
apiVersion: v1
kind: Pod
`);
    assert.deepStrictEqual(res, [
      { apiVersion: "v1", kind: "Service" },
      { apiVersion: "v1", kind: "Pod" }
    ]);
    res = YAMLUtils.parse(`
apiVersion: v1
kind: Service
`);
    assert.deepStrictEqual(res, { apiVersion: "v1", kind: "Service" });
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
  walker() {
    try {
      let res = [];
      if (!existsSync("./test/link")) {
        symlinkSync("../templates", "test/link");
      }
      try {
        if (!existsSync("./test/badlink")) {
          symlinkSync("../non-existing", "test/badlink");
        }
      } catch (err) {}
      FileUtils.walk("test", f => res.push(f));
      assert.ok(
        ["test/models/ident.js", "test/jsonutils/mdocs.yaml", "test/data/test.png"]
          .map(c => res.includes(c))
          .reduce((v, c) => v && c, true)
      );
      res = [];
      FileUtils.walk("test", f => res.push(f), {
        includeDir: true,
        followSymlinks: true
      });
      assert.ok(res.filter(r => r.includes("PASSPORT_EMAIL_RECOVERY")).length > 0);
    } finally {
      FileUtils.clean("test/link");
    }
  }

  @test
  finder() {
    let res = FileUtils.find("test", { filterPattern: /Dockerfile/ });
    assert.ok(res.includes("test/Dockerfile"));
  }

  @test
  async streams() {
    const st = FileUtils.getWriteStream("/tmp/webda.stream");
    let p = new Promise(resolve => st.on("finish", resolve));
    st.end();
    await p;
    FileUtils.getReadStream("/tmp/webda.stream");
  }

  @test
  async jsoncUpdateFile() {
    const file = "/tmp/webda.jsonc";
    const JSONC_SOURCE = `{
      "test": "plop",
      // Comment one
      "test3": {
        "bouzoufr": "plop"
      },
      "test4": {
        "array": [
          "plop",
          "plop2",
          {"id": "plop3"}
        ],
        "p": {
          "v": "bouzouf"
         }, /* c, */
        "remove": true /* c */        
      },
      "test2": {
        "plop3": "bouzouf", // Comment on 3
        /* */ /* */ /* */ /* */ /* */ /* */ 
        /*
        Test of , comments
        */
        "plop2": "bouzouf", // Comment two with a , for fun
        /**
         * another , one
         * */
        "plop4": "bouzouf"
      },
      "removed": true
    }`;
    try {
      writeFileSync(file, JSONC_SOURCE);
      await JSONUtils.updateFile(file, v => {
        if (v === "bouzouf") {
          return "bouzouf2";
        }
        return v;
      });
      const data = FileUtils.load(file);
      assert.strictEqual(data.test4.p.v, "bouzouf2");
      assert.strictEqual(data.test2.plop4, "bouzouf2");
      assert.strictEqual(data.test2.plop2, "bouzouf2");
      assert.strictEqual(data.test2.plop3, "bouzouf2");
      const update = readFileSync(file).toString();
      assert.strictEqual(update.length, JSONC_SOURCE.length + 4);
    } finally {
      FileUtils.clean(file);
    }
  }
}
