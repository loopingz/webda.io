import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from "fs";
import * as path from "path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "url";
import { gunzipSync, gzipSync } from "zlib";
import {
  BufferWritableStream,
  FileUtils,
  GunzipConditional,
  JSONUtils,
  NDJSonReader as NDJSONReader,
  NDJSONStream,
  YAMLUtils
} from "./serializers";
import { Readable } from "node:stream";
import { getCommonJS } from "../lib";
import { YAMLProxy } from "./yamlproxy";

const TEST_FOLDER = path.dirname(fileURLToPath(import.meta.url)) + "/../test/jsonutils/";
const PACKAGE_FOLDER = path.dirname(fileURLToPath(import.meta.url)) + "/../";
@suite
class UtilsTest {
  @test("LoadJSON File")
  fileJson() {
    const { __dirname } = getCommonJS(import.meta.url);
    assert.deepStrictEqual(JSONUtils.loadFile(TEST_FOLDER + "test.json"), {
      test: "ok"
    });
    assert.deepStrictEqual(YAMLUtils.loadFile(TEST_FOLDER + "test.json").toJSON(), {
      test: "ok"
    });
    assert.deepStrictEqual(FileUtils.load(TEST_FOLDER + "test.json"), {
      test: "ok"
    });
    assert.throws(() => JSONUtils.loadFile("/none"), /File '\/none' does not exist/);
    assert.throws(() => JSONUtils.loadFile(__dirname + "/../vitest.config.ts"), /SyntaxError/);
    assert.throws(() => FileUtils.load(__dirname + "/../vitest.config.ts"), /Unknown format/);
  }

  @test("LoadYAML File")
  fileYml() {
    assert.deepStrictEqual(YAMLUtils.loadFile(TEST_FOLDER + "test.yml").toJSON(), {
      test: { ok: "plop" },
      tab: ["ok", "item2"]
    });
  }

  @test("LoadYAML Multiple Docs File")
  fileYaml() {
    assert.strictEqual(FileUtils.load(TEST_FOLDER + "mdocs.yaml").length, 2);
    assert.strictEqual(FileUtils.loadConfigurationFile(TEST_FOLDER + "mdocs").length, 2);
  }

  @test("CircularJSON")
  circularJSON() {
    const a: any = {
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
    const a: any = {
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
    const obj = { plop: "test" };
    let obj2 = JSONUtils.duplicate(obj);
    assert.notStrictEqual(obj, obj2);
    assert.deepStrictEqual(obj, obj2);
    obj2 = JSONUtils.parse('{"plop": "test"}');
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
  async walker() {
    try {
      let res: string[] = [];
      const { __dirname } = getCommonJS(import.meta.url);
      try {
        readlinkSync(__dirname + "/../test/link");
      } catch (err) {
        symlinkSync(__dirname + "/../../core/templates", __dirname + "/../test/link");
      }
      try {
        readlinkSync(__dirname + "/../test/linkFile");
      } catch (err) {
        symlinkSync(__dirname + "/../jsonutils/mdocs.yaml", "test/linkFile");
      }
      try {
        readlinkSync(__dirname + "/../test/badlink");
      } catch (err) {
        symlinkSync(__dirname + "/../../non-existing", "test/badlink");
      }
      await FileUtils.walk(__dirname + "/../test", f => res.push(f));
      res = res.map(c => c.replace(path.resolve(__dirname + "/../") + "/", ""));
      assert.ok(
        ["test/jsonutils/mdocs.yaml", "test/jsonutils/test.yml", "test/jsonutils/test.json"]
          .map(c => res.includes(c))
          .reduce((v, c) => v && c, true)
      );
      res = [];
      FileUtils.walkSync(__dirname + "/../test", f => res.push(f), {
        includeDir: true,
        followSymlinks: true
      });
      assert.ok(res.filter(r => r.includes("PASSPORT_EMAIL_RECOVERY")).length > 0);
    } finally {
      FileUtils.clean("test/link");
    }
  }

  @test
  async finder() {
    const { __dirname } = getCommonJS(import.meta.url);
    const res = await FileUtils.find(__dirname + "/../test", { filterPattern: /mdocs/ });
    assert.ok(res.findIndex(c => c.includes("test/jsonutils/mdocs.yaml")) > -1);
  }

  @test
  async streams() {
    const st = await FileUtils.getWriteStream("/tmp/webda.stream");
    const p = new Promise(resolve => st.on("finish", resolve));
    st.end();
    await p;
    await FileUtils.getReadStream("/tmp/webda.stream");
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
      const content = FileUtils.load(file);
      content.test2.plop4 = "bouzouf2";
      content.test4.p.v = "bouzouf2";
      FileUtils.save(content, file);
      const data = FileUtils.load(file);
      assert.strictEqual(data.test4.p.v, "bouzouf2");
      assert.strictEqual(data.test2.plop4, "bouzouf2");
      const update = readFileSync(file).toString();
      assert.strictEqual(update.length, JSONC_SOURCE.length + 2);
    } finally {
      //FileUtils.clean(file);
    }
  }

  @test
  async conditionalGunzip() {
    const content = readFileSync(PACKAGE_FOLDER + "package.json");
    const gzipped = gzipSync(content);
    const unzipped = new BufferWritableStream();
    const uncompressed = new BufferWritableStream();
    const buffer = unzipped.get();

    await pipeline([Readable.from(content), new GunzipConditional(), uncompressed]);
    await pipeline([Readable.from(gzipped), new GunzipConditional(), unzipped]);

    assert.strictEqual((await buffer).toString(), content.toString());
    assert.strictEqual((await uncompressed.get()).toString(), content.toString());
    // Simulate an errored stream
    const faultyStream = new Readable();
    const fault = new BufferWritableStream();
    const p = pipeline([faultyStream, new GunzipConditional(), fault]);
    const b = fault.get();
    faultyStream.push("plop");
    faultyStream.emit("error", new Error("BOUZOUF"));
    await assert.rejects(() => p);
    await assert.rejects(() => b);
  }

  static testComments(file: string, loader: (data: string) => any, autoClone?: boolean) {
    const obj: {
      test: string;
      testToAdd: any;
      testToDelete: any;
      testArray2: any;
      testArray: string[];
      testMap: { [key: string]: string };
      testMapRenamed: { [key: string]: string };
      testMapRenamed2: { [key: string]: string };
    } = FileUtils.load(getCommonJS(import.meta.url).__dirname + "/../test/jsonutils/" + file);

    obj.test = "unitTest";
    obj.testToAdd = "plop";
    delete obj.testToDelete;
    obj.testArray2 = [...obj.testArray];
    obj.testArray.push(<any>true);
    obj.testArray.unshift(<any>1234);
    obj.testArray.push("rawType");
    obj.testArray.push(<any>["seq", 12]);
    obj.testArray.push(<any>{
      test: "map",
      test2: true
    });
    obj.testMapRenamed = obj.testMap;
    obj.testMapRenamed2 = { ...obj.testMap };
    obj.testMap.plop = "unitTest";
    obj.testMap.unitTest = "unitTest";
    delete obj.testMap.test2;
    const rendered = obj.toString();
    [
      "This is a comment",
      "This is a second comment",
      "This is a comment in an array",
      "This is a comment in a map"
    ].forEach(c => assert.ok(rendered.includes(c), `Should contain '${c}'`));
    const t2 = loader(rendered);
    assert.deepStrictEqual(t2, JSON.parse(JSON.stringify(obj)));
    assert.deepStrictEqual(t2, {
      test: "unitTest",
      testArray: [
        1234,
        "plop",
        "plop2",
        true,
        "rawType",
        ["seq", 12],
        {
          test: "map",
          test2: true
        }
      ],
      testMap: {
        test: "plop",
        plop: "unitTest",
        unitTest: "unitTest"
      },
      testToAdd: "plop",
      testArray2: ["plop", "plop2"],
      testMapRenamed: autoClone
        ? { test: "plop", test2: "plop2" }
        : {
            test: "plop",
            plop: "unitTest",
            unitTest: "unitTest"
          },
      testMapRenamed2: {
        test: "plop",
        test2: "plop2"
      }
    });
  }

  @test
  yamlComments() {
    UtilsTest.testComments("comment.yaml", (value: string) => YAMLUtils.parse(value), true);
  }

  @test
  jsoncComments() {
    UtilsTest.testComments("comment.jsonc", (value: string) => {
      return JSONUtils.parse(value).toJSON();
    });
  }

  @test
  jsoncComments2() {
    const data = FileUtils.load(getCommonJS(import.meta.url).__dirname + "/../test/jsonutils/comment2.jsonc");
    data.$schema = "http://...";
    data.a = "cdcdcd";
    data.cc = "dd";
    data.e = "e";
    const file = readFileSync(getCommonJS(import.meta.url).__dirname + "/../test/jsonutils/comment2_update.jsonc");
    assert.strictEqual(data.toString(), file.toString());
  }
}
