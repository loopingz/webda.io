import { suite, test } from "@testdeck/mocha";
import { Application, Store, User } from "@webda/core";
import * as assert from "assert";
import { TypescriptSchemaResolver } from "./compiler";
import * as sinon from "sinon";
import { writeFileSync } from "fs";

@suite
class CompilerTest {
  @test
  noTypescript() {
    let logs = [];
    let logger = {
      log: (...args) => logs.push(args)
    };

    let resolver = new TypescriptSchemaResolver( // @ts-ignore
      {
        isTypescript: () => false
      },
      logger
    );
    assert.deepStrictEqual(logs, [["TRACE", "Application is not typescript can not guess schemas"]]);
  }

  @test
  fromPrototype() {
    let logs = [];
    let logger = {
      log: (...args) => logs.push(args)
    };
    let app = new Application(__dirname + "/../../../sample-app");
    let module = app.getModules();
    writeFileSync(app.getAppPath("node_modules/service.js"), "");
    writeFileSync(app.getAppPath("node_modules/deployer.js"), "");
    let mstub = sinon.stub(app, "getModules").callsFake(() => {
      return {
        ...module,
        services: { ...module.services, Custom: "./node_modules/service.js" },
        deployers: { ...module.deployers, Custom: "./node_modules/deployer.js" }
      };
    });
    // @ts-ignore
    let resolver = new TypescriptSchemaResolver(app, logger);
    let stub = sinon.stub(resolver.generator, "getSchemaForSymbol").callsFake(() => {
      throw new Error("plopi");
    });
    resolver.fromPrototype(User);
    assert.deepStrictEqual(logs, [
      ["TRACE", "Generate schema dynamically for", "User"],
      ["WARN", "Cannot generate schema for CoreModel", "User", "plopi"]
    ]);
    stub.restore();
    resolver.fromPrototype(Store);
  }
}
