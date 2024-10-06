import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { Core, HttpContext, RoleModel, Session, SimpleUser, WebContext, WebdaError } from "../index";
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
  _ctx: WebContext;
  nonPermissive: RoleModel;
  permissive: RoleModel;
  _webda: Core;
  _session: Session;
  _user: SimpleUser;

  async before() {
    const app = new TestApplication({
      parameters: {
        ignoreBeans: true
      }
    });
    await app.load();
    this._webda = new Core(app);
    await this._webda.init();
    this._ctx = await this._webda.newWebContext(new HttpContext("test.webda.io", "GET", "/"));
    this._session = await this._ctx.newSession();
    this._session.login("none", "none");
    // @ts-ignore
    this._ctx.getCurrentUser = async () => {
      return this._user;
    };
    this.nonPermissive = new RolePolicyModel();
    this.permissive = new RolePolicyModelPermissive();
    this._user = new SimpleUser();
    this._user.addRole("member");
  }

  @test async noLogged() {
    this._ctx.getSession().logout();
    assert.rejects(
      () => this.permissive.checkAct(this._ctx, "get"),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );
  }
  @test async get() {
    assert.strictEqual(await this.permissive.canAct(this._ctx, "get"), true);
    assert.strictEqual(await this.nonPermissive.canAct(this._ctx, "get"), true);
  }
  @test async action() {
    assert.strictEqual(await this.permissive.canAct(this._ctx, "action"), true);
    await assert.rejects(() => this.nonPermissive.checkAct(this._ctx, "action"), WebdaError.Forbidden);
  }

  @test async delete() {
    assert.strictEqual(await this.permissive.canAct(this._ctx, "delete"), true);
    await assert.rejects(() => this.nonPermissive.checkAct(this._ctx, "delete"));
    this._user.addRole("admin");
    this._session.roles = undefined;
    assert.strictEqual(await this.nonPermissive.canAct(this._ctx, "delete"), true);
  }
}
