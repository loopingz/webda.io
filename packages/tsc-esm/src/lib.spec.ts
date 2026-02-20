import { suite, test } from "@webda/test";
import * as assert from "assert";
import { existsSync, readFileSync, unlinkSync } from "fs";
import { assertUnreachable, getFileName, isMainModule, NotEnumerable, StaticInterface, writer } from "./lib";

@suite
@StaticInterface<TestStatic>()
class Test {
  @NotEnumerable
  notEnumerable = "test";
  static count: number = 0;
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
    const content = readFileSync("./test/plop.js").toString();

    assert.ok(content.includes('"./index.js"'));
    assert.ok(content.includes("'./index.js'"));
    assert.ok(content.includes('"./export.js"'));
    assert.ok(content.includes("'./export.js'"));
    assert.ok(!content.includes('"node:fs/promises.js"'));
    assert.ok(!content.includes('"node:stream/promises.js"'));
  }

  @test
  meta() {
    assert.ok(!Object.keys(this).includes("notEnumerable"));
  }

  @test
  assertUnreachable() {
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
  isMainModule() {
    // Cannot test properly in tsc-esm as we use ts-node for tests
    // But we can at least check it does not crash
    assert.ok(!isMainModule(import.meta));
  }

  @test
  getFileName() {
    const fileName = getFileName(import.meta);
    assert.ok(fileName.match(/lib\.spec\.[tj]s$/));
    assert.throws(() => getFileName({} as any));
  }

  after() {
    if (existsSync("./test/plop.js")) {
      unlinkSync("./test/plop.js");
    }
  }
}

interface TestStatic {
  count: number;
}
