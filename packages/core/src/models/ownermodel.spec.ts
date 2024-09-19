import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import {
  Action,
  Expose,
  HttpContext,
  OwnerModel,
  RESTDomainService,
  Session,
  User,
  WebContext,
  WebdaError
} from "../index";
import { TestApplication, WebdaInternalSimpleTest } from "../test";

@Expose()
class TestTask extends OwnerModel {
  name: string;
  public: boolean;

  @Action({
    methods: ["GET"]
  })
  actionable() {
    return true;
  }

  @Action()
  impossible() {
    process.exit(1);
  }

  async canAct(ctx, action) {
    if ("actionable" === action) {
      return true;
    }
    return super.canAct(ctx, action);
  }
}

@suite
class OwnerModelTest extends WebdaInternalSimpleTest {
  _ctx: WebContext;
  _session: Session;
  _user: User;

  async tweakApp(app: TestApplication): Promise<void> {
    await super.tweakApp(app);
    app.addModel("TestTask", TestTask);
  }

  async before() {
    await super.before();
    this._ctx = await this.webda.newWebContext(new HttpContext("test.webda.io", "GET", "/"));
    this._session = await this._ctx.newSession();
    this._session.login("none", "none");
    // @ts-ignore
    this._ctx.getCurrentUser = async () => {
      return this._user;
    };
    await this.addService(RESTDomainService, {});
  }

  async beforeEach() {
    this._ctx = await this.newContext({});
    await this._ctx.init();
    this._session = this._ctx.getSession();
    await TestTask.create({
      _user: "fake_user",
      uuid: "task_user1",
      name: "for_schema"
    });
    await TestTask.create({
      _user: "fake_user2",
      uuid: "task_user2"
    });
    await TestTask.create({
      _user: "fake_user3",
      uuid: "task_public",
      public: true
    });
    await TestTask.create({
      uuid: "task_no_owner"
    });
  }

  @test("POST - not logged") async postNotLogged() {
    await this.beforeEach();

    const executor = this.getExecutor(this._ctx, "test.webda.io", "POST", "/testTasks", {
      name: "Task #1"
    });
    assert.notStrictEqual(executor, undefined);
    await assert.rejects(
      () => executor.execute(this._ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );
  }

  @test("POST") async post() {
    const executor = this.getExecutor(this._ctx, "test.webda.io", "POST", "/testTasks", {
      name: "Task #1"
    });
    this._session.login("fake_user", "fake_ident");
    await executor.execute(this._ctx);
    const task = JSON.parse(<string>this._ctx.getResponseBody());
    assert.strictEqual(task.name, "Task #1");
  }

  @test("GET - wrong owner") async getWrongOwner() {
    await this.beforeEach();
    this._ctx.getSession().login("fake_user2", "fake_ident");
    const executor = this.getExecutor(this._ctx, "test.webda.io", "GET", "/testTasks/task_no_owner", {});
    await assert.rejects(
      () => executor.execute(this._ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );
  }
  @test("GET - no owner") async getNoOwner() {
    await this.beforeEach();
    this._ctx.getSession().login("fake_user2", "fake_ident");
    const executor = this.getExecutor(this._ctx, "test.webda.io", "GET", "/testTasks/task_user1", {});
    await assert.rejects(
      () => executor.execute(this._ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );
  }
  @test("PUT - wrong owner") async putWrongOwner() {
    await this.beforeEach();
    this._session.login("fake_user2", "fake_ident");
    const executor = this.getExecutor(this._ctx, "test.webda.io", "PUT", "/testTasks/task_user1", {});
    await assert.rejects(
      () => executor.execute(this._ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );
  }
  @test("PUT") async put() {
    await this.beforeEach();
    this._session.login("fake_user", "fake_ident");
    await this.execute(this._ctx, "test.webda.io", "PUT", "/testTasks/task_user1", {
      public: true,
      name: "needed"
    });
    const result = JSON.parse(<string>this._ctx.getResponseBody());
    assert.strictEqual(result.uuid, "task_user1");
    assert.strictEqual(result.public, true);
  }
  @test("GET - public") async getPublic() {
    await this.beforeEach();
    this._session.login("fake_user2", "fake_ident");
    const executor = this.getExecutor(this._ctx, "test.webda.io", "GET", "/testTasks/task_public");
    await executor.execute(this._ctx);
    const result = JSON.parse(<string>this._ctx.getResponseBody());
    assert.strictEqual(result.uuid, "task_public");
  }

  @test("Query") async queryPermission() {
    await this.beforeEach();
    this._session.login("fake_user2", "fake_ident");
    let res = await TestTask.query("", true, this._ctx);
    assert.deepStrictEqual(res.results.map(r => r.getUuid()).sort(), ["task_public", "task_user2"]);
    res = await TestTask.query("");
    assert.deepStrictEqual(res.results.length, 4);
    res = await TestTask.query("uuid = 'task_user1'", true, this._ctx);
    assert.deepStrictEqual(res.results.length, 0);
    res = await TestTask.query("uuid = 'task_public'", true, this._ctx);
    assert.deepStrictEqual(res.results.length, 1);
  }

  @test("Actions") async actions() {
    await this.beforeEach();
    this._session.login("fake_user2", "fake_ident");
    let executor = this.getExecutor(this._ctx, "test.webda.io", "GET", "/testTasks/task_user1/actionable");
    await executor.execute(this._ctx);
    executor = this.getExecutor(this._ctx, "test.webda.io", "PUT", "/testTasks/task_user1/impossible");
    await assert.rejects(() => executor.execute(this._ctx), /No permission/);
  }
  @test("DELETE") async delete() {
    await this.beforeEach();
    this._session.login("fake_user2", "fake_ident");
    const executor = this.getExecutor(this._ctx, "test.webda.io", "DELETE", "/testTasks/task_user2");
    await executor.execute(this._ctx);
  }
  @test("DELETE - wrong owner") async deleteWrongOwner() {
    await this.beforeEach();
    this._session.login("fake_user2", "fake_ident");
    const executor = this.getExecutor(this._ctx, "test.webda.io", "DELETE", "/testTasks/task_user1");
    await assert.rejects(
      () => executor.execute(this._ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );
  }
  @test("DELETE - wrong owner - public") async deleteWrongOwnerPublic() {
    await this.beforeEach();
    this._session.login("fake_user2", "fake_ident");
    const executor = this.getExecutor(this._ctx, "test.webda.io", "DELETE", "/testTasks/task_public");
    await assert.rejects(
      () => executor.execute(this._ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );
  }
  @test("DELETE - unknown") async deleteUnknown() {
    await this.beforeEach();
    this._session.login("fake_user2", "fake_ident");
    const executor = this.getExecutor(this._ctx, "test.webda.io", "DELETE", "/testTasks/task_unknown");
    await assert.rejects(
      () => executor.execute(this._ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 404
    );
  }
}
