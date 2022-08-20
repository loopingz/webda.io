import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { Context, CoreModel, HttpContext, Session, Store, User } from "../index";
import { WebdaTest } from "../test";

@suite
class OwnerModelTest extends WebdaTest {
  _ctx: Context;
  _session: Session;
  _user: User;
  _taskStore: Store<CoreModel, any>;
  _userStore: Store<CoreModel, any>;

  async before() {
    await super.before();
    this._ctx = await this.webda.newContext(new HttpContext("test.webda.io", "GET", "/"));
    this._session = await this._ctx.newSession();
    this._session.login("none", "none");
    // @ts-ignore
    this._ctx.getCurrentUser = async () => {
      return this._user;
    };
    this._taskStore = this.webda.getService<Store<CoreModel, any>>("Tasks");
    this._userStore = <Store<CoreModel, any>>this.webda.getService("Users");
    assert.notStrictEqual(this._taskStore, undefined);
    assert.notStrictEqual(this._userStore, undefined);
  }

  async beforeEach() {
    await this._taskStore.__clean();
    await this._userStore.__clean();
    this._ctx = await this.newContext({});
    await this._ctx.init();
    this._session = this._ctx.getSession();
    await this._taskStore.save({
      _user: "fake_user",
      uuid: "task_user1",
      name: "for_schema"
    });
    await this._taskStore.save({
      _user: "fake_user2",
      uuid: "task_user2"
    });
    await this._taskStore.save({
      _user: "fake_user3",
      uuid: "task_public",
      public: true
    });
  }

  @test("POST - not logged") async postNotLogged() {
    await this.beforeEach();
    let executor = this.getExecutor(this._ctx, "test.webda.io", "POST", "/tasks", {
      name: "Task #1"
    });
    assert.notStrictEqual(executor, undefined);
    await assert.rejects(() => executor.execute(this._ctx), /403/);
  }

  @test("POST") async post() {
    let executor = this.getExecutor(this._ctx, "test.webda.io", "POST", "/tasks", {
      name: "Task #1"
    });
    this._session.login("fake_user", "fake_ident");
    await executor.execute(this._ctx);
    let task = JSON.parse(<string>this._ctx.getResponseBody());
    assert.strictEqual(task.name, "Task #1");
  }

  @test("GET - wrong owner") async getWrongOwner() {
    await this.beforeEach();
    this._ctx.getSession().login("fake_user2", "fake_ident");
    let executor = this.getExecutor(this._ctx, "test.webda.io", "GET", "/tasks/task_user1", {});
    await assert.rejects(() => executor.execute(this._ctx), /403/);
  }
  @test("PUT - wrong owner") async putWrongOwner() {
    await this.beforeEach();
    this._session.login("fake_user2", "fake_ident");
    let executor = this.getExecutor(this._ctx, "test.webda.io", "PUT", "/tasks/task_user1", {});
    await assert.rejects(() => executor.execute(this._ctx), /403/);
  }
  @test("PUT") async put() {
    await this.beforeEach();
    this._session.login("fake_user", "fake_ident");
    await this.execute(this._ctx, "test.webda.io", "PUT", "/tasks/task_user1", {
      public: true,
      name: "needed"
    });
    let result = JSON.parse(<string>this._ctx.getResponseBody());
    assert.strictEqual(result.uuid, "task_user1");
    assert.strictEqual(result.public, true);
  }
  @test("GET - public") async getPublic() {
    await this.beforeEach();
    this._session.login("fake_user2", "fake_ident");
    let executor = this.getExecutor(this._ctx, "test.webda.io", "GET", "/tasks/task_public");
    await executor.execute(this._ctx);
    let result = JSON.parse(<string>this._ctx.getResponseBody());
    assert.strictEqual(result.uuid, "task_public");
  }

  @test("Query") async queryPermission() {
    await this.beforeEach();
    this._session.login("fake_user2", "fake_ident");
    let res = await this._taskStore.query("", this._ctx);
    assert.deepStrictEqual(res.results.map(r => r.getUuid()).sort(), ["task_public", "task_user2"]);
    res = await this._taskStore.query("");
    assert.deepStrictEqual(res.results.length, 3);
    res = await this._taskStore.query("uuid = 'task_user1'", this._ctx);
    assert.deepStrictEqual(res.results.length, 0);
    res = await this._taskStore.query("uuid = 'task_public'", this._ctx);
    assert.deepStrictEqual(res.results.length, 1);
  }

  @test("Actions") async actioms() {
    await this.beforeEach();
    this._session.login("fake_user2", "fake_ident");
    let executor = this.getExecutor(this._ctx, "test.webda.io", "GET", "/tasks/task_user1/actionable");
    await executor.execute(this._ctx);
    executor = this.getExecutor(this._ctx, "test.webda.io", "PUT", "/tasks/task_user1/impossible");
    await assert.rejects(() => executor.execute(this._ctx), /403/);
  }
  @test("DELETE") async delete() {
    await this.beforeEach();
    this._session.login("fake_user2", "fake_ident");
    let executor = this.getExecutor(this._ctx, "test.webda.io", "DELETE", "/tasks/task_user2");
    await executor.execute(this._ctx);
  }
  @test("DELETE - wrong owner") async deleteWrongOwner() {
    await this.beforeEach();
    this._session.login("fake_user2", "fake_ident");
    let executor = this.getExecutor(this._ctx, "test.webda.io", "DELETE", "/tasks/task_user1");
    await assert.rejects(() => executor.execute(this._ctx), /403/);
  }
  @test("DELETE - wrong owner - public") async deleteWrongOwnerPublic() {
    await this.beforeEach();
    this._session.login("fake_user2", "fake_ident");
    let executor = this.getExecutor(this._ctx, "test.webda.io", "DELETE", "/tasks/task_public");
    await assert.rejects(() => executor.execute(this._ctx), /403/);
  }
  @test("DELETE - unknown") async deleteUnknown() {
    await this.beforeEach();
    this._session.login("fake_user2", "fake_ident");
    let executor = this.getExecutor(this._ctx, "test.webda.io", "DELETE", "/tasks/task_unknown");
    await assert.rejects(() => executor.execute(this._ctx), /404/);
  }
}
