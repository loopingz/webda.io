import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { existsSync, readFileSync, unlinkSync } from "fs";
import { writer } from "./lib";

@suite
class Test {
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
import { open } from "node:fs/promises";
export { SinkService } from "./export";
export * from './export';

let SinkService = class SinkService extends Service {
    constructor() {
        super(...arguments);
        this.dir = "/media/loopingz/5400-E104/Trails/pubsub/";
    }
}`
    );
    const content = readFileSync("./test/plop.js").toString();

    assert.ok(content.includes('"./index.js"'));
    assert.ok(content.includes("'./index.js'"));
    assert.ok(content.includes('"./export.js"'));
    assert.ok(content.includes("'./export.js'"));
    assert.ok(!content.includes('"node:fs/promises.js"'));
  }

  after() {
    if (existsSync("./test/plop.js")) {
      unlinkSync("./test/plop.js");
    }
  }
}
