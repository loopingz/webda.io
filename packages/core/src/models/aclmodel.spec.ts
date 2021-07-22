import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { AclModel, Application, Core, CoreModel, HttpContext, SecureCookie, User } from "../index";

@suite
class AclPolicyTest {
  _ctx;
  model: AclModel;
  _webda: Core;
  _session: SecureCookie;
  _user: User;

  async before() {
    this._webda = new Core(new Application(__dirname + "/../../test/config.json"));
    this._ctx = await this._webda.newContext(new HttpContext("test.webda.io", "GET", "/"));
    this._session = this._ctx.getSession();
    this._session.login("user-uid", "none");
    this.model = new AclModel();
    this._user = new User();
    this._user.uuid = "user-uid";
    this._user.addGroup("gip-123");
    this._ctx.getCurrentUser = async () => {
      return this._user;
    };
  }

  @test async get() {
    await assert.rejects(this.model.canAct.bind(this.model, this._ctx, "get"));
    this.model.__acls["gip-123"] = "get";
    assert.strictEqual(await this.model.canAct(this._ctx, "get"), this.model);
  }
  @test async multipermissions() {
    await assert.rejects(this.model.canAct.bind(this.model, this._ctx, "action"));
    this.model.__acls["gip-123"] = "get,action";
    assert.strictEqual(await this.model.canAct(this._ctx, "get"), this.model);
    assert.strictEqual(await this.model.canAct(this._ctx, "action"), this.model);
  }

  @test async multigroups() {
    await assert.rejects(this.model.canAct.bind(this.model, this._ctx, "action"));
    this.model.__acls["gip-124"] = "get,action";
    this.model.__acls["gip-123"] = "get";
    this.model.__acls["gip-122"] = "get,action";
    assert.strictEqual(await this.model.canAct(this._ctx, "get"), this.model);
    await assert.rejects(this.model.canAct.bind(this.model, this._ctx, "action"));
  }

  @test async userid() {
    await assert.rejects(this.model.canAct.bind(this.model, this._ctx, "action"));
    this.model.__acls["user-uid"] = "get";
    this.model.__acls["gip-122"] = "get,action";
    assert.strictEqual(await this.model.canAct(this._ctx, "get"), this.model);
    await assert.rejects(this.model.canAct.bind(this.model, this._ctx, "action"));
  }

  @test async all() {
    await assert.rejects(this.model.canAct.bind(this.model, this._ctx, "action"));
    this.model.__acls["gip-124"] = "get,action";
    this.model.__acls["user-uid"] = "all";
    this.model.__acls["gip-122"] = "get,action";
    assert.strictEqual(await this.model.canAct(this._ctx, "get"), this.model);
    assert.strictEqual(await this.model.canAct(this._ctx, "action"), this.model);
    assert.strictEqual(await this.model.canAct(this._ctx, "delete"), this.model);
    assert.strictEqual(await this.model.canAct(this._ctx, "whatever"), this.model);
  }
}
