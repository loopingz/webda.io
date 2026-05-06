import { suite, test } from "@webda/test";
import * as assert from "assert";
import { existsSync, readFileSync, unlinkSync } from "fs";
import { assertUnreachable, getFileName, isMainModule, NotEnumerable, StaticInterface, writer } from "./lib";

interface TestStatic {
  count: number;
}

@StaticInterface<TestStatic>()
class TestClass {
  @NotEnumerable
  notEnumerable = "test";
  static count: number = 0;
}

@suite
class TscEsmTest {
  testFiles: string[] = [];

  afterEach() {
    for (const f of this.testFiles) {
      if (existsSync(f)) {
        unlinkSync(f);
      }
    }
    this.testFiles.length = 0;
  }

  @test
  simple() {
    writer(
      "./test/plop.js",
      `import { PubSub } from "@google-cloud/pubsub";
import { Bean, CancelablePromise, Service } from "@webda/core";
import { createReadStream, createWriteStream, lstatSync, readdirSync } from "fs";
import { createGunzip, createGzip } from "zlib";
import {
  SinkServiceParameters,
  Test
 } from "./index";
import * as ind from './index';
import { Bean, Inject, Queue, Service, ServiceParameters, Throttler } from "@webda/core";
import { open } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
export { SinkService } from "./export";
export * from './export';

let SinkService = class SinkService extends Service {
    constructor() {
        super(...arguments);
        this.dir = "/...";
    }
}`
    );
    this.testFiles.push("./test/plop.js");
    const content = readFileSync("./test/plop.js").toString();

    assert.ok(content.includes('"./index.js"'));
    assert.ok(content.includes("'./index.js'"));
    assert.ok(content.includes('"./export.js"'));
    assert.ok(content.includes("'./export.js'"));
    assert.ok(!content.includes('"node:fs/promises.js"'));
    assert.ok(!content.includes('"node:stream/promises.js"'));
  }

  @test
  dynamicImports() {
    writer(
      "./test/dynamic.js",
      `const a = await import("./utils");
const b = await import('./helpers');
const c = await import("./already.js");
const d = await import("node:fs/promises");
const e = await import("@google-cloud/pubsub");`
    );
    this.testFiles.push("./test/dynamic.js");
    const content = readFileSync("./test/dynamic.js").toString();
    assert.ok(content.includes('import("./utils.js")'));
    assert.ok(content.includes("import('./helpers.js')"));
    assert.ok(content.includes('import("./already.js")'));
    assert.ok(!content.includes('import("./already.js.js")'));
    assert.ok(!content.includes('"node:fs/promises.js"'));
    assert.ok(!content.includes('"@google-cloud/pubsub.js"'));
  }

  @test
  noScopedSubpathRewrite() {
    writer(
      "./test/scoped.js",
      `import { X } from "@scope/pkg/sub";
import { Y } from "some-pkg/deep/path";`
    );
    this.testFiles.push("./test/scoped.js");
    const content = readFileSync("./test/scoped.js").toString();
    assert.ok(!content.includes('"@scope/pkg/sub.js"'));
    assert.ok(!content.includes('"some-pkg/deep/path.js"'));
  }

  @test
  meta() {
    const t = new TestClass();
    assert.ok(!Object.keys(t).includes("notEnumerable"));
  }

  @test
  assertUnreachableTest() {
    function f(x: "a" | "b") {
      switch (x) {
        case "a":
          return 1;
        case "b":
          return 2;
        default:
          return assertUnreachable(x);
      }
    }
    f("a");
    f("b");
    assert.throws(() => f("c" as any));
  }

  @test
  isMainModuleTest() {
    assert.ok(!isMainModule(import.meta));
  }

  @test
  getFileNameTest() {
    const fileName = getFileName(import.meta);
    assert.ok(fileName.match(/lib\.spec\.[tj]s$/));
    assert.throws(() => getFileName({} as any));
  }
}
