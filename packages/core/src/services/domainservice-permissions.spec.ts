import { suite, test } from "@webda/test";
import * as assert from "assert";
import { MemoryRepository, registerRepository, UuidModel } from "@webda/models";
import { WebdaApplicationTest } from "../test/index.js";
import { RESTOperationsTransport, RESTOperationsTransportParameters } from "../rest/restoperationstransport.service.js";
import { Router, RouterParameters } from "../rest/router.service.js";
import { useRouter } from "../rest/hooks.js";
import { WebContext } from "../contexts/webcontext.js";
import { HttpContext, HttpMethodType } from "../contexts/httpcontext.js";
import { runWithContext } from "../contexts/execution.js";
import { SimpleOperationContext } from "../contexts/simplecontext.js";
import { callOperation } from "../core/operations.js";
import { Session } from "../session/session.js";
import { useApplication } from "../application/hooks.js";
import type { Application } from "../application/application.js";
import { OwnerModel } from "../models/ownermodel.model.js";
import { Ace, ResourceAcl } from "../models/aclmodel.js";
import type { IOperationContext } from "../contexts/icontext.js";
import * as WebdaError from "../errors/errors.js";
import { checkModelPermission, mergePermissionQuery } from "../models/permissions.js";

/**
 * OwnerModel subclass exposed through the DomainService
 */
class PermTask extends OwnerModel {
  title: string;
  published?: boolean;

  /**
   * Instance action
   * @returns the action result
   */
  async publish() {
    this.published = true;
    await this.save();
    return { published: true };
  }
}

/**
 * Model without canAct: the framework default allows everything
 */
class OpenNote extends UuidModel {
  text: string;
}

/**
 * Model whose permissions come from a ResourceAcl attribute
 */
class AclDoc extends UuidModel {
  title: string;
  acl: Ace[];

  /**
   * Delegate to the ResourceAcl
   * @param context - the operation context
   * @param action - the action
   * @returns true or a refusal reason
   */
  async canAct(context: IOperationContext, action: string): Promise<string | boolean> {
    return ResourceAcl.from(this.acl ?? []).canAct(context, action);
  }
}

PermTask.registerSerializer();
OpenNote.registerSerializer();
AclDoc.registerSerializer();

/**
 * Minimal metadata for a model registered at runtime
 * @param id - the model identifier
 * @param actions - exposed actions
 * @returns the metadata
 */
function metadata(id: string, actions: Record<string, any> = {}): any {
  return {
    Identifier: id,
    Ancestors: [],
    Subclasses: [],
    Relations: {},
    PrimaryKey: ["uuid"],
    Events: [],
    Schemas: {},
    Actions: actions,
    Import: "",
    Plural: id.split("/").pop() + "s",
    Reflection: {}
  };
}

const USER_A = "user-a";
const USER_B = "user-b";

/**
 * Model permissions (canAct, getPermissionQuery) enforced on every DomainService operation,
 * through the real REST path (Router -> RESTOperationsTransport -> callOperation -> DomainService)
 */
@suite
class DomainServicePermissionsTest extends WebdaApplicationTest {
  getTestConfiguration(): string | undefined {
    return process.cwd() + "/../../sample-app";
  }

  protected async buildWebda() {
    const core = await super.buildWebda();
    core.getBeans = () => {};
    core.registerBeans = () => {};
    const app = useApplication<Application>();
    app.addModel("WebdaDemo/PermTask", PermTask, metadata("WebdaDemo/PermTask", { publish: { method: "PUT" } }));
    app.addModel("WebdaDemo/OpenNote", OpenNote, metadata("WebdaDemo/OpenNote"));
    app.addModel("WebdaDemo/AclDoc", AclDoc, metadata("WebdaDemo/AclDoc"));
    const router = new Router("Router", new RouterParameters().load({}));
    this.registerService(router);
    router.resolve();
    await router.init();
    return core;
  }

  async beforeAll(init: boolean = true) {
    await super.beforeAll(init);
    const transport = new RESTOperationsTransport(
      "PermTransport",
      new RESTOperationsTransportParameters().load({ url: "/perm/", exposeOpenAPI: false })
    );
    this.registerService(transport);
    transport.resolve();
    await transport.init();
  }

  async beforeEach() {
    await super.beforeEach();
    registerRepository(PermTask, new MemoryRepository(PermTask, ["uuid"]));
    registerRepository(OpenNote, new MemoryRepository(OpenNote, ["uuid"]));
    registerRepository(AclDoc, new MemoryRepository(AclDoc, ["uuid"]));
    await PermTask.create({ uuid: "task-a", title: "A private", _user: USER_A } as any);
    await PermTask.create({ uuid: "task-b", title: "B private", _user: USER_B } as any);
    await PermTask.create({ uuid: "task-public", title: "A public", _user: USER_A, public: true } as any);
  }

  /**
   * Run a request through the Router as `user` (undefined for anonymous)
   * @param user - current user id
   * @param method - HTTP method
   * @param url - URL
   * @param body - request body
   * @returns the status code and the parsed body
   */
  async request(
    user: string | undefined,
    method: HttpMethodType,
    url: string,
    body?: any
  ): Promise<{ status: number; body: any }> {
    const httpContext = new HttpContext("test.webda.io", method, url, "http", 80, {});
    if (body !== undefined) {
      httpContext.setBody(body);
    }
    httpContext.setClientIp("127.0.0.1");
    const ctx = new WebContext(httpContext);
    ctx.newSession();
    if (user) {
      ctx.getSession().login(user, user);
    }
    let status = 0;
    await runWithContext(ctx, async () => {
      try {
        await useRouter().execute(ctx);
        status = ctx.statusCode;
      } catch (err) {
        if (err instanceof WebdaError.HttpError) {
          status = err.getResponseCode();
        } else {
          throw err;
        }
      }
    });
    const raw = <string>ctx.getResponseBody();
    let parsed: any = raw;
    try {
      parsed = raw ? JSON.parse(raw) : undefined;
    } catch {
      // keep raw
    }
    return { status, body: parsed };
  }

  /**
   * @param uuid - task uuid
   * @returns the stored task, as plain data
   */
  async stored(uuid: string): Promise<any> {
    try {
      return JSON.parse(JSON.stringify(await PermTask.ref(uuid).get()));
    } catch {
      return undefined;
    }
  }

  @test
  async getIsChecked() {
    assert.strictEqual((await this.request(USER_B, "GET", "/perm/permTasks/task-a")).status, 403);
    assert.strictEqual((await this.request(undefined, "GET", "/perm/permTasks/task-a")).status, 403);
    const own = await this.request(USER_A, "GET", "/perm/permTasks/task-a");
    assert.strictEqual(own.status, 200);
    assert.strictEqual(own.body.title, "A private");
    // Public objects are readable by anyone
    assert.strictEqual((await this.request(USER_B, "GET", "/perm/permTasks/task-public")).status, 200);
    assert.strictEqual((await this.request(undefined, "GET", "/perm/permTasks/task-public")).status, 200);
  }

  @test
  async refusalDoesNotLeakTheModelReason() {
    const res = await this.request(USER_B, "GET", "/perm/permTasks/task-a");
    assert.strictEqual(res.status, 403);
    assert.ok(!JSON.stringify(res.body ?? "").includes("logged"), "the canAct reason is not sent to the client");
  }

  @test
  async updateIsChecked() {
    const before = await this.stored("task-a");
    const put = await this.request(USER_B, "PUT", "/perm/permTasks/task-a", { uuid: "task-a", title: "hacked" });
    assert.strictEqual(put.status, 403);
    const patch = await this.request(USER_B, "PATCH", "/perm/permTasks/task-a", { title: "hacked" });
    assert.strictEqual(patch.status, 403);
    assert.strictEqual((await this.request(undefined, "PATCH", "/perm/permTasks/task-a", { title: "x" })).status, 403);
    assert.deepStrictEqual(await this.stored("task-a"), before, "the refused update/patch did not change the object");

    const ownPut = await this.request(USER_A, "PUT", "/perm/permTasks/task-a", { uuid: "task-a", title: "updated" });
    assert.strictEqual(ownPut.status, 200);
    assert.strictEqual((await this.stored("task-a")).title, "updated", "the owner's update is persisted");
    const ownPatch = await this.request(USER_A, "PATCH", "/perm/permTasks/task-a", { title: "patched" });
    assert.strictEqual(ownPatch.status, 200);
    assert.strictEqual((await this.stored("task-a")).title, "patched");
  }

  @test
  async ownerCannotBeChangedThroughUpdateOrPatch() {
    await this.request(USER_A, "PUT", "/perm/permTasks/task-a", { uuid: "task-a", title: "t1", _user: USER_B });
    assert.strictEqual((await this.stored("task-a"))._user, USER_A);
    await this.request(USER_A, "PATCH", "/perm/permTasks/task-a", { _user: USER_B });
    assert.strictEqual((await this.stored("task-a"))._user, USER_A);
    // B still cannot read it
    assert.strictEqual((await this.request(USER_B, "GET", "/perm/permTasks/task-a")).status, 403);
  }

  @test
  async deleteIsChecked() {
    assert.strictEqual((await this.request(USER_B, "DELETE", "/perm/permTasks/task-a")).status, 403);
    assert.strictEqual((await this.request(undefined, "DELETE", "/perm/permTasks/task-public")).status, 403);
    assert.ok(await this.stored("task-a"), "the object still exists");
    assert.ok(await this.stored("task-public"), "the public object still exists");
    const own = await this.request(USER_A, "DELETE", "/perm/permTasks/task-a");
    assert.ok(own.status < 300, `owner delete status ${own.status}`);
    assert.strictEqual(await this.stored("task-a"), undefined);
  }

  @test
  async actionIsChecked() {
    assert.strictEqual((await this.request(USER_B, "PUT", "/perm/permTasks/task-a/publish", {})).status, 403);
    assert.ok(!(await this.stored("task-a")).published, "the refused action did not run");
    const own = await this.request(USER_A, "PUT", "/perm/permTasks/task-a/publish", {});
    assert.strictEqual(own.status, 200);
    assert.strictEqual((await this.stored("task-a")).published, true);
  }

  @test
  async createSetsTheOwnerFromTheCaller() {
    const res = await this.request(USER_A, "POST", "/perm/permTasks", { title: "mine", _user: USER_B });
    assert.strictEqual(res.status, 200);
    const created = await this.stored(res.body.uuid);
    assert.strictEqual(created._user, USER_A, "the client supplied _user is ignored");
    assert.strictEqual((await this.request(USER_B, "GET", `/perm/permTasks/${res.body.uuid}`)).status, 403);
    assert.strictEqual((await this.request(USER_A, "GET", `/perm/permTasks/${res.body.uuid}`)).status, 200);
  }

  @test
  async anonymousCreateIsRefused() {
    const res = await this.request(undefined, "POST", "/perm/permTasks", { uuid: "anon-task", title: "anon" });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(await this.stored("anon-task"), undefined, "nothing was saved");
    const forged = await this.request(undefined, "POST", "/perm/permTasks", {
      uuid: "anon-forged",
      title: "anon",
      _user: USER_A
    });
    assert.strictEqual(forged.status, 403);
    assert.strictEqual(await this.stored("anon-forged"), undefined);
  }

  @test
  async queryOnlyReturnsReadableObjects() {
    const uuids = async (user: string | undefined, q: string = "") => {
      const res = await this.request(user, "PUT", "/perm/permTasks", { q });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      return res.body.results.map((r: any) => r.uuid).sort();
    };
    assert.deepStrictEqual(await uuids(USER_B), ["task-b", "task-public"]);
    assert.deepStrictEqual(await uuids(USER_A), ["task-a", "task-public"]);
    assert.deepStrictEqual(await uuids(undefined), ["task-public"]);
    // The permission filter keeps its precedence against a user OR
    assert.deepStrictEqual(await uuids(USER_B, "uuid = 'task-a' OR uuid = 'task-b'"), ["task-b"]);
    assert.deepStrictEqual(await uuids(USER_B, "title = 'A private'"), []);
    // The store itself filters with the permission query (pages are not emptied by the post-filter)
    const merged = mergePermissionQuery(
      "uuid = 'task-a' OR uuid = 'task-b'",
      PermTask.getPermissionQuery({ getCurrentUserId: () => USER_B } as any)
    );
    assert.deepStrictEqual(
      (await PermTask.query(merged)).results.map(r => r.uuid),
      ["task-b"]
    );
  }

  @test
  async queryCannotBeInjectedThroughTheUserId() {
    // A user id carrying WebdaQL: it must stay a string value
    const evil = "x' OR _user != 'nobody";
    const res = await this.request(evil, "PUT", "/perm/permTasks", { q: "" });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.results.map((r: any) => r.uuid),
      ["task-public"]
    );
  }

  @test
  async permissionQueryEscapesTheUserId() {
    const ctx = { getCurrentUserId: () => "a' OR 1=1 OR b='" } as any;
    const perm = OwnerModel.getPermissionQuery(ctx);
    assert.ok(perm);
    assert.strictEqual(perm.partial, false);
    assert.ok(!perm.query.includes("a' OR"), perm.query);
    // The query parses and only compares _user with the literal value
    const { QueryValidator } = await import("@webda/ql");
    const validator = new QueryValidator(perm.query);
    assert.strictEqual(validator.eval({ _user: "a' OR 1=1 OR b='", public: false }), true);
    assert.strictEqual(validator.eval({ _user: "a", public: false }), false);
    assert.strictEqual(validator.eval({ _user: "z", public: true }), true);
    // Anonymous: only public objects
    const anon = OwnerModel.getPermissionQuery({ getCurrentUserId: () => undefined } as any);
    assert.strictEqual(new QueryValidator(anon.query).eval({ _user: undefined, public: false }), false);
    assert.strictEqual(new QueryValidator(anon.query).eval({ _user: undefined, public: true }), true);
  }

  @test
  async modelWithoutCanActAllowsEverything() {
    const created = await this.request(undefined, "POST", "/perm/openNotes", { uuid: "n1", text: "hello" });
    assert.strictEqual(created.status, 200);
    assert.strictEqual((await this.request(USER_B, "GET", "/perm/openNotes/n1")).status, 200);
    assert.strictEqual((await this.request(USER_B, "PATCH", "/perm/openNotes/n1", { text: "p" })).status, 200);
    assert.strictEqual(
      (await this.request(undefined, "PUT", "/perm/openNotes/n1", { uuid: "n1", text: "u" })).status,
      200
    );
    const query = await this.request(USER_A, "PUT", "/perm/openNotes", { q: "" });
    assert.deepStrictEqual(
      query.body.results.map((r: any) => r.uuid),
      ["n1"]
    );
    const del = await this.request(USER_A, "DELETE", "/perm/openNotes/n1");
    assert.ok(del.status < 300);
  }

  @test
  async aclThroughTheFrameworkPath() {
    await AclDoc.create({
      uuid: "doc1",
      title: "acl",
      acl: [
        { action: "get", type: "USER", principal: USER_A, allow: true },
        { action: "update", type: "USER", principal: USER_A, allow: true },
        { action: "get", type: "USER", principal: USER_B, allow: false }
      ]
    } as any);
    assert.strictEqual((await this.request(USER_A, "GET", "/perm/aclDocs/doc1")).status, 200);
    assert.strictEqual((await this.request(USER_B, "GET", "/perm/aclDocs/doc1")).status, 403);
    assert.strictEqual((await this.request("user-c", "GET", "/perm/aclDocs/doc1")).status, 403);
    assert.strictEqual((await this.request(undefined, "GET", "/perm/aclDocs/doc1")).status, 403);
    assert.strictEqual((await this.request(USER_A, "PATCH", "/perm/aclDocs/doc1", { title: "t" })).status, 200);
    assert.strictEqual((await this.request(USER_A, "DELETE", "/perm/aclDocs/doc1")).status, 403);
    // Query post-filters with canAct(get)
    const query = await this.request(USER_B, "PUT", "/perm/aclDocs", { q: "" });
    assert.deepStrictEqual(query.body.results, []);
  }

  @test
  async aclGroups() {
    const acl = ResourceAcl.from([
      { action: "get", type: "GROUP", principal: "readers", allow: true },
      { action: "get", type: "GROUP", principal: "banned", allow: false }
    ] as Ace[]);
    const ctx = (userId: string | undefined, groups: string[]) =>
      ({
        getCurrentUserId: () => userId,
        getCurrentUser: async () => (userId ? { getGroups: () => groups } : undefined)
      }) as any;
    assert.strictEqual(await acl.canAct(ctx("u1", ["readers"]), "get"), true);
    assert.notStrictEqual(await acl.canAct(ctx("u1", ["readers", "banned"]), "get"), true);
    assert.notStrictEqual(await acl.canAct(ctx("u1", []), "get"), true);
    assert.notStrictEqual(await acl.canAct(ctx("u1", ["readers"]), "delete"), true);
    assert.notStrictEqual(await acl.canAct(ctx(undefined, []), "get"), true);
    // An ACE without principal matches nobody
    const loose = ResourceAcl.from([{ action: "get", type: "USER", allow: true }] as Ace[]);
    assert.notStrictEqual(await loose.canAct(ctx("u1", []), "get"), true);
  }

  @test
  async checkModelPermissionHelper() {
    const ctx = { getCurrentUserId: () => "u" } as any;
    // No canAct: allowed
    await checkModelPermission({}, ctx, "get");
    await checkModelPermission({ canAct: async () => true }, ctx, "get");
    // Returning the instance itself is the "allowed on this object" convention
    const self: any = { canAct: async () => self };
    await checkModelPermission(self, ctx, "get");
    for (const refusal of [false, "reason", undefined, null, 1, {}]) {
      await assert.rejects(
        () => checkModelPermission({ canAct: async () => refusal }, ctx, "get"),
        (err: any) => err instanceof WebdaError.Forbidden && !String(err.message).includes("reason"),
        `refusal ${JSON.stringify(refusal)}`
      );
    }
  }

  @test
  async otherTransportsGoThroughTheSameChecks() {
    // gRPC and MCP call callOperation with a non-HTTP OperationContext carrying the caller session
    const call = async (user: string, operation: string, input: any) => {
      const ctx = new SimpleOperationContext();
      await ctx.init();
      const session = new Session();
      session.login(user, user);
      ctx.setSession(session);
      ctx.setInput(Buffer.from(JSON.stringify(input)));
      ctx.setParameters(input);
      await callOperation(ctx, operation);
      return ctx.getOutput();
    };
    await assert.rejects(() => call(USER_B, "PermTask.Get", { uuid: "task-a" }), WebdaError.Forbidden);
    await assert.rejects(() => call(USER_B, "PermTask.Delete", { uuid: "task-a" }), WebdaError.Forbidden);
    const own = JSON.parse(<string>await call(USER_A, "PermTask.Get", { uuid: "task-a" }));
    assert.strictEqual(own.uuid, "task-a");
    const query = JSON.parse(<string>await call(USER_B, "PermTasks.Query", { query: "" }));
    assert.deepStrictEqual(query.results.map((r: any) => r.uuid).sort(), ["task-b", "task-public"]);
  }
}
