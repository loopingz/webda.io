import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { writer } from "./lib";

@suite
class Test {
  @test
  simple() {
    writer(
      "./test/plop.js",
      `import { PubSub } from "@google-cloud/pubsub";
    import { Bean, CancelablePromise, Service } from "@webda/core";
    import { createReadStream, createWriteStream, lstatSync, readdirSync, } from "fs";
    import { createGunzip, createGzip } from "zlib";
    import { test } from "./index";

    let SinkService = class SinkService extends Service {
        constructor() {
            super(...arguments);
            this.dir = "/media/loopingz/5400-E104/Trails/pubsub/";
        }
    }`
    );
    assert.ok(true);
  }
}
