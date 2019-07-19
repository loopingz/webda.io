import { StoreTest } from "./store.spec";
import { FileStore, CoreModel, Store } from "../index";
import * as assert from "assert";
import { suite, test } from "mocha-typescript";

@suite
class FileStoreTest extends StoreTest {
  getUserStore(): Store<any> {
    return <Store<any>>this.getService("Users");
  }

  getIdentStore(): Store<any> {
    return <Store<any>>this.getService("Idents");
  }

  @test
  async modelActions() {
    let identStore: FileStore<CoreModel> = <FileStore<CoreModel>>(
      this.getService("idents")
    );
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
    executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "PUT",
      "/idents/coucou/plop"
    );
    assert.notEqual(executor, undefined);
    await this.assertThrowsAsync(
      executor.execute.bind(executor, ctx),
      err => err == 404
    );
    await identStore.save({
      uuid: "coucou"
    });
    await executor.execute(ctx);
    // Our fake action is pushing true to _plop
    assert.equal(JSON.parse(ctx.getResponseBody())._plop, true);
    assert.equal(eventFired, 2);
    assert.notEqual(
      this.getExecutor(ctx, "test.webda.io", "POST", "/idents/coucou/yop"),
      null
    );
    assert.notEqual(
      this.getExecutor(ctx, "test.webda.io", "GET", "/idents/coucou/yop"),
      null
    );
  }

  @test
  async modelStaticActions() {
    let identStore: FileStore<CoreModel> = <FileStore<CoreModel>>(
      this.getService("idents")
    );
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
    assert.notEqual(executor, undefined);
    await executor.execute(ctx);
    // Our fake index action is just outputing 'indexer'
    assert.equal(ctx.getResponseBody(), "indexer");
    assert.equal(eventFired, 1);
  }

  @test
  async httpCRUD() {
    let eventFired;
    let userStore = this.getUserStore();
    let ctx, executor;
    await userStore.__clean();
    ctx = await this.newContext({});
    ctx.session.login("fake_user", "fake_ident");
    executor = this.getExecutor(ctx, "test.webda.io", "POST", "/users", {
      type: "CRUD",
      uuid: "PLOP"
    });
    assert.notEqual(executor, undefined);
    await executor.execute(ctx);
    ctx.body = undefined;
    await this.getExecutor(ctx, "test.webda.io", "GET", "/users/PLOP").execute(
      ctx
    );
    assert.notEqual(ctx.getResponseBody(), undefined);
    assert.equal(ctx.getResponseBody().indexOf("_lastUpdate") >= 0, true);
    executor = this.getExecutor(ctx, "test.webda.io", "POST", "/users", {
      type: "CRUD2",
      uuid: "PLOP"
    });
    await this.assertThrowsAsync(
      executor.execute.bind(executor, ctx),
      err => err == 409
    );
    // Verify the none overide of UUID
    executor = this.getExecutor(ctx, "test.webda.io", "PUT", "/users/PLOP", {
      type: "CRUD2",
      additional: "field",
      uuid: "PLOP2",
      user: "fake_user"
    });
    await executor.execute(ctx);
    let user = await userStore.get("PLOP");
    assert.equal(user.uuid, "PLOP");
    assert.equal(user.type, "CRUD2");
    assert.equal(user.additional, "field");
    assert.equal(user.user, "fake_user");
    ctx.resetResponse();
    // Check PATH
    executor = this.getExecutor(ctx, "test.webda.io", "PATCH", "/users/PLOP", {
      type: "CRUD3",
      uuid: "PLOP2",
      _testor: "_ should not be update by client"
    });
    await executor.execute(ctx);
    user = await userStore.get("PLOP");
    assert.equal(user.uuid, "PLOP");
    assert.equal(user.type, "CRUD3");
    assert.equal(user.additional, "field");
    assert.equal(user._testor, undefined);

    executor = this.getExecutor(ctx, "test.webda.io", "PUT", "/users/PLOP", {
      type: "CRUD3",
      uuid: "PLOP2",
      _testor: "_ should not be update by client"
    });
    await executor.execute(ctx);
    user = await userStore.get("PLOP");
    assert.equal(user.uuid, "PLOP");
    assert.equal(user.type, "CRUD3");
    assert.equal(user.additional, undefined);
    assert.equal(user._testor, undefined);

    await this.getExecutor(
      ctx,
      "test.webda.io",
      "DELETE",
      "/users/PLOP"
    ).execute(ctx);
    eventFired = 0;
    executor = this.getExecutor(ctx, "test.webda.io", "GET", "/users/PLOP");
    await this.assertThrowsAsync(
      executor.execute.bind(executor, ctx),
      err => err == 404
    );
    eventFired++;
    executor = this.getExecutor(ctx, "test.webda.io", "DELETE", "/users/PLOP");
    await this.assertThrowsAsync(
      executor.execute.bind(executor, ctx),
      err => err == 404
    );
    eventFired++;
    executor = this.getExecutor(ctx, "test.webda.io", "PUT", "/users/PLOP");
    await this.assertThrowsAsync(
      executor.execute.bind(executor, ctx),
      err => err == 404
    );
    eventFired++;
    assert.equal(eventFired, 3);
  }

  @test
  async getURL() {
    assert.equal(
      (<Store<CoreModel>>this.webda.getService("users")).getUrl(),
      "/users"
    );
  }

  @test("JSON Schema - Create") async schemaCreate() {
    let taskStore = this.webda.getTypedService<Store<CoreModel>>("Tasks");
    let ctx = await this.webda.newContext(undefined);
    let executor = this.getExecutor(ctx, "test.webda.io", "POST", "/tasks", {
      noname: "Task #1"
    });
    assert.notEqual(executor, undefined);
    ctx.getSession().login("fake_user", "fake_ident");
    await this.assertThrowsAsync(
      executor.execute.bind(executor, ctx),
      err => err == 400
    );
    executor = this.getExecutor(ctx, "test.webda.io", "POST", "/tasks", {
      name: "Task #1"
    });
    await executor.execute(ctx);
    let task = JSON.parse(ctx.getResponseBody());
    // It is two because the Saved has been called two
    assert.notEqual(task.uuid, undefined);
    assert.equal(task._autoListener, 2);
    task = await taskStore.get(task.uuid);
    assert.equal(task._autoListener, 1);
  }
}

export { FileStoreTest };
