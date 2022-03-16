import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { AclModel, Core, CoreModel, HttpContext, SecureCookie, User, Context } from "../index";
import { TestApplication } from "../test";

@suite
class AclPolicyTest {
  _ctx: Context;
  model: AclModel;
  _webda: Core;
  _session: SecureCookie;
  _user: User;

  async before() {
    let app = new TestApplication(__dirname + "/../../test/config.json");
    await app.loadModules();
    this._webda = new Core(app);
    this._ctx = await this._webda.newContext(new HttpContext("test.webda.io", "GET", "/"));
    this._session = this._ctx.getSession();
    this._session.login("user-uid", "none");
    this.model = new AclModel();
    this._user = new User();
    this._user.uuid = "user-uid";
    this._user.addGroup("gip-123");
    // @ts-ignore
    this._ctx.getCurrentUser = async () => {
      return this._user;
    };
  }

  @test async get() {
    await assert.rejects(this.model.canAct.bind(this.model, this._ctx, "get"));
    this.model.__acl["gip-123"] = "get";
    assert.strictEqual(await this.model.canAct(this._ctx, "get"), this.model);
  }
  @test async multipermissions() {
    await assert.rejects(this.model.canAct.bind(this.model, this._ctx, "action"));
    this.model.__acl["gip-123"] = "get,action";
    assert.strictEqual(await this.model.canAct(this._ctx, "get"), this.model);
    assert.strictEqual(await this.model.canAct(this._ctx, "action"), this.model);
    assert.deepStrictEqual(await this.model.getPermissions(this._ctx), ["get", "action"]);
    await this.model._onGet();
    // @ts-ignore
    assert.deepStrictEqual(this.model._permissions, []);
    this.model.setContext(this._ctx);
    await this.model._onGet();
    // @ts-ignore
    assert.deepStrictEqual(this.model._permissions, ["get", "action"]);
  }

  @test async multigroups() {
    await assert.rejects(this.model.canAct.bind(this.model, this._ctx, "action"));
    this.model.__acl["gip-124"] = "get,action";
    this.model.__acl["gip-123"] = "get";
    this.model.__acl["gip-122"] = "get,action";
    assert.strictEqual(await this.model.canAct(this._ctx, "get"), this.model);
    await assert.rejects(this.model.canAct.bind(this.model, this._ctx, "action"));
    // @ts-ignore
    this._user._groups = undefined;
    await assert.rejects(this.model.canAct.bind(this.model, this._ctx, "get"));
  }

  @test async userid() {
    await assert.rejects(this.model.canAct.bind(this.model, this._ctx, "action"));
    this.model.__acl["user-uid"] = "get";
    this.model.__acl["gip-122"] = "get,action";
    assert.strictEqual(await this.model.canAct(this._ctx, "get"), this.model);
    await assert.rejects(this.model.canAct.bind(this.model, this._ctx, "action"));
    this._ctx.getCurrentUserId = () => {
      return undefined;
    };
    await assert.rejects(this.model.canAct.bind(this.model, this._ctx, "get"), /403/);
    this._ctx.getCurrentUserId = () => {
      return "123";
    };
    this.model.setAcl(undefined);
    await assert.rejects(this.model.canAct.bind(this.model, this._ctx, "get"), /403/);
  }

  @test async all() {
    await assert.rejects(this.model.canAct.bind(this.model, this._ctx, "action"));
    this.model.__acl["gip-124"] = "get,action";
    this.model.__acl["user-uid"] = "all";
    this.model.__acl["gip-122"] = "get,action";
    assert.strictEqual(await this.model.canAct(this._ctx, "get"), this.model);
    assert.strictEqual(await this.model.canAct(this._ctx, "action"), this.model);
    assert.strictEqual(await this.model.canAct(this._ctx, "delete"), this.model);
    assert.strictEqual(await this.model.canAct(this._ctx, "whatever"), this.model);
  }

  @test async httpAcls() {
    // @ts-ignore
    this.model.__store = {
      save: async () => this.model,
      // @ts-ignore
      getService: () => {
        return {
          get: async () => {
            return {
              toPublicEntry: () => {
                return {
                  displayName: "Plopi"
                };
              }
            };
          }
        };
      }
    };
    let actions = AclModel.getActions();
    assert.notStrictEqual(actions.acl, undefined);
    this._ctx.setHttpContext(new HttpContext("test.webda.io", "PUT", "/", undefined, undefined, { acl: "mine" }));
    await this.model._acl(this._ctx);
    // @ts-ignore
    assert.strictEqual(this.model.getAcl().acl, "mine");
    this._ctx.setHttpContext(
      new HttpContext("test.webda.io", "PUT", "/", undefined, undefined, { raw: { acl: "mine" } })
    );
    await assert.rejects(() => this.model._acl(this._ctx));
    this._ctx.setHttpContext(new HttpContext("test.webda.io", "GET", "/", undefined, undefined, { acl: "mine" }));
    await this.model._acl(this._ctx);
    assert.deepStrictEqual(JSON.parse(this._ctx.getResponseBody()), {
      raw: {
        acl: "mine"
      },
      resolved: [
        {
          actor: {
            displayName: "Plopi"
          },
          permission: "mine"
        }
      ]
    });
  }

  @test async onSave() {
    this.model.setContext(this._ctx);
    await this.model._onSave();
    assert.deepStrictEqual(this.model.__acl, { "user-uid": "all" });
    assert.strictEqual(this.model._creator, "user-uid");
  }
}
