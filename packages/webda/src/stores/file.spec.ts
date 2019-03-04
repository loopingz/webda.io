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
    ctx = this.webda.newContext({
      type: "CRUD",
      uuid: "PLOP"
    });
    executor = this.webda.getExecutor(
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
      this.webda.getExecutor(
        ctx,
        "test.webda.io",
        "POST",
        "/idents/coucou/yop"
      ),
      null
    );
    assert.notEqual(
      this.webda.getExecutor(ctx, "test.webda.io", "GET", "/idents/coucou/yop"),
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
    ctx = this.webda.newContext({
      type: "CRUD",
      uuid: "PLOP"
    });
    executor = this.webda.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      "/idents/index"
    );
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
    ctx = this.webda.newContext({
      type: "CRUD",
      uuid: "PLOP"
    });
    ctx.session.login("fake_user", "fake_ident");
    executor = this.webda.getExecutor(ctx, "test.webda.io", "POST", "/users");
    assert.notEqual(executor, undefined);
    await executor.execute(ctx);
    ctx.body = undefined;
    await this.webda
      .getExecutor(ctx, "test.webda.io", "GET", "/users/PLOP")
      .execute(ctx);
    assert.notEqual(ctx.getResponseBody(), undefined);
    assert.equal(ctx.getResponseBody().indexOf("_lastUpdate") >= 0, true);
    ctx.body = {
      type: "CRUD2",
      uuid: "PLOP"
    };
    executor = this.webda.getExecutor(ctx, "test.webda.io", "POST", "/users");
    await this.assertThrowsAsync(
      executor.execute.bind(executor, ctx),
      err => err == 409
    );
    // Verify the none overide of UUID
    ctx.body = {
      type: "CRUD2",
      additional: "field",
      uuid: "PLOP2",
      user: "fake_user"
    };
    executor = this.webda.getExecutor(
      ctx,
      "test.webda.io",
      "PUT",
      "/users/PLOP"
    );
    await executor.execute(ctx);
    let user = await userStore.get("PLOP");
    assert.equal(user.uuid, "PLOP");
    assert.equal(user.type, "CRUD2");
    assert.equal(user.additional, "field");
    assert.equal(user.user, "fake_user");
    ctx.resetResponse();
    // Check PATH
    ctx.body = {
      type: "CRUD3",
      uuid: "PLOP2",
      _testor: "_ should not be update by client"
    };
    executor = this.webda.getExecutor(
      ctx,
      "test.webda.io",
      "PATCH",
      "/users/PLOP"
    );
    await executor.execute(ctx);
    user = await userStore.get("PLOP");
    assert.equal(user.uuid, "PLOP");
    assert.equal(user.type, "CRUD3");
    assert.equal(user.additional, "field");
    assert.equal(user._testor, undefined);

    executor = this.webda.getExecutor(
      ctx,
      "test.webda.io",
      "PUT",
      "/users/PLOP"
    );
    await executor.execute(ctx);
    user = await userStore.get("PLOP");
    assert.equal(user.uuid, "PLOP");
    assert.equal(user.type, "CRUD3");
    assert.equal(user.additional, undefined);
    assert.equal(user._testor, undefined);

    await this.webda
      .getExecutor(ctx, "test.webda.io", "DELETE", "/users/PLOP")
      .execute(ctx);
    eventFired = 0;
    executor = this.webda.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      "/users/PLOP"
    );
    await this.assertThrowsAsync(
      executor.execute.bind(executor, ctx),
      err => err == 404
    );
    eventFired++;
    executor = this.webda.getExecutor(
      ctx,
      "test.webda.io",
      "DELETE",
      "/users/PLOP"
    );
    await this.assertThrowsAsync(
      executor.execute.bind(executor, ctx),
      err => err == 404
    );
    eventFired++;
    executor = this.webda.getExecutor(
      ctx,
      "test.webda.io",
      "PUT",
      "/users/PLOP"
    );
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
}

export { FileStoreTest };
