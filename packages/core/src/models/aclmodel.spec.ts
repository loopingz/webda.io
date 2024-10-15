import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  AclModel,
  Core,
  HttpContext,
  runAsSystem,
  runWithContext,
  Session,
  SimpleUser,
  User,
  WebContext,
  WebdaError
} from "../index";
import { TestApplication } from "../test";
import { getDirtyProxy } from "../utils/dirtyproxy";

@suite
class AclModelTest {
  _ctx: WebContext;
  model: AclModel;
  _webda: Core;
  _session: Session;
  _user: SimpleUser;

  async before() {
    const app = new TestApplication();
    await app.load();
    this._webda = new Core(app);
    await this._webda.init();
    this._ctx = await this._webda.newWebContext(new HttpContext("test.webda.io", "GET", "/"));
    this._session = this._ctx.getSession();
    this._session.login("user-uid", "none");
    this.model = getDirtyProxy(new AclModel());
    this._user = new SimpleUser();
    this._user.setUuid("user-uid");
    this._user.addGroup("gip-123");
    // @ts-ignore
    this._ctx.getCurrentUser = async () => {
      return this._user;
    };
  }

  @test cov() {
    assert.deepStrictEqual(this.model.getGroups(undefined), []);
  }

  @test async get() {
    await assert.rejects(() => this.model.checkAct(this._ctx, "get"));
    this.model.__acl["gip-123"] = "get";
    assert.strictEqual(await this.model.canAct(this._ctx, "get"), true);
  }

  @test async multipermissions() {
    await runWithContext(this._ctx, async () => {
      await assert.rejects(() => this.model.checkAct(this._ctx, "action"));
      this.model.__acl["gip-123"] = "get,action";
      assert.strictEqual(await this.model.canAct(this._ctx, "get"), true);
      assert.strictEqual(await this.model.canAct(this._ctx, "action"), true);
      assert.deepStrictEqual(await this.model.getPermissions(), ["get", "action"]);
      await this.model._onGet();
      assert.deepStrictEqual(this.model["_permissions"], ["get", "action"]);
    });
    await runAsSystem(async () => {
      await this.model._onGet();
      assert.deepStrictEqual(this.model["_permissions"], []);
    });
  }

  @test async multigroups() {
    await assert.rejects(() => this.model.checkAct(this._ctx, "action"));
    this.model.__acl["gip-124"] = "get,action";
    this.model.__acl["gip-123"] = "get";
    this.model.__acl["gip-122"] = "get,action";
    assert.strictEqual(await this.model.canAct(this._ctx, "get"), true);
    await assert.rejects(() => this.model.checkAct(this._ctx, "action"));
    // @ts-ignore
    this._user._groups = undefined;
    await assert.rejects(() => this.model.checkAct(this._ctx, "get"));
  }

  @test async userid() {
    await assert.rejects(() => this.model.checkAct(this._ctx, "action"));
    this.model.__acl["user-uid"] = "get";
    this.model.__acl["gip-122"] = "get,action";
    assert.strictEqual(await this.model.canAct(this._ctx, "get"), true);
    await assert.rejects(() => this.model.checkAct(this._ctx, "action"));
    this._ctx.getCurrentUserId = () => {
      return undefined;
    };
    await assert.rejects(
      () => this.model.checkAct(this._ctx, "get"),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );
    this._ctx.getCurrentUserId = () => {
      return "123";
    };
    this.model.setAcl(undefined);
    await assert.rejects(
      () => this.model.checkAct(this._ctx, "get"),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );
  }

  @test async all() {
    await assert.rejects(() => this.model.checkAct(this._ctx, "action"));
    this.model.__acl["gip-124"] = "get,action";
    this.model.__acl["user-uid"] = "all";
    this.model.__acl["gip-122"] = "get,action";
    assert.strictEqual(await this.model.canAct(this._ctx, "get"), true);
    assert.strictEqual(await this.model.canAct(this._ctx, "action"), true);
    assert.strictEqual(await this.model.canAct(this._ctx, "delete"), true);
    assert.strictEqual(await this.model.canAct(this._ctx, "whatever"), true);
  }

  @test async httpAcls() {
    // @ts-ignore
    this.model.__store = {
      save: async () => this.model,
      patch: async () => this.model,
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
    const actions = AclModel.getActions();
    assert.notStrictEqual(actions.acl, undefined);
    this._ctx.setHttpContext(new HttpContext("test.webda.io", "PUT", "/"));
    this._ctx.getHttpContext().setBody({ acl: "mine" });
    await this.model.acl(this._ctx);
    // @ts-ignore
    assert.strictEqual(this.model.getAcl().acl, "mine");
    this._ctx.reinit();
    this._ctx.getHttpContext().setBody({ raw: { acl: "mine" } });
    await assert.rejects(() => this.model.acl(this._ctx));
    this._ctx.reinit();
    this._ctx.setHttpContext(new HttpContext("test.webda.io", "GET", "/"));
    // Action return their result directly
    await User.ref("acl").create({
      displayName: "Plopi"
    });
    const res = await this.model.acl(this._ctx);
    assert.deepStrictEqual(res, {
      raw: {
        acl: "mine"
      },
      resolved: [
        {
          actor: {
            avatar: undefined,
            displayName: "Plopi",
            email: undefined,
            uuid: "acl"
          },
          permission: "mine"
        }
      ]
    });
  }

  @test async canActCreate() {
    this._ctx.getSession().userId = undefined;
    assert.strictEqual(await this.model.canAct(this._ctx, "create"), "No ACL or user");
    this._ctx.getSession().login("user-uid", "ident-uid");
    assert.strictEqual(await this.model.canAct(this._ctx, "create"), true);
  }

  @test async onSave() {
    runWithContext(this._ctx, async () => {
      await this.model._onSave();
      assert.deepStrictEqual(this.model.__acl, { "user-uid": "all" });
      assert.strictEqual(this.model._creator, "user-uid");
    });
  }
}
