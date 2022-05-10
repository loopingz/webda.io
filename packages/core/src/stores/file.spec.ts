import { PermissionModel, StoreTest } from "./store.spec";
import { FileStore, CoreModel, Store, FileUtils } from "../index";
import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { HttpContext } from "../utils/context";
import { removeSync } from "fs-extra";
import { existsSync } from "fs";
import { StoreNotFoundError, UpdateConditionFailError } from "./store";
import * as sinon from "sinon";
import AggregatorService from "./aggregator";
import { User } from "../models/user";

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
    let original = store._get.bind(store);
    store._get = async (...args) => {
      await this.sleep(1);
      return original(...args);
    };
    return store;
  }

  async getIndex(): Promise<CoreModel> {
    return this.getService<Store>("memoryaggregators").get("idents-index");
  }

  async recreateIndex() {
    let store = this.getService<Store>("memoryaggregators");
    await store.__clean();
    await this.getService<AggregatorService>("identsindexer").createAggregate();
  }

  @test
  async cov() {
    let identStore: FileStore<CoreModel> = this.getService<FileStore<CoreModel>>("idents");
    let userStore: FileStore<CoreModel> = this.getService<FileStore<CoreModel>>("users");
    let user = await userStore.save({});
    let ident = await identStore.save({
      _user: user.getUuid()
    });
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
      await identStore.delete(user.getUuid());
    } finally {
      stub.restore();
    }

    // Shoud return directly
    await identStore.incrementAttribute("test", "test", 0);
    removeSync(identStore.getParameters().folder);
    // Should not fail
    await identStore.__clean();
    // Should recreate folder
    identStore.computeParameters();
    existsSync(identStore.getParameters().folder);

    ident = new identStore._model();
    identStore.initModel(ident);
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
      () => identStore.simulateUpsertItemToCollection(undefined, "__proto__", undefined, new Date()),
      /Cannot update __proto__: js\/prototype-polluting-assignment/
    );
  }

  @test
  async configuration() {
    let identStore: FileStore<CoreModel> = this.getService<FileStore<CoreModel>>("idents");
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
    let identStore: FileStore<CoreModel> = this.getService<FileStore<CoreModel>>("idents");
    assert.notStrictEqual(identStore.getModel(), undefined);
    let eventFired = 0;
    let executor, ctx;
    identStore.on("Store.Action", evt => {
      eventFired++;
    });
    identStore.on("Store.Actioned", evt => {
      eventFired++;
    });
    ctx = await this.newContext({
      type: "CRUD",
      uuid: "PLOP"
    });
    executor = this.getExecutor(ctx, "test.webda.io", "PUT", "/idents/coucou/plop");
    assert.notStrictEqual(executor, undefined);
    await assert.rejects(executor.execute(ctx), err => err == 404);
    await identStore.save({
      uuid: "coucou"
    });
    await executor.execute(ctx);
    // Our fake action is pushing true to _plop
    assert.strictEqual(JSON.parse(ctx.getResponseBody())._plop, true);
    assert.strictEqual(eventFired, 2);
    assert.notStrictEqual(this.getExecutor(ctx, "test.webda.io", "POST", "/idents/coucou/yop"), null);
    executor = this.getExecutor(ctx, "test.webda.io", "GET", "/idents/coucou/yop");
    assert.notStrictEqual(executor, null);

    // Test with action returning the result instead of writing it
    ctx.resetResponse();
    await executor.execute(ctx);
    assert.strictEqual(ctx.getResponseBody(), "youpi");
  }

  @test
  async cacheMishit() {
    let identStore: FileStore<CoreModel> = this.getService<FileStore<CoreModel>>("idents");
    let ident = await identStore.save({ uuid: "test" });
    await identStore._cacheStore.__clean();
    await ident.update({ retest: true }, false, true);
  }

  @test
  async modelStaticActions() {
    let identStore: FileStore<CoreModel> = this.getService<FileStore<CoreModel>>("idents");
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
    identStore._model._index = async () => {
      return "vouzouf";
    };
    await executor.execute(ctx);
    // Our fake index action is just outputing 'indexer'
    assert.strictEqual(ctx.getResponseBody(), "vouzouf");
  }

  @test
  async httpCRUD() {
    let eventFired;
    let userStore: Store<TestUser> = this.getUserStore();
    let ctx, executor;
    await userStore.__clean();
    ctx = await this.newContext({});
    ctx.session.login("fake_user", "fake_ident");
    executor = this.getExecutor(ctx, "test.webda.io", "POST", "/users", {
      type: "CRUD",
      uuid: "PLOP"
    });
    assert.notStrictEqual(executor, undefined);
    await executor.execute(ctx);
    ctx.body = undefined;
    assert.strictEqual((await userStore.getAll()).length, 1);
    await this.getExecutor(ctx, "test.webda.io", "GET", "/users/PLOP").execute(ctx);
    assert.notStrictEqual(ctx.getResponseBody(), undefined);
    assert.strictEqual(ctx.getResponseBody().indexOf("_lastUpdate") >= 0, true);
    executor = this.getExecutor(ctx, "test.webda.io", "POST", "/users", {
      type: "CRUD2",
      uuid: "PLOP"
    });
    await assert.rejects(executor.execute(ctx), err => err == 409);
    // Verify the none overide of UUID
    await this.execute(ctx, "test.webda.io", "PUT", "/users/PLOP", {
      type: "CRUD2",
      additional: "field",
      uuid: "PLOP2",
      user: "fake_user"
    });
    let user = await userStore.get("PLOP");
    assert.strictEqual(user.uuid, "PLOP");
    assert.strictEqual(user.type, "CRUD2");
    assert.strictEqual(user.additional, "field");
    assert.strictEqual(user.user, "fake_user");
    assert.strictEqual(user._user, "fake_user");

    // Add a role to the user
    user.addRole("plop");
    await user.save();

    user = await userStore.get("PLOP");
    assert.deepStrictEqual(user.getRoles(), ["plop"]);

    ctx.resetResponse();
    // Check PATH
    await this.execute(ctx, "test.webda.io", "PATCH", "/users/PLOP", {
      type: "CRUD3",
      uuid: "PLOP2",
      _testor: "_ should not be update by client"
    });
    user = await userStore.get("PLOP");
    assert.strictEqual(user.uuid, "PLOP");
    assert.strictEqual(user.type, "CRUD3");
    assert.strictEqual(user.additional, "field");
    assert.strictEqual(user._testor, undefined);
    assert.strictEqual(user._user, "fake_user");
    assert.deepStrictEqual(user.getRoles(), ["plop"]);

    executor = this.getExecutor(ctx, "test.webda.io", "PUT", "/users/PLOP", {
      type: "CRUD3",
      uuid: "PLOP2",
      _testor: "_ should not be update by client"
    });
    await executor.execute(ctx);
    user = await userStore.get("PLOP");
    assert.strictEqual(user.uuid, "PLOP");
    assert.strictEqual(user.type, "CRUD3");
    assert.strictEqual(user.additional, undefined);
    assert.strictEqual(user._testor, undefined);
    assert.deepStrictEqual(user.getRoles(), ["plop"]);

    await this.getExecutor(ctx, "test.webda.io", "DELETE", "/users/PLOP").execute(ctx);
    eventFired = 0;
    executor = this.getExecutor(ctx, "test.webda.io", "GET", "/users/PLOP");
    await assert.rejects(
      () => executor.execute(ctx),
      err => err == 404
    );
    eventFired++;
    executor = this.getExecutor(ctx, "test.webda.io", "DELETE", "/users/PLOP");
    await assert.rejects(
      () => executor.execute(ctx),
      err => err == 404
    );
    eventFired++;
    executor = this.getExecutor(ctx, "test.webda.io", "PUT", "/users/PLOP");
    await assert.rejects(
      () => executor.execute(ctx),
      err => err == 404
    );
    eventFired++;
    assert.strictEqual(eventFired, 3);
  }

  @test
  async getURL() {
    assert.strictEqual((<Store<CoreModel>>this.webda.getService("users")).getUrl(), "/users");
  }

  @test("JSON Schema - Create") async schemaCreate() {
    let taskStore = this.webda.getService<Store<CoreModel>>("Tasks");
    let ctx = await this.webda.newContext(new HttpContext("webda.io", "GET", "/"));
    let executor = this.getExecutor(ctx, "test.webda.io", "POST", "/tasks", {
      noname: "Task #1"
    });
    this.webda.getModules().schemas["webdatest/task"] = FileUtils.load("./test/schemas/task.json");

    assert.notStrictEqual(executor, undefined);
    ctx.getSession().login("fake_user", "fake_ident");
    await assert.rejects(executor.execute(ctx), err => err == 400, "Should reject for bad schema");
    executor = this.getExecutor(ctx, "test.webda.io", "POST", "/tasks", {
      name: "Task #1"
    });
    await executor.execute(ctx);
    let task = JSON.parse(ctx.getResponseBody());
    // It is two because the Saved has been called two
    assert.notStrictEqual(task.uuid, undefined);
    assert.strictEqual(task._autoListener, 2);
    task = await taskStore.get(task.uuid);
    assert.strictEqual(task._autoListener, 1);

    executor = this.getExecutor(ctx, "test.webda.io", "PUT", `/tasks/${task.uuid}`, {
      test: "plop"
    });
    await assert.rejects(() => executor.execute(ctx), /400/);
    executor = this.getExecutor(ctx, "test.webda.io", "PATCH", `/tasks/${task.uuid}`, {
      name: 123
    });
    await assert.rejects(() => executor.execute(ctx), /400/);
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
