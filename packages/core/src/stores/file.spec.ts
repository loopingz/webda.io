import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { existsSync } from "fs";
import pkg from "fs-extra";
import * as sinon from "sinon";
import { CoreModel, FileStore, FileUtils, ModelMapLoaderImplementation, Store, WebdaError } from "../index";
import { User } from "../models/user";
import { HttpContext } from "../utils/httpcontext";
import AggregatorService from "./aggregator";
import { StoreNotFoundError, UpdateConditionFailError } from "./store";
import { StoreTest } from "./store.spec";
const { removeSync } = pkg;

/**
 * Cast for test user
 */
interface TestUser extends User {
  _testor: any;
  type: string;
  additional: string;
  user: string;
}
@suite
class FileStoreTest extends StoreTest {
  getUserStore(): Store<any> {
    return this.getService<Store<any>>("Users");
  }

  getIdentStore(): Store<any> {
    // Need to slow down the _get
    let store = <Store<any>>this.getService("Idents");
    // @ts-ignore
    let original = store._get.bind(store);
    // @ts-ignore
    store._get = async (...args) => {
      await this.sleep(1);
      return original(...args);
    };
    return store;
  }

  async getIndex(): Promise<CoreModel> {
    return this.getService<Store>("MemoryAggregators").get("idents-index");
  }

  async recreateIndex() {
    let store = this.getService<Store>("MemoryAggregators");
    await store.__clean();
    await this.getService<AggregatorService>("IdentsIndexer").createAggregate();
  }

  @test
  async update(delay: number = 100) {
    // Increase the delay for FileStore
    return super.update(delay);
  }

  @test
  async cov() {
    let identStore: FileStore<CoreModel & { test: number; plops: any[] }> = this.getService<any>("Idents");
    let userStore: FileStore<CoreModel> = this.getService<FileStore<CoreModel>>("Users");
    let user: any = await userStore.save({});
    let ident = await identStore.save({
      _user: user.getUuid()
    });
    identStore.getParameters().strict = true;
    let res = await identStore.get(user.getUuid());
    assert.strictEqual(res, undefined);
    const stub = sinon.stub(identStore, "_get").callsFake(async () => user);
    try {
      res = await identStore.get(user.getUuid());
      assert.strictEqual(res, undefined);
      await assert.rejects(
        () =>
          identStore.update({
            uuid: user.getUuid(),
            plop: true
          }),
        StoreNotFoundError
      );
      await user.refresh();
      assert.strictEqual(user.plop, undefined);
      user.idents[0] = new ModelMapLoaderImplementation(identStore._model, user.idents[0], user);
      userStore["initModel"](user);
      await identStore.delete(user.getUuid());
    } finally {
      stub.restore();
    }

    identStore.incrementAttribute("test", "test", 12);
    // Shoud return directly
    await identStore.incrementAttribute("test", "test", 0);
    removeSync(identStore.getParameters().folder);
    // Should not fail
    await identStore.__clean();
    // Should recreate folder
    identStore.computeParameters();
    existsSync(identStore.getParameters().folder);

    ident = new identStore._model();
    identStore.newModel(ident);
    assert.notStrictEqual(ident.getUuid(), undefined);

    // Test guard-rails (seems hardly reachable so might be useless)
    assert.throws(
      () => identStore.checkCollectionUpdateCondition(ident, "plops", undefined, 1, null),
      UpdateConditionFailError
    );
    // @ts-ignore
    ident.plops = [];
    assert.throws(
      () => identStore.checkCollectionUpdateCondition(ident, "plops", undefined, 1, null),
      UpdateConditionFailError
    );
    identStore.checkCollectionUpdateCondition(ident, "plops", undefined, 0, null);

    assert.rejects(
      () => identStore.simulateUpsertItemToCollection(undefined, <any>"__proto__", undefined, new Date()),
      /Cannot update __proto__: js\/prototype-polluting-assignment/
    );

    // Add a queryMethod test
    userStore.getParameters().url = "/users";
    userStore.getParameters().expose = {
      queryMethod: "PUT",
      restrict: {}
    };
    userStore.initRoutes();
    userStore.getUrl("/url", ["GET"]);
  }

  @test
  async configuration() {
    let identStore: FileStore<CoreModel> = this.getService<FileStore<CoreModel>>("Idents");
    assert.strictEqual(
      identStore.canTriggerConfiguration("plop", () => {}),
      false
    );
    assert.strictEqual(await identStore.getConfiguration("plop"), undefined);
    await identStore.save({ plop: 1, other: true, uuid: "plop" });
    assert.deepStrictEqual(await identStore.getConfiguration("plop"), {
      other: true,
      plop: 1
    });
  }

  @test
  async modelActions() {
    return super.modelActions();
  }

  @test
  async cacheMishit() {
    let identStore: FileStore<CoreModel> = this.getService<FileStore<CoreModel>>("Idents");
    let ident: CoreModel = await identStore.save({ uuid: "test" });
    await identStore._cacheStore.__clean();
    // @ts-ignore
    await ident.patch({ retest: true });
  }

  @test
  async modelStaticActions() {
    let identStore: FileStore<CoreModel> = this.getService<FileStore<CoreModel>>("Idents");
    let ctx, executor;
    let eventFired = 0;
    identStore.on("Store.Action", evt => {
      eventFired++;
    });
    ctx = await this.newContext({
      type: "CRUD",
      uuid: "PLOP"
    });
    executor = this.getExecutor(ctx, "test.webda.io", "GET", "/idents/index");
    assert.notStrictEqual(executor, undefined);
    await executor.execute(ctx);
    // Our fake index action is just outputing 'indexer'
    assert.strictEqual(ctx.getResponseBody(), "indexer");
    assert.strictEqual(eventFired, 1);

    ctx.resetResponse();
    // Return some infos instead of using ctx
    // @ts-ignore
    identStore._model.index = async () => {
      return "vouzouf";
    };
    await executor.execute(ctx);
    // Our fake index action is just outputing 'indexer'
    assert.strictEqual(ctx.getResponseBody(), "vouzouf");
  }

  @test
  async httpCRUD() {
    return await super.httpCRUD();
  }

  @test
  async getURL() {
    //assert.strictEqual((<Store<CoreModel>>this.webda.getService("users")).getUrl(), "/users");
  }

  @test("JSON Schema - Create") async schemaCreate() {
    let taskStore = this.webda.getService<Store<CoreModel>>("Tasks");
    let ctx = await this.webda.newWebContext(new HttpContext("webda.io", "GET", "/"));
    let executor = this.getExecutor(ctx, "test.webda.io", "POST", "/tasks", {
      noname: "Task #1"
    });
    this.webda.getModules().schemas["WebdaTest/Task"] = FileUtils.load("./test/schemas/task.json");

    assert.notStrictEqual(executor, undefined);
    ctx.getSession().login("fake_user", "fake_ident");
    await assert.rejects(executor.execute(ctx), WebdaError.BadRequest, "Should reject for bad schema");
    executor = this.getExecutor(ctx, "test.webda.io", "POST", "/tasks", {
      name: "Task #1"
    });
    await executor.execute(ctx);
    let task = JSON.parse(<string>ctx.getResponseBody());
    // It is two because the Saved has been called two
    assert.notStrictEqual(task.uuid, undefined);
    assert.strictEqual(task._autoListener, 2);
    task = await taskStore.get(task.uuid);
    assert.strictEqual(task._autoListener, 1);

    executor = this.getExecutor(ctx, "test.webda.io", "PUT", `/tasks/${task.uuid}`, {
      test: "plop"
    });
    await assert.rejects(
      () => executor.execute(ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 400
    );
    executor = this.getExecutor(ctx, "test.webda.io", "PATCH", `/tasks/${task.uuid}`, {
      name: 123
    });
    await assert.rejects(
      () => executor.execute(ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 400
    );
  }

  @test
  computeParams() {
    let usersStore: FileStore<any> = <FileStore<any>>this.getUserStore();
    removeSync(usersStore.getParameters().folder);
    usersStore.computeParameters();
    assert.ok(existsSync(usersStore.getParameters().folder));
  }
}

export { FileStoreTest };
