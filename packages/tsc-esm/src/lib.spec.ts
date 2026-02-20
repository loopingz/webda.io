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
  dynamicImports() {
    writer(
      "./test/dynamic.js",
      `const a = await import("./utils");
const b = await import('./helpers');
const c = await import("./already.js");
const d = await import("node:fs/promises");
const e = await import("@google-cloud/pubsub");`
    );
    const content = readFileSync("./test/dynamic.js").toString();
    // relative paths get .js appended
    assert.ok(content.includes('import("./utils.js")'));
    assert.ok(content.includes("import('./helpers.js')"));
    // already has .js – must not double-add
    assert.ok(content.includes('import("./already.js")'));
    assert.ok(!content.includes('import("./already.js.js")'));
    // node: protocol must not be touched
    assert.ok(!content.includes('"node:fs/promises.js"'));
    // bare package specifier must not be touched
    assert.ok(!content.includes('"@google-cloud/pubsub.js"'));
  }

  @test
  noScopedSubpathRewrite() {
    writer(
      "./test/scoped.js",
      `import { X } from "@scope/pkg/sub";
import { Y } from "some-pkg/deep/path";`
    );
    const content = readFileSync("./test/scoped.js").toString();
    // scoped sub-path imports from node_modules must NOT get .js appended
    assert.ok(!content.includes('"@scope/pkg/sub.js"'));
    assert.ok(!content.includes('"some-pkg/deep/path.js"'));
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
    for (const f of ["./test/plop.js", "./test/dynamic.js", "./test/scoped.js"]) {
      if (existsSync(f)) {
        unlinkSync(f);
      }
    }
  }
}

interface TestStatic {
  count: number;
}
