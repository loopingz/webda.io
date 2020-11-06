import { suite, test } from "@testdeck/mocha";
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
    assert.strictEqual(object._test, undefined);
    assert.strictEqual(object.test, "plop");
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
    assert.strictEqual(object._test, "plop");
    assert.strictEqual(object.test, "plop");
    return object;
  }

  @test("Verify JSON export") jsonExport() {
    let object = this.secureConstructor();
    let exported = JSON.parse(JSON.stringify(object));
    assert.strictEqual(exported.__serverOnly, undefined);
    assert.strictEqual(exported._test, "plop");
    assert.strictEqual(exported.test, "plop");
    assert.strictEqual(exported._gotContext, undefined);
  }

  @test("Verify JSON stored export") jsonStoredExport() {
    let object = this.secureConstructor();
    let exported = object.toStoredJSON();
    assert.strictEqual(exported.__serverOnly, "server");
    assert.strictEqual(exported._test, "plop");
    assert.strictEqual(exported.test, "plop");
  }

  @test("Verify JSON stored export - stringify") jsonStoredExportStringify() {
    let object = this.secureConstructor();
    let exported = JSON.parse(object.toStoredJSON(true));
    assert.strictEqual(exported.__serverOnly, "server");
    assert.strictEqual(exported._test, "plop");
    assert.strictEqual(exported.test, "plop");
    assert.strictEqual(exported._gotContext, undefined);
  }

  @test("Verify Context access within output to server") async withContext() {
    let ctx = await this.newContext();
    let task = new Task();
    task.setContext(ctx);
    ctx.write(task);
    let result = JSON.parse(ctx.getResponseBody());
    assert.strictEqual(result._gotContext, true);
  }
}
