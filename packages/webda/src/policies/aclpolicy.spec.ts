import { suite, test, slow, timeout } from "mocha-typescript";
import * as assert from "assert";
import { CoreModel, User, Core, SecureCookie, AclPolicyMixIn } from "../index";
var config = require("../../test/config.json");
const Utils = require("../../test/utils");

class AclPolicyModel extends AclPolicyMixIn(CoreModel) {}

@suite
class AclPolicyTest {
  _ctx;
  model: AclPolicyModel;
  _webda: Core;
  _session: SecureCookie;
  _user: User;

  before() {
    this._webda = new Core(config);
    this._session = this._webda.getNewSession({});
    this._session.login("user-uid", "none");
    this._ctx = this._webda.newContext({}, this._session);
    this.model = new AclPolicyModel();
    this._user = new User();
    this._user.uuid = "user-uid";
    this._user.addGroup("gip-123");
    this._ctx.getCurrentUser = async () => {
      return this._user;
    };
  }

  @test async get() {
    await Utils.throws(this.model.canAct.bind(this.model, this._ctx, "get"));
    this.model.__acls["gip-123"] = "get";
    assert.equal(await this.model.canAct(this._ctx, "get"), this.model);
  }
  @test async multipermissions() {
    await Utils.throws(this.model.canAct.bind(this.model, this._ctx, "action"));
    this.model.__acls["gip-123"] = "get,action";
    assert.equal(await this.model.canAct(this._ctx, "get"), this.model);
    assert.equal(await this.model.canAct(this._ctx, "action"), this.model);
  }

  @test async multigroups() {
    await Utils.throws(this.model.canAct.bind(this.model, this._ctx, "action"));
    this.model.__acls["gip-124"] = "get,action";
    this.model.__acls["gip-123"] = "get";
    this.model.__acls["gip-122"] = "get,action";
    assert.equal(await this.model.canAct(this._ctx, "get"), this.model);
    await Utils.throws(this.model.canAct.bind(this.model, this._ctx, "action"));
  }

  @test async userid() {
    await Utils.throws(this.model.canAct.bind(this.model, this._ctx, "action"));
    this.model.__acls["gip-124"] = "get,action";
    this.model.__acls["user-uid"] = "get";
    this.model.__acls["gip-122"] = "get,action";
    assert.equal(await this.model.canAct(this._ctx, "get"), this.model);
    await Utils.throws(this.model.canAct.bind(this.model, this._ctx, "action"));
  }

  @test async all() {
    await Utils.throws(this.model.canAct.bind(this.model, this._ctx, "action"));
    this.model.__acls["gip-124"] = "get,action";
    this.model.__acls["user-uid"] = "all";
    this.model.__acls["gip-122"] = "get,action";
    assert.equal(await this.model.canAct(this._ctx, "get"), this.model);
    assert.equal(await this.model.canAct(this._ctx, "action"), this.model);
    assert.equal(await this.model.canAct(this._ctx, "delete"), this.model);
    assert.equal(await this.model.canAct(this._ctx, "whatever"), this.model);
  }
}
