import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { Core, HttpContext, RoleModel, SecureCookie, User } from "../index";
import { TestApplication } from "../test";

class RolePolicyModel extends RoleModel {
  getRolesMap() {
    return {
      get: "member",
      update: "member",
      delete: "admin"
    };
  }
}

class RolePolicyModelPermissive extends RoleModel {
  getRolesMap() {
    return {
      get: "member",
      create: "member"
    };
  }

  isPermissive() {
    return true;
  }
}

@suite
class RolePolicyTest {
  _ctx;
  nonPermissive: RoleModel;
  permissive: RoleModel;
  _webda: Core;
  _session: SecureCookie;
  _user: User;

  async before() {
    let app = new TestApplication(__dirname + "/../../test/config.json");
    await app.load();
    this._webda = new Core(app);
    this._ctx = await this._webda.newContext(new HttpContext("test.webda.io", "GET", "/"));
    this._session = this._ctx.newSession();
    this._session.login("none", "none");
    this._ctx.getCurrentUser = async () => {
      return this._user;
    };
    this.nonPermissive = new RolePolicyModel();
    this.permissive = new RolePolicyModelPermissive();
    this._user = new User();
    this._user.addRole("member");
  }

  @test async noLogged() {
    this._ctx.getSession().logout();
    assert.rejects(() => this.permissive.canAct(this._ctx, "get"), /403/g);
  }
  @test async get() {
    assert.strictEqual(await this.permissive.canAct(this._ctx, "get"), this.permissive);
    assert.strictEqual(await this.nonPermissive.canAct(this._ctx, "get"), this.nonPermissive);
  }
  @test async action() {
    assert.strictEqual(await this.permissive.canAct(this._ctx, "action"), this.permissive);
    await assert.rejects(this.nonPermissive.canAct.bind(this.nonPermissive, this._ctx, "action"));
  }

  @test async delete() {
    assert.strictEqual(await this.permissive.canAct(this._ctx, "delete"), this.permissive);
    await assert.rejects(this.nonPermissive.canAct.bind(this.nonPermissive, this._ctx, "delete"));
    this._user.addRole("admin");
    this._session.roles = undefined;
    assert.strictEqual(await this.nonPermissive.canAct(this._ctx, "delete"), this.nonPermissive);
  }
}
