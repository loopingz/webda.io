import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  HttpContext,
  OwnerModel,
  RESTDomainService,
  runAsSystem,
  runWithContext,
  Session,
  User,
  WebContext,
  WebdaError
} from "../index";
import { TestApplication } from "../test/objects";
import { WebdaApplicationTest } from "../test/test";
import { WEBDA_ACTIONS } from "@webda/models";

class TestTask extends OwnerModel {
  name: string;
  [WEBDA_ACTIONS]: {
    create: {};
    get: {};
    update: {};
    delete: {};
    actionable: {
      rest: {
        methods: ["GET"];
      };
    };
    impossible: {};
  };

  getOwnerModel() {
    return User;
  }

  actionable() {
    return true;
  }

  impossible() {
    process.exit(1);
  }

  async canAct(action, ctx) {
    if ("actionable" === action) {
      return true;
    }
    return super.canAct(action, ctx);
  }
}

@suite
class OwnerModelTest extends WebdaApplicationTest {
  _ctx: WebContext;
  _session: Session;
  _user: User;

  static async tweakApp(app: TestApplication): Promise<void> {
    await super.tweakApp(app);
    app.addModel("TestTask", TestTask);
  }

  async beforeEach() {
    await super.beforeEach();
    this._ctx = await this.webda.newContext(new HttpContext("test.webda.io", "GET", "/"));
    this._session = await this._ctx.newSession();
    this._session.login("none", "none");
    // @ts-ignore
    this._ctx.getCurrentUser = async () => {
      return this._user;
    };
    await this.addService(RESTDomainService, {});

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
    this._ctx.getSession().login("fake_user2", "fake_ident");
    const executor = this.getExecutor(this._ctx, "test.webda.io", "GET", "/testTasks/task_no_owner", {});
    await assert.rejects(
      () => executor.execute(this._ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );
  }
  @test("GET - no owner") async getNoOwner() {
    this._ctx.getSession().login("fake_user2", "fake_ident");
    const executor = this.getExecutor(this._ctx, "test.webda.io", "GET", "/testTasks/task_user1", {});
    await assert.rejects(
      () => executor.execute(this._ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );
  }
  @test("PUT - wrong owner") async putWrongOwner() {
    this._session.login("fake_user2", "fake_ident");
    const executor = this.getExecutor(this._ctx, "test.webda.io", "PUT", "/testTasks/task_user1", {});
    await assert.rejects(
      () => executor.execute(this._ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );
  }
  @test("PUT") async put() {
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
    this._session.login("fake_user2", "fake_ident");
    const executor = this.getExecutor(this._ctx, "test.webda.io", "GET", "/testTasks/task_public");
    await executor.execute(this._ctx);
    const result = JSON.parse(<string>this._ctx.getResponseBody());
    assert.strictEqual(result.uuid, "task_public");
  }

  @test("Query") async queryPermission() {
    await runWithContext(this._ctx, async () => {
      this._session.login("fake_user2", "fake_ident");
      let res = await TestTask.query("", true);
      assert.deepStrictEqual(res.results.map(r => r.getUuid()).sort(), ["task_public", "task_user2"]);
      await runAsSystem(async () => {
        res = await TestTask.query("");
      });
      assert.deepStrictEqual(res.results.length, 4);
      res = await TestTask.query("uuid = 'task_user1'", true);
      assert.deepStrictEqual(res.results.length, 0);
      res = await TestTask.query("uuid = 'task_public'", true);
      assert.deepStrictEqual(res.results.length, 1);
    });
  }

  @test("Actions") async actions() {
    this._session.login("fake_user2", "fake_ident");
    let executor = this.getExecutor(this._ctx, "test.webda.io", "GET", "/testTasks/task_user1/actionable");
    await executor.execute(this._ctx);
    executor = this.getExecutor(this._ctx, "test.webda.io", "PUT", "/testTasks/task_user1/impossible");
    await assert.rejects(() => executor.execute(this._ctx), /No permission/);
  }
  @test("DELETE") async delete() {
    this._session.login("fake_user2", "fake_ident");
    const executor = this.getExecutor(this._ctx, "test.webda.io", "DELETE", "/testTasks/task_user2");
    await executor.execute(this._ctx);
  }
  @test("DELETE - wrong owner") async deleteWrongOwner() {
    this._session.login("fake_user2", "fake_ident");
    const executor = this.getExecutor(this._ctx, "test.webda.io", "DELETE", "/testTasks/task_user1");
    await assert.rejects(
      () => executor.execute(this._ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );
  }
  @test("DELETE - wrong owner - public") async deleteWrongOwnerPublic() {
    this._session.login("fake_user2", "fake_ident");
    const executor = this.getExecutor(this._ctx, "test.webda.io", "DELETE", "/testTasks/task_public");
    await assert.rejects(
      () => executor.execute(this._ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );
  }
  @test("DELETE - unknown") async deleteUnknown() {
    this._session.login("fake_user2", "fake_ident");
    const executor = this.getExecutor(this._ctx, "test.webda.io", "DELETE", "/testTasks/task_unknown");
    await assert.rejects(
      () => executor.execute(this._ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 404
    );
  }
}
