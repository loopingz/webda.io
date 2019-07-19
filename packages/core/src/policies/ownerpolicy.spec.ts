import { suite, test } from "mocha-typescript";
import * as assert from "assert";
import {
  CoreModel,
  User,
  Core,
  SecureCookie,
  HttpContext,
  Store
} from "../index";
import { WebdaTest } from "../test";
var config = require("../../test/config.json");
const Utils = require("../../test/utils");

@suite
class OwnerPolicyTest extends WebdaTest {
  _ctx;
  _session: SecureCookie;
  _user: User;
  _taskStore: Store<CoreModel>;
  _userStore: Store<CoreModel>;

  async before() {
    await super.before();
    this._ctx = await this.webda.newContext(
      new HttpContext("test.webda.io", "GET", "/")
    );
    this._session = this._ctx.newSession();
    this._session.login("none", "none");
    this._ctx.getCurrentUser = async () => {
      return this._user;
    };
    this._taskStore = <Store<CoreModel>>this.webda.getService("Tasks");
    this._userStore = <Store<CoreModel>>this.webda.getService("Users");
    assert.notEqual(this._taskStore, undefined);
    assert.notEqual(this._userStore, undefined);
  }

  async beforeEach() {
    await this._taskStore.__clean();
    await this._userStore.__clean();
    this._ctx = await this.newContext({});
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
    let executor = this.getExecutor(
      this._ctx,
      "test.webda.io",
      "POST",
      "/tasks",
      {
        name: "Task #1"
      }
    );
    assert.notEqual(executor, undefined);
    await Utils.throws(
      executor.execute.bind(executor, this._ctx),
      res => res == 403
    );
  }

  @test("POST") async post() {
    let executor = this.getExecutor(
      this._ctx,
      "test.webda.io",
      "POST",
      "/tasks",
      {
        name: "Task #1"
      }
    );
    this._ctx.session.login("fake_user", "fake_ident");
    await executor.execute(this._ctx);
    let task = JSON.parse(this._ctx.getResponseBody());
    assert.equal(task.name, "Task #1");
  }

  @test("GET - wrong owner") async getWrongOwner() {
    await this.beforeEach();
    this._ctx.getSession().login("fake_user2", "fake_ident");
    let executor = this.getExecutor(
      this._ctx,
      "test.webda.io",
      "GET",
      "/tasks/task_user1",
      {}
    );
    await Utils.throws(
      executor.execute.bind(executor, this._ctx),
      res => res == 403
    );
  }
  @test("PUT - wrong owner") async putWrongOwner() {
    await this.beforeEach();
    this._ctx.session.login("fake_user2", "fake_ident");
    let executor = this.getExecutor(
      this._ctx,
      "test.webda.io",
      "PUT",
      "/tasks/task_user1",
      {}
    );
    await Utils.throws(
      executor.execute.bind(executor, this._ctx),
      res => res == 403
    );
  }
  @test("PUT") async put() {
    await this.beforeEach();
    this._ctx.session.login("fake_user", "fake_ident");
    let executor = this.getExecutor(
      this._ctx,
      "test.webda.io",
      "PUT",
      "/tasks/task_user1",
      { public: true }
    );
    await executor.execute(this._ctx);
    let result = JSON.parse(this._ctx.getResponseBody());
    assert.equal(result.uuid, "task_user1");
    assert.equal(result.public, true);
  }
  @test("GET - public") async getPublic() {
    await this.beforeEach();
    this._ctx.session.login("fake_user2", "fake_ident");
    let executor = this.getExecutor(
      this._ctx,
      "test.webda.io",
      "GET",
      "/tasks/task_public"
    );
    await executor.execute(this._ctx);
    let result = JSON.parse(this._ctx.getResponseBody());
    assert.equal(result.uuid, "task_public");
  }
  @test("Actions") async actioms() {
    await this.beforeEach();
    this._ctx.session.login("fake_user2", "fake_ident");
    let executor = this.getExecutor(
      this._ctx,
      "test.webda.io",
      "GET",
      "/tasks/task_user1/actionable"
    );
    await executor.execute(this._ctx);
    executor = this.getExecutor(
      this._ctx,
      "test.webda.io",
      "PUT",
      "/tasks/task_user1/impossible"
    );
    await Utils.throws(
      executor.execute.bind(executor, this._ctx),
      res => res == 403
    );
  }
  @test("DELETE") async delete() {
    await this.beforeEach();
    this._ctx.session.login("fake_user2", "fake_ident");
    let executor = this.getExecutor(
      this._ctx,
      "test.webda.io",
      "DELETE",
      "/tasks/task_user2"
    );
    await executor.execute(this._ctx);
  }
  @test("DELETE - wrong owner") async deleteWrongOwner() {
    await this.beforeEach();
    this._ctx.session.login("fake_user2", "fake_ident");
    let executor = this.getExecutor(
      this._ctx,
      "test.webda.io",
      "DELETE",
      "/tasks/task_user1"
    );
    await Utils.throws(
      executor.execute.bind(executor, this._ctx),
      res => res == 403
    );
  }
  @test("DELETE - wrong owner - public") async deleteWrongOwnerPublic() {
    await this.beforeEach();
    this._ctx.session.login("fake_user2", "fake_ident");
    let executor = this.getExecutor(
      this._ctx,
      "test.webda.io",
      "DELETE",
      "/tasks/task_public"
    );
    await Utils.throws(
      executor.execute.bind(executor, this._ctx),
      res => res == 403
    );
  }
  @test("DELETE - unknown") async deleteUnknown() {
    await this.beforeEach();
    this._ctx.session.login("fake_user2", "fake_ident");
    let executor = this.getExecutor(
      this._ctx,
      "test.webda.io",
      "DELETE",
      "/tasks/task_unknown"
    );
    await Utils.throws(
      executor.execute.bind(executor, this._ctx),
      res => res == 404
    );
  }
}
