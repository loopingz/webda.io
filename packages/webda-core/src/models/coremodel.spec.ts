import { suite, test } from "mocha-typescript";
import * as assert from "assert";
import { WebdaTest } from "../test";
import { CoreModel } from "..";
const Task = require("../../test/models/task");

@suite
class CoreModelTest extends WebdaTest {
  @test("Verify unsecure loaded") unsecureLoad() {
    let object: any = new CoreModel();
    object.load({
      _test: "plop",
      test: "plop"
    });
    assert.equal(object._test, undefined);
    assert.equal(object.test, "plop");
  }

  @test("Verify secure constructor") secureConstructor() {
    let object: any = new CoreModel();
    object.load(
      {
        _test: "plop",
        test: "plop",
        __serverOnly: "server"
      },
      true
    );
    assert.equal(object._test, "plop");
    assert.equal(object.test, "plop");
    return object;
  }

  @test("Verify JSON export") jsonExport() {
    let object = this.secureConstructor();
    let exported = JSON.parse(JSON.stringify(object));
    assert.equal(exported.__serverOnly, undefined);
    assert.equal(exported._test, "plop");
    assert.equal(exported.test, "plop");
    assert.equal(exported._gotContext, undefined);
  }

  @test("Verify JSON stored export") jsonStoredExport() {
    let object = this.secureConstructor();
    let exported = object.toStoredJSON();
    assert.equal(exported.__serverOnly, "server");
    assert.equal(exported._test, "plop");
    assert.equal(exported.test, "plop");
  }

  @test("Verify JSON stored export - stringify") jsonStoredExportStringify() {
    let object = this.secureConstructor();
    let exported = JSON.parse(object.toStoredJSON(true));
    assert.equal(exported.__serverOnly, "server");
    assert.equal(exported._test, "plop");
    assert.equal(exported.test, "plop");
    assert.equal(exported._gotContext, undefined);
  }

  @test("Verify Context access within output to server") async withContext() {
    let ctx = await this.newContext();
    let task = new Task();
    ctx.write(task);
    let result = JSON.parse(ctx.getResponseBody());
    assert.equal(result._gotContext, true);
  }
}
