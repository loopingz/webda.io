import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { WebdaTest } from "../test";
import { CoreModel } from "..";
import * as sinon from "sinon";
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

  @test async cov() {
    let task = new Task();
    await assert.rejects(() => new CoreModel().canAct(undefined, "test"), /403/);
    assert.ok(!task.isAttached());
    const unattachedMsg = /No store linked to this object/;
    await assert.rejects(() => task.refresh(), unattachedMsg);
    await assert.rejects(() => task.save(), unattachedMsg);
    await assert.rejects(() => task.delete(), unattachedMsg);
    await assert.rejects(() => task.update({ change: false }), unattachedMsg);
    assert.throws(() => task.getService("ResourceService"), unattachedMsg);
    let store = {
      getService: this.webda.getService.bind(this.webda),
      delete: () => {},
      patch: () => {}
    };
    // @ts-ignore
    task.attach(store);
    assert.ok(task.isAttached());
    assert.strictEqual(task.getStore(), store);
    assert.notStrictEqual(task.generateUid(), undefined);
    let stub = sinon.stub(Task, "getUuidField").callsFake(() => "bouzouf");
    let deleteSpy = sinon.spy(store, "delete");
    let updateSpy = sinon.stub(store, "patch").callsFake(() => ({ plop: "bouzouf" }));
    try {
      task.setUuid("test");
      assert.strictEqual(task.getUuid(), "test");
      assert.strictEqual(task.bouzouf, "test");
      await task.delete();
      assert.strictEqual(deleteSpy.callCount, 1);
      await task.update({ plop: "bouzouf" });
      assert.strictEqual(updateSpy.callCount, 1);
      assert.strictEqual(task.plop, "bouzouf");
    } finally {
      stub.restore();
      deleteSpy.restore();
    }
    assert.strictEqual(this.getService("ResourceService"), task.getService("ResourceService"));
  }

  @test async refresh() {
    let task = new Task();
    task.__store = {
      get: () => undefined
    };
    await task.refresh();
    task.__store = {
      get: () => ({ plop: "bouzouf" })
    };
    await task.refresh();
    assert.strictEqual(task.plop, "bouzouf");
  }
}
