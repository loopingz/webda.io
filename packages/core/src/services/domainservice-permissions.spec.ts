import { suite, test } from "@webda/test";
import * as assert from "assert";
import { MemoryRepository, Model, registerRepository, UuidModel, WEBDA_PRIMARY_KEY } from "@webda/models";
import { QueryValidator } from "@webda/ql";
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
import { useDynamicService } from "../core/hooks.js";
import type { Application } from "../application/application.js";
import { OwnerModel } from "../models/ownermodel.model.js";
import { Ace, ResourceAcl } from "../models/aclmodel.js";
import type { IOperationContext } from "../contexts/icontext.js";
import * as WebdaError from "../errors/errors.js";
import {
  checkModelPermission,
  checkStaticModelPermission,
  mergePermissionQuery,
  queryModelWithPermissions,
  sealContinuationToken,
  unsealContinuationToken,
  MAX_REFILL_PAGES
} from "../models/permissions.js";
import { useCrypto } from "./cryptoservice.service.js";
import { DomainService, DomainServiceParameters } from "./domainservice.service.js";
import * as sinon from "sinon";
import { SimpleUser } from "../models/simpleuser.model.js";
import { sanitizeModelInput } from "./domainservice.service.js";

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
 * Model without any canAct: the framework denies every request on it
 */
class OpenNote extends UuidModel {
  text: string;
}

/**
 * The explicit opt-in: a model open to everyone
 */
class PublicNote extends UuidModel {
  text: string;

  static canAct(): boolean {
    return true;
  }
}

/**
 * Model controlled by the static form only: logged-in callers may act on objects, user "admin" may run the static
 * action; every call is recorded with the object it received
 */
class Report extends UuidModel {
  title: string;
  static calls: { action: string; object: any }[] = [];

  static canAct(context: IOperationContext, action: string, object?: Report): boolean | string {
    Report.calls.push({ action, object });
    if (object === undefined) {
      return context.getCurrentUserId() === "admin" ? true : "admin only";
    }
    return context.getCurrentUserId() ? true : "login required";
  }

  /**
   * Static action: `PUT /reports/rebuild`
   * @returns the action result
   */
  static async rebuild() {
    return { rebuilt: true };
  }
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

/**
 * Child of PermTask (nested under /permTasks/{pid}/permSubTasks): any logged-in caller, the framework checks the
 * parent
 */
class PermSubTask extends UuidModel {
  task: string;
  label: string;

  static canAct(context: IOperationContext): boolean | string {
    return context.getCurrentUserId() ? true : "login required";
  }
}

/**
 * A user model exposed through the DomainService: self-only canAct, `_roles`/`_groups` attributes
 */
class PermUser extends SimpleUser {}

/**
 * Natural-key model (slug): the client chooses the key; only its owner can read it
 */
class Slugged extends Model {
  [WEBDA_PRIMARY_KEY] = ["slug"] as const;
  slug: string;
  owner: string;
  text: string;

  static getProtectedAttributes(): string[] {
    return ["owner"];
  }

  prepareCreate(context: IOperationContext): void {
    this.owner = context.getCurrentUserId();
  }

  async canAct(context: IOperationContext): Promise<string | boolean> {
    return !!context.getCurrentUserId() && context.getCurrentUserId() === this.owner;
  }
}

/**
 * Repository paging like Postgres or Firestore: the token is `offset + limit`, counted over the matching rows
 */
class OffsetRepository extends MemoryRepository<any> {
  /** @override */
  async query(q: string): Promise<any> {
    const validator = new QueryValidator(q);
    const all: any[] = [];
    for (const key of (this as any).storage.keys()) {
      const item = await this.get(key);
      if (validator.eval(item)) all.push(item);
    }
    all.sort((a, b) => (a.uuid < b.uuid ? -1 : 1));
    const offset = parseInt(validator.getOffset() || "0");
    const limit = validator.getLimit();
    const results = all.slice(offset, offset + limit);
    return { results, continuationToken: results.length >= limit ? `${offset + limit}` : undefined };
  }
}

Slugged.registerSerializer();
PublicNote.registerSerializer();
Report.registerSerializer();
PermSubTask.registerSerializer();
PermUser.registerSerializer();
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
    app.addModel("WebdaDemo/PublicNote", PublicNote, metadata("WebdaDemo/PublicNote"));
    app.addModel(
      "WebdaDemo/Report",
      Report,
      metadata("WebdaDemo/Report", { rebuild: { global: true, method: "PUT" } })
    );
    app.addModel("WebdaDemo/AclDoc", AclDoc, metadata("WebdaDemo/AclDoc"));
    app.addModel("WebdaDemo/PermSubTask", PermSubTask, {
      ...metadata("WebdaDemo/PermSubTask"),
      Relations: { parent: { attribute: "task", model: "WebdaDemo/PermTask" } }
    });
    app.addModel("WebdaDemo/PermUser", PermUser, metadata("WebdaDemo/PermUser"));
    app.addModel("WebdaDemo/Slugged", Slugged, {
      ...metadata("WebdaDemo/Slugged"),
      PrimaryKey: ["slug"],
      Plural: "Slugged"
    });
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
    registerRepository(PublicNote, new MemoryRepository(PublicNote, ["uuid"]));
    registerRepository(Report, new MemoryRepository(Report, ["uuid"]));
    Report.calls = [];
    registerRepository(AclDoc, new MemoryRepository(AclDoc, ["uuid"]));
    registerRepository(PermSubTask, new MemoryRepository(PermSubTask, ["uuid"]));
    registerRepository(Slugged as any, new MemoryRepository(Slugged as any, ["slug"]) as any);
    registerRepository(PermUser as any, new MemoryRepository(PermUser as any, ["uuid"]) as any);
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
    assert.strictEqual((await this.request(USER_B, "GET", "/perm/permTasks/task-a")).status, 404);
    assert.strictEqual((await this.request(undefined, "GET", "/perm/permTasks/task-a")).status, 404);
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
    assert.strictEqual(res.status, 404);
    assert.ok(!JSON.stringify(res.body ?? "").includes("logged"), "the canAct reason is not sent to the client");
  }

  @test
  async updateIsChecked() {
    const before = await this.stored("task-a");
    const put = await this.request(USER_B, "PUT", "/perm/permTasks/task-a", { uuid: "task-a", title: "hacked" });
    assert.strictEqual(put.status, 404);
    const patch = await this.request(USER_B, "PATCH", "/perm/permTasks/task-a", { title: "hacked" });
    assert.strictEqual(patch.status, 404);
    assert.strictEqual((await this.request(undefined, "PATCH", "/perm/permTasks/task-a", { title: "x" })).status, 404);
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
    assert.strictEqual((await this.request(USER_B, "GET", "/perm/permTasks/task-a")).status, 404);
  }

  @test
  async deleteIsChecked() {
    assert.strictEqual((await this.request(USER_B, "DELETE", "/perm/permTasks/task-a")).status, 404);
    assert.strictEqual((await this.request(undefined, "DELETE", "/perm/permTasks/task-public")).status, 403);
    assert.ok(await this.stored("task-a"), "the object still exists");
    assert.ok(await this.stored("task-public"), "the public object still exists");
    const own = await this.request(USER_A, "DELETE", "/perm/permTasks/task-a");
    assert.ok(own.status < 300, `owner delete status ${own.status}`);
    assert.strictEqual(await this.stored("task-a"), undefined);
  }

  @test
  async actionIsChecked() {
    assert.strictEqual((await this.request(USER_B, "PUT", "/perm/permTasks/task-a/publish", {})).status, 404);
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
    assert.strictEqual((await this.request(USER_B, "GET", `/perm/permTasks/${res.body.uuid}`)).status, 404);
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
  async modelsDenyByDefault() {
    // OpenNote defines neither the static nor the instance canAct: refused everywhere
    await OpenNote.create({ uuid: "n1", text: "server side" } as any);
    assert.strictEqual((await this.request(USER_A, "POST", "/perm/openNotes", { text: "hello" })).status, 403);
    assert.strictEqual((await OpenNote.query("")).results.length, 1, "nothing created");
    for (const user of [USER_A, undefined]) {
      assert.strictEqual((await this.request(user, "GET", "/perm/openNotes/n1")).status, 404);
      assert.strictEqual((await this.request(user, "PATCH", "/perm/openNotes/n1", { text: "p" })).status, 404);
      assert.strictEqual((await this.request(user, "PUT", "/perm/openNotes/n1", { text: "u" })).status, 404);
      assert.strictEqual((await this.request(user, "DELETE", "/perm/openNotes/n1")).status, 404);
      const query = await this.request(user, "PUT", "/perm/openNotes", { q: "" });
      assert.strictEqual(query.status, 200);
      assert.deepStrictEqual(query.body.results, []);
    }
    assert.strictEqual((await OpenNote.ref("n1").get()).text, "server side", "nothing changed");
  }

  @test
  async explicitOptInAllowsEverything() {
    // `static canAct() { return true; }` is the opt-in
    const created = await this.request(undefined, "POST", "/perm/publicNotes", { text: "hello" });
    assert.strictEqual(created.status, 200);
    const n1 = created.body.uuid;
    assert.strictEqual((await this.request(USER_B, "GET", `/perm/publicNotes/${n1}`)).status, 200);
    assert.strictEqual((await this.request(USER_B, "PATCH", `/perm/publicNotes/${n1}`, { text: "p" })).status, 200);
    assert.strictEqual((await this.request(undefined, "PUT", `/perm/publicNotes/${n1}`, { text: "u" })).status, 200);
    const query = await this.request(USER_A, "PUT", "/perm/publicNotes", { q: "" });
    assert.deepStrictEqual(
      query.body.results.map((r: any) => r.uuid),
      [n1]
    );
    // The response carries the results and the token only: no store internals
    assert.deepStrictEqual(Object.keys(query.body), ["results"]);
    const del = await this.request(USER_A, "DELETE", `/perm/publicNotes/${n1}`);
    assert.ok(del.status < 300);
  }

  @test
  async staticCanActGatesStaticActions() {
    assert.strictEqual((await this.request(undefined, "PUT", "/perm/reports/rebuild", {})).status, 403);
    assert.strictEqual((await this.request(USER_A, "PUT", "/perm/reports/rebuild", {})).status, 403);
    const admin = await this.request("admin", "PUT", "/perm/reports/rebuild", {});
    assert.strictEqual(admin.status, 200);
    assert.deepStrictEqual(admin.body, { rebuilt: true });
    // The static action was asked without an object
    const statics = Report.calls.filter(c => c.action === "rebuild");
    assert.strictEqual(statics.length, 3);
    assert.ok(statics.every(c => c.object === undefined));
  }

  @test
  async staticCanActReceivesTheObjectOfEachOperation() {
    // Create: the new, unsaved object
    const created = await this.request(USER_A, "POST", "/perm/reports", { title: "t1" });
    assert.strictEqual(created.status, 200);
    const create = Report.calls.find(c => c.action === "create");
    assert.ok(create.object instanceof Report);
    assert.strictEqual(create.object.title, "t1");
    assert.strictEqual((await this.request(undefined, "POST", "/perm/reports", { title: "anon" })).status, 403);
    // Get, update, patch, delete, query rows: the loaded object
    const uuid = created.body.uuid;
    Report.calls = [];
    assert.strictEqual((await this.request(USER_B, "GET", `/perm/reports/${uuid}`)).status, 200);
    assert.strictEqual((await this.request(USER_B, "PATCH", `/perm/reports/${uuid}`, { title: "t2" })).status, 200);
    assert.strictEqual((await this.request(USER_B, "PUT", `/perm/reports/${uuid}`, { uuid, title: "t3" })).status, 200);
    const query = await this.request(USER_B, "PUT", "/perm/reports", { q: "" });
    assert.deepStrictEqual(
      query.body.results.map((r: any) => r.uuid),
      [uuid]
    );
    assert.strictEqual((await this.request(USER_B, "DELETE", `/perm/reports/${uuid}`)).status, 204);
    for (const action of ["get", "update", "delete"]) {
      const calls = Report.calls.filter(c => c.action === action);
      assert.ok(calls.length >= 1, action);
      assert.ok(
        calls.every(c => c.object instanceof Report && c.object.uuid === uuid),
        `${action} received the loaded object`
      );
    }
    // Anonymous: the static form refuses the object, so it looks missing
    await Report.create({ uuid: "r2", title: "x" } as any);
    assert.strictEqual((await this.request(undefined, "GET", "/perm/reports/r2")).status, 404);
    assert.deepStrictEqual((await this.request(undefined, "PUT", "/perm/reports", { q: "" })).body.results, []);
  }

  @test
  async staticOverrideKeepsTheInstanceCheckThroughSuper() {
    /**
     * Static actions for the owner of the "admin" id, objects through the inherited OwnerModel instance check
     */
    class GatedTask extends PermTask {
      static canAct(context: IOperationContext, action: string, object?: GatedTask) {
        if (object === undefined) {
          return context.getCurrentUserId() === "admin";
        }
        return super.canAct(context, action, object);
      }
    }
    const ctxA: any = { getCurrentUserId: () => USER_A };
    const ctxAdmin: any = { getCurrentUserId: () => "admin" };
    const mine = new GatedTask();
    mine.setOwner(USER_A as any);
    await checkModelPermission(mine, ctxA, "get", GatedTask);
    await assert.rejects(() => checkModelPermission(mine, ctxAdmin, "get", GatedTask), WebdaError.NotFound);
    await assert.rejects(() => checkStaticModelPermission(GatedTask, ctxA, "stats"), WebdaError.Forbidden);
    await checkStaticModelPermission(GatedTask, ctxAdmin, "stats");
    // The parent class (instance form only) refuses every static action
    await assert.rejects(() => checkStaticModelPermission(PermTask, ctxAdmin, "stats"), WebdaError.Forbidden);
  }

  @test
  async startupWarnsForExposedModelsWithoutCanAct() {
    const service = new DomainService("PermWarnService", new DomainServiceParameters().load({}));
    const spy = sinon.spy(service, "log");
    const { useInstanceStorage } = await import("../core/instancestorage.js");
    const operations = useInstanceStorage().operations;
    const snapshot = { ...operations };
    const services = useInstanceStorage().core.getServices();
    services["PermWarnService"] = service;
    try {
      service.initOperations();
    } finally {
      spy.restore();
      delete services["PermWarnService"];
      for (const id of Object.keys(operations)) delete operations[id];
      Object.assign(operations, snapshot);
    }
    const warnings = spy
      .getCalls()
      .filter(c => c.args[0] === "WARN")
      .map(c => c.args.slice(1).join(" "));
    assert.ok(
      warnings.some(w => w.includes("WebdaDemo/OpenNote") && w.includes("static canAct")),
      JSON.stringify(warnings)
    );
    for (const covered of ["WebdaDemo/PermTask", "WebdaDemo/PublicNote", "WebdaDemo/Report", "WebdaDemo/AclDoc"]) {
      assert.ok(!warnings.some(w => w.includes(covered)), covered);
    }
  }

  @test
  async queryInputMustBeAString() {
    for (const q of [{ a: 1 }, 5, true, ["uuid = 'x'"]]) {
      const res = await this.request(USER_A, "PUT", "/perm/publicNotes", { q });
      assert.strictEqual(res.status, 400, JSON.stringify(q));
    }
    assert.strictEqual((await this.request(USER_A, "PUT", "/perm/publicNotes", {})).status, 200);
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
    assert.strictEqual((await this.request(USER_B, "GET", "/perm/aclDocs/doc1")).status, 404);
    assert.strictEqual((await this.request("user-c", "GET", "/perm/aclDocs/doc1")).status, 404);
    assert.strictEqual((await this.request(undefined, "GET", "/perm/aclDocs/doc1")).status, 404);
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
    // No canAct at all: denied, and unreadable looks missing
    await assert.rejects(() => checkModelPermission({}, ctx, "get"), WebdaError.NotFound);
    await assert.rejects(() => checkModelPermission(new OpenNote(), ctx, "get", OpenNote), WebdaError.NotFound);
    await checkModelPermission({ canAct: async () => true }, ctx, "get");
    // The static form wins when the class defines it
    await checkModelPermission(new PublicNote(), ctx, "get", PublicNote);
    await checkModelPermission(new PublicNote(), ctx, "get");
    // Returning the instance itself is no longer an allowance
    const self: any = { canAct: async () => self };
    await assert.rejects(() => checkModelPermission(self, ctx, "get"), WebdaError.NotFound);
    for (const refusal of [false, "reason", undefined, null, 1, {}]) {
      // Not readable: looks missing, whatever the action
      for (const action of ["get", "update", "delete", "publish"]) {
        await assert.rejects(
          () => checkModelPermission({ canAct: async () => refusal }, ctx, action),
          (err: any) => err instanceof WebdaError.NotFound && err.message === "Object not found",
          `refusal ${JSON.stringify(refusal)} on ${action}`
        );
      }
      // Readable but refused: Forbidden, without the model reason
      await assert.rejects(
        () => checkModelPermission({ canAct: async (_c, a) => a === "get" || refusal }, ctx, "update"),
        (err: any) => err instanceof WebdaError.Forbidden && !String(err.message).includes("reason"),
        `refusal ${JSON.stringify(refusal)}`
      );
      // Create: the object does not exist yet
      await assert.rejects(
        () => checkModelPermission({ canAct: async () => refusal }, ctx, "create"),
        WebdaError.Forbidden
      );
    }
    // A 403 thrown by canAct (RoleModel without user) is a refusal too
    await assert.rejects(
      () =>
        checkModelPermission(
          {
            canAct: async () => {
              throw new WebdaError.Forbidden("No user");
            }
          },
          ctx,
          "update"
        ),
      WebdaError.NotFound
    );
    // Static actions: a refusal is a 403 (there is no object to hide)
    await assert.rejects(() => checkStaticModelPermission(OpenNote, ctx, "rebuild"), WebdaError.Forbidden);
    await checkStaticModelPermission(PublicNote, ctx, "rebuild");
  }

  @test
  async refusedReadsLookLikeMissingObjects() {
    // Every operation of B on A's private object answers exactly like a missing key
    const same = async (method: HttpMethodType, suffix: string, body?: any) => {
      const refused = await this.request(USER_B, method, `/perm/permTasks/task-a${suffix}`, body);
      const missing = await this.request(USER_B, method, `/perm/permTasks/no-such-task${suffix}`, body);
      assert.strictEqual(refused.status, 404, `${method} ${suffix}`);
      assert.deepStrictEqual(refused, missing, `${method} ${suffix}`);
    };
    await same("GET", "");
    await same("PUT", "", { title: "x" });
    await same("PATCH", "", { title: "x" });
    await same("DELETE", "");
    await same("PUT", "/publish", {});
    // Nested create under a parent the caller cannot read
    const refused = await this.request(USER_B, "POST", "/perm/permTasks/task-a/permSubTasks", { label: "x" });
    const missing = await this.request(USER_B, "POST", "/perm/permTasks/no-such-task/permSubTasks", { label: "x" });
    assert.strictEqual(refused.status, 404);
    assert.deepStrictEqual(refused, missing);
    // Both emit Store.WebNotFound
    const seen: string[] = [];
    const service: any = useDynamicService("DomainService");
    const listener = (evt: any) => seen.push(evt.uuid);
    service.on("Store.WebNotFound", listener);
    try {
      await this.request(USER_B, "GET", "/perm/permTasks/task-a");
      await this.request(USER_B, "GET", "/perm/permTasks/no-such-task");
    } finally {
      service.removeListener?.("Store.WebNotFound", listener);
    }
    assert.deepStrictEqual(seen, ["task-a", "no-such-task"]);
  }

  @test
  async readableButRefusedIsForbidden() {
    // B can read A's public task, not change it
    assert.strictEqual((await this.request(USER_B, "GET", "/perm/permTasks/task-public")).status, 200);
    assert.strictEqual(
      (await this.request(USER_B, "PATCH", "/perm/permTasks/task-public", { title: "x" })).status,
      403
    );
    assert.strictEqual(
      (await this.request(USER_B, "PUT", "/perm/permTasks/task-public", { uuid: "task-public", title: "x" })).status,
      403
    );
    assert.strictEqual((await this.request(USER_B, "DELETE", "/perm/permTasks/task-public")).status, 403);
    assert.strictEqual((await this.request(USER_B, "PUT", "/perm/permTasks/task-public/publish", {})).status, 403);
    assert.strictEqual((await this.stored("task-public")).title, "A public");
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
    await assert.rejects(() => call(USER_B, "PermTask.Get", { uuid: "task-a" }), WebdaError.NotFound);
    await assert.rejects(() => call(USER_B, "PermTask.Delete", { uuid: "task-a" }), WebdaError.NotFound);
    const own = JSON.parse(<string>await call(USER_A, "PermTask.Get", { uuid: "task-a" }));
    assert.strictEqual(own.uuid, "task-a");
    const query = JSON.parse(<string>await call(USER_B, "PermTasks.Query", { query: "" }));
    assert.deepStrictEqual(query.results.map((r: any) => r.uuid).sort(), ["task-b", "task-public"]);
  }

  // ---- Round 2 ----

  @test
  async createOverAnExistingKeyIsAConflict() {
    // Natural keys are chosen by the client: an existing key is a 409, never an overwrite
    assert.strictEqual((await this.request(USER_A, "POST", "/perm/slugged", { slug: "a-1", text: "A" })).status, 200);
    assert.strictEqual((await this.request(USER_B, "POST", "/perm/slugged", { slug: "b-1", text: "B" })).status, 200);
    const before = JSON.stringify(await Slugged.ref("a-1").get());
    const takeover = await this.request(USER_B, "POST", "/perm/slugged", { slug: "a-1", text: "pwned" });
    assert.strictEqual(takeover.status, 409);
    assert.strictEqual(JSON.stringify(await Slugged.ref("a-1").get()), before, "the existing object is unchanged");
    // The conflict on an unreadable key looks exactly like the one on a readable key
    const readable = await this.request(USER_B, "POST", "/perm/slugged", { slug: "b-1", text: "again" });
    assert.deepStrictEqual(takeover, readable);
  }

  @test
  async uuidModelsIgnoreTheClientUuid() {
    // A client uuid is ignored on create: no overwrite, and no existence oracle through a 409
    const before = await this.stored("task-a");
    const res = await this.request(USER_B, "POST", "/perm/permTasks", { uuid: "task-a", title: "pwned" });
    assert.strictEqual(res.status, 200);
    assert.notStrictEqual(res.body.uuid, "task-a");
    assert.deepStrictEqual(await this.stored("task-a"), before);
    const fresh = await this.request(USER_B, "POST", "/perm/permTasks", { uuid: "no-such-task", title: "x" });
    assert.strictEqual(fresh.status, 200);
    assert.notStrictEqual(fresh.body.uuid, "no-such-task");
    assert.strictEqual(await this.stored("no-such-task"), undefined);
  }

  @test
  async privateFieldsCannotBeQueried() {
    await OpenNote.create({ uuid: "sn1", text: "t", __secret: "hunter2", inner: { __h: "abcdef" } } as any);
    for (const q of [
      "__secret = 'hunter2'",
      "__secret LIKE 'hun%'",
      "inner.__h LIKE 'abc%'",
      "text = 't' OR (uuid = 'x' AND inner.__h = 'abcdef')",
      "text = 't' ORDER BY __secret DESC"
    ]) {
      const res = await this.request(USER_B, "PUT", "/perm/openNotes", { q });
      assert.strictEqual(res.status, 400, q);
      // The post-filtered path too
      assert.strictEqual((await this.request(USER_B, "PUT", "/perm/aclDocs", { q })).status, 400, q);
    }
    // `_` (server-managed, not private) fields stay queryable
    assert.strictEqual((await this.request(USER_A, "PUT", "/perm/permTasks", { q: "_user = 'user-a'" })).status, 200);
  }

  @test
  async continuationTokensAreOpaque() {
    registerRepository(AclDoc, new OffsetRepository(AclDoc, ["uuid"]) as any);
    const acl = (user: string) => [{ action: "get", type: "USER", principal: user, allow: true }];
    await AclDoc.create({ uuid: "secret1", title: "secret", acl: acl(USER_A) } as any);
    await AclDoc.create({ uuid: "zmine", title: "mine", acl: acl(USER_B) } as any);
    // Anchored on B's own row: the raw offset token would be "2" on a hit (hidden row scanned) and "1" on a miss
    const hit = await this.request(USER_B, "PUT", "/perm/aclDocs", {
      q: "title LIKE 'secret%' OR uuid = 'zmine' LIMIT 1"
    });
    const miss = await this.request(USER_B, "PUT", "/perm/aclDocs", {
      q: "title LIKE 'nope%' OR uuid = 'zmine' LIMIT 1"
    });
    assert.strictEqual(hit.status, 200);
    assert.deepStrictEqual(hit.body.results, miss.body.results);
    assert.ok(hit.body.continuationToken && miss.body.continuationToken);
    assert.ok(!["1", "2"].includes(hit.body.continuationToken));
    assert.strictEqual(hit.body.continuationToken.length, miss.body.continuationToken.length);
    assert.notStrictEqual(hit.body.continuationToken, miss.body.continuationToken, "tokens are not deterministic");
    // The opaque token pages on
    const next = await this.request(USER_B, "PUT", "/perm/aclDocs", {
      q: `title LIKE 'secret%' OR uuid = 'zmine' LIMIT 1 OFFSET "${hit.body.continuationToken}"`
    });
    assert.strictEqual(next.status, 200);
    assert.deepStrictEqual(next.body.results, []);
    // A raw or forged token is refused
    for (const token of ["1", "2", "garbage"]) {
      const forged = await this.request(USER_B, "PUT", "/perm/aclDocs", { q: `uuid = 'zmine' OFFSET "${token}"` });
      assert.strictEqual(forged.status, 400, token);
    }
  }

  @test
  async inheritedStoreFiltersAreKept() {
    const ctxB: any = { getCurrentUserId: () => USER_B };
    /**
     * Adds a restriction and calls super: keeps the OwnerModel store filter
     */
    class Restricted extends PermTask {
      async canAct(context: IOperationContext, action: string): Promise<string | boolean> {
        if (action === "delete") return "never";
        return super.canAct(context, action);
      }
    }
    /**
     * Same for users
     */
    class RestrictedUser extends SimpleUser {
      async canAct(context: IOperationContext, action: string): Promise<string | boolean> {
        return super.canAct(context, action);
      }
    }
    assert.ok(Restricted.getPermissionQuery(ctxB)?.query.includes(USER_B));
    assert.ok(RestrictedUser.getPermissionQuery(ctxB)?.query.includes(USER_B));
    // A more permissive subclass opts out explicitly (sample-app User)
    const { useModel } = await import("../application/hooks.js");
    assert.strictEqual((useModel("User") as any).getPermissionQuery(ctxB), null);
  }

  @test
  async limitIsCappedAndRefillIsBounded() {
    const queries: string[] = [];
    let scanned = 0;
    const hidden = (uuid: string) => ({ uuid, canAct: async () => false });
    const model: any = {
      prototype: { canAct: () => true },
      query: async (q: string) => {
        queries.push(q);
        const limit = new QueryValidator(q).getLimit();
        scanned += limit;
        return { results: Array.from({ length: limit }, (_, i) => hidden(`h${scanned}-${i}`)), continuationToken: "t" };
      }
    };
    const res = await queryModelWithPermissions(model, "LIMIT 5000", { getCurrentUserId: () => "u" } as any);
    assert.match(queries[0], /LIMIT 1000\b/);
    assert.deepStrictEqual(res.results, []);
    assert.strictEqual(res.continuationToken, undefined);
    assert.ok(scanned <= 10000, `scanned ${scanned}`);
    // A model with neither canAct form denies every row: the store is not even asked
    let asked = 0;
    const plain: any = { query: async () => (asked++, { results: [{ uuid: "x" }] }) };
    const none = await queryModelWithPermissions(plain, "LIMIT 99999", { getCurrentUserId: () => "u" } as any);
    assert.deepStrictEqual(none, { results: [], continuationToken: undefined });
    assert.strictEqual(asked, 0);
  }

  @test
  async refillStopsOnEmptyPagesAndBoundsItsIterations() {
    const ctx: any = { getCurrentUserId: () => "u" };
    // A store answering empty pages with a token forever
    let empties = 0;
    const empty: any = {
      prototype: { canAct: () => true },
      query: async () => {
        if (++empties > 2000) throw new Error("LOOP");
        return { results: [], continuationToken: "t" };
      }
    };
    const res = await queryModelWithPermissions(empty, "LIMIT 10", ctx);
    assert.deepStrictEqual(res.results, []);
    assert.strictEqual(res.continuationToken, undefined);
    assert.ok(empties <= 2, `${empties} store calls`);
    // A store answering one hidden row per page: the number of store pages is capped too
    let pages = 0;
    const slow: any = {
      prototype: { canAct: () => true },
      query: async () => {
        if (++pages > 2000) throw new Error("LOOP");
        return { results: [{ uuid: `h${pages}`, canAct: async () => false }], continuationToken: "t" };
      }
    };
    const capped = await queryModelWithPermissions(slow, "LIMIT 1000", ctx);
    assert.deepStrictEqual(capped.results, []);
    assert.strictEqual(capped.continuationToken, undefined);
    assert.ok(pages <= MAX_REFILL_PAGES, `${pages} store pages`);
  }

  @test
  async continuationTokensAreBoundToTheQueryModelAndCaller() {
    registerRepository(AclDoc, new OffsetRepository(AclDoc, ["uuid"]) as any);
    const acl = (user: string) => [{ action: "get", type: "USER", principal: user, allow: true }];
    for (const i of [1, 2, 3]) {
      await AclDoc.create({ uuid: `secret${i}`, title: "secret", acl: acl(USER_A) } as any);
    }
    await AclDoc.create({ uuid: "zmine", title: "mine", acl: acl(USER_B) } as any);
    for (const i of [1, 2, 3, 4, 5]) {
      await AclDoc.create({ uuid: `b${i}`, title: "ruler", acl: acl(USER_B) } as any);
    }
    // The "ruler" attack: the offset hidden in the token would show as the row returned by a fully readable query
    const hit = await this.request(USER_B, "PUT", "/perm/aclDocs", {
      q: "title LIKE 'secret%' OR uuid = 'zmine' LIMIT 1"
    });
    const miss = await this.request(USER_B, "PUT", "/perm/aclDocs", {
      q: "title LIKE 'nope%' OR uuid = 'zmine' LIMIT 1"
    });
    assert.ok(hit.body.continuationToken && miss.body.continuationToken);
    for (const token of [hit.body.continuationToken, miss.body.continuationToken]) {
      // Another query, same model and caller
      const replay = await this.request(USER_B, "PUT", "/perm/aclDocs", {
        q: `title = 'ruler' LIMIT 1 OFFSET "${token}"`
      });
      assert.strictEqual(replay.status, 400);
      // Another model
      assert.strictEqual(
        (await this.request(USER_B, "PUT", "/perm/permTasks", { q: `LIMIT 1 OFFSET "${token}"` })).status,
        400
      );
      // Another caller, same query
      assert.strictEqual(
        (
          await this.request(USER_A, "PUT", "/perm/aclDocs", {
            q: `title LIKE 'secret%' OR uuid = 'zmine' LIMIT 1 OFFSET "${token}"`
          })
        ).status,
        400
      );
      assert.strictEqual(
        (
          await this.request(undefined, "PUT", "/perm/aclDocs", {
            q: `title LIKE 'secret%' OR uuid = 'zmine' LIMIT 1 OFFSET "${token}"`
          })
        ).status,
        400
      );
    }
    // The same query by the same caller pages on
    const next = await this.request(USER_B, "PUT", "/perm/aclDocs", {
      q: `title LIKE 'secret%' OR uuid = 'zmine' LIMIT 1 OFFSET "${hit.body.continuationToken}"`
    });
    assert.strictEqual(next.status, 200);
    assert.deepStrictEqual(next.body.results, []);
    // Models whose query is only filtered in the store get sealed tokens as well (a raw memory token counts hidden rows)
    await PermTask.create({ uuid: "task-c", title: "C private", _user: "user-c" } as any);
    const page = await this.request(USER_B, "PUT", "/perm/permTasks", { q: "LIMIT 1" });
    assert.strictEqual(page.status, 200);
    assert.ok(page.body.continuationToken);
    assert.ok(!/^[0-9]+$/.test(page.body.continuationToken), page.body.continuationToken);
  }

  @test
  async continuationTokensExpireAndCarryATypeTag() {
    const binding = { model: "WebdaDemo/AclDoc", query: "title = 'x'", user: USER_B };
    const fresh = await sealContinuationToken("3", binding);
    assert.strictEqual(await unsealContinuationToken(fresh, binding), "3");
    for (const other of [
      { ...binding, model: "WebdaDemo/PermTask" },
      { ...binding, query: "title = 'y'" },
      { ...binding, user: USER_A },
      { ...binding, user: "anonymous" }
    ]) {
      await assert.rejects(() => unsealContinuationToken(fresh, other), WebdaError.BadRequest);
    }
    const expired = await sealContinuationToken("3", binding, -1);
    await assert.rejects(() => unsealContinuationToken(expired, binding), WebdaError.BadRequest);
    // Any other ciphertext of the application is refused, even with the same fields
    const untagged = await useCrypto().encrypt({ t: "3", m: binding.model, q: binding.query, u: binding.user });
    await assert.rejects(() => unsealContinuationToken(untagged, binding), WebdaError.BadRequest);
  }

  @test
  async updateCannotSwapThePrimaryKey() {
    const a = await this.stored("task-a");
    const b = await this.stored("task-b");
    // B updates its own URL with A's key in the body
    const put = await this.request(USER_B, "PUT", "/perm/permTasks/task-b", { uuid: "task-a", title: "x" });
    assert.strictEqual(put.status, 400);
    const patch = await this.request(USER_B, "PATCH", "/perm/permTasks/task-b", { uuid: "task-a", title: "x" });
    assert.strictEqual(patch.status, 400);
    // A's URL with B's key in the body: the URL key wins, and B may not touch it
    const patch2 = await this.request(USER_B, "PATCH", "/perm/permTasks/task-a", { uuid: "task-b", title: "x2" });
    assert.ok(patch2.status >= 400, `status ${patch2.status}`);
    assert.deepStrictEqual(await this.stored("task-a"), a);
    assert.deepStrictEqual(await this.stored("task-b"), b);
    // The same key in the body is accepted
    const same = await this.request(USER_B, "PATCH", "/perm/permTasks/task-b", { uuid: "task-b", title: "ok" });
    assert.strictEqual(same.status, 200);
    assert.strictEqual((await this.stored("task-b")).title, "ok");
  }

  @test
  async underscoreAttributesCannotBeSetByClients() {
    await PermUser.create({ uuid: USER_A, displayName: "A" } as any);
    const roles = async () => {
      const u: any = await PermUser.ref(USER_A).get();
      return { roles: [...(u._roles ?? [])], groups: [...(u._groups ?? [])], name: u.displayName };
    };
    // A can update itself, but not grant itself roles or groups
    const patch = await this.request(USER_A, "PATCH", `/perm/permUsers/${USER_A}`, {
      displayName: "A2",
      _roles: ["admin"],
      _groups: ["admins"]
    });
    assert.strictEqual(patch.status, 200);
    assert.deepStrictEqual(await roles(), { roles: [], groups: [], name: "A2" });
    const put = await this.request(USER_A, "PUT", `/perm/permUsers/${USER_A}`, {
      uuid: USER_A,
      displayName: "A3",
      _roles: ["admin"],
      _groups: ["admins"]
    });
    assert.strictEqual(put.status, 200);
    assert.deepStrictEqual(await roles(), { roles: [], groups: [], name: "A3" });
    // Create: `_` attributes are dropped from any model input
    const created = await this.request(USER_A, "POST", "/perm/permTasks", {
      title: "t",
      _roles: ["admin"],
      _groups: ["admins"]
    });
    assert.strictEqual(created.status, 200);
    const c: any = await PermTask.ref(created.body.uuid).get();
    assert.strictEqual(c._roles, undefined);
    assert.strictEqual(c._groups, undefined);
  }

  @test
  async underscoreAttributesOptIn() {
    /**
     * Model accepting one `_` attribute from clients
     */
    class OptIn {
      static Metadata = { Relations: {} };
      static getClientWritableAttributes() {
        return ["_color"];
      }
    }
    assert.deepStrictEqual(
      sanitizeModelInput(OptIn as any, { _color: "red", _secret: 1, name: "n", nested: { _k: 1 } }),
      {
        _color: "red",
        name: "n",
        nested: { _k: 1 }
      }
    );
    // OwnerModel protects _user even when listed: protection wins
    assert.deepStrictEqual(sanitizeModelInput(PermTask as any, { _user: USER_B, title: "t" }), { title: "t" });
  }

  @test
  async nestedCreateChecksTheParent() {
    // B creates a child under A's private task
    const refused = await this.request(USER_B, "POST", "/perm/permTasks/task-a/permSubTasks", {
      uuid: "sub-b",
      label: "x"
    });
    assert.strictEqual(refused.status, 404);
    assert.strictEqual((await PermSubTask.query("")).results.length, 0, "nothing created");
    // Unknown parent
    const missing = await this.request(USER_A, "POST", "/perm/permTasks/nope/permSubTasks", { uuid: "sub-x" });
    assert.strictEqual(missing.status, 404);
    // Over a non-HTTP transport, the parent comes from the input
    const ctx = new SimpleOperationContext();
    await ctx.init();
    const session = new Session();
    session.login(USER_B, USER_B);
    ctx.setSession(session);
    ctx.setInput(Buffer.from(JSON.stringify({ uuid: "sub-b2", task: "task-a", label: "x" })));
    await assert.rejects(() => callOperation(ctx, "PermSubTask.Create"), WebdaError.NotFound);
    assert.strictEqual((await PermSubTask.query("")).results.length, 0, "nothing created");
    // The parent owner can
    const ok = await this.request(USER_A, "POST", "/perm/permTasks/task-a/permSubTasks", { label: "a" });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual((await PermSubTask.ref(ok.body.uuid).get()).task, "task-a");
    // Re-parenting to a parent the caller cannot read is refused too
    const b3 = await this.request(USER_B, "POST", "/perm/permTasks/task-b/permSubTasks", { label: "b" });
    assert.strictEqual(b3.status, 200);
    const move = await this.request(USER_B, "PATCH", `/perm/permTasks/task-b/permSubTasks/${b3.body.uuid}`, {
      task: "task-a"
    });
    assert.strictEqual(move.status, 404);
    assert.strictEqual((await PermSubTask.ref(b3.body.uuid).get()).task, "task-b");
  }

  @test
  async filteredPagesDoNotLeakHiddenMatches() {
    await AclDoc.create({
      uuid: "doc1",
      title: "secret-title",
      acl: [{ action: "get", type: "USER", principal: USER_A, allow: true }]
    } as any);
    await AclDoc.create({
      uuid: "doc2",
      title: "other",
      acl: [{ action: "get", type: "USER", principal: USER_A, allow: true }]
    } as any);
    const hit = await this.request(USER_B, "PUT", "/perm/aclDocs", { q: "title LIKE 'secret%' LIMIT 1" });
    const miss = await this.request(USER_B, "PUT", "/perm/aclDocs", { q: "title LIKE 'nope%' LIMIT 1" });
    assert.deepStrictEqual(hit.body, miss.body, "a query matching only hidden rows looks like one matching nothing");
    assert.strictEqual(hit.body.continuationToken, undefined);
  }

  @test
  async filteredPagesAreRefilled() {
    // Interleave rows B cannot read with rows B can read
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      await AclDoc.create({
        uuid: `r${i}`,
        title: `t${i}`,
        acl: [{ action: "get", type: "USER", principal: i % 2 ? USER_B : USER_A, allow: true }]
      } as any);
      if (i % 2) ids.push(`r${i}`);
    }
    const seen: string[] = [];
    let token: string | undefined;
    let pages = 0;
    do {
      const q = token ? `LIMIT 2 OFFSET "${token}"` : "LIMIT 2";
      const res = await this.request(USER_B, "PUT", "/perm/aclDocs", { q });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.results.length <= 2);
      if (res.body.continuationToken) {
        assert.ok(res.body.results.length > 0, "no token on an empty page");
      }
      seen.push(...res.body.results.map((r: any) => r.uuid));
      token = res.body.continuationToken;
    } while (token && ++pages < 10);
    assert.deepStrictEqual(seen.sort(), ids);
    // The first page is full despite the hidden rows
    const first = await this.request(USER_B, "PUT", "/perm/aclDocs", { q: "LIMIT 2" });
    assert.strictEqual(first.body.results.length, 2);
  }

  @test
  async usersCannotBeEnumerated() {
    await PermUser.create({ uuid: USER_A, displayName: "A" } as any);
    await PermUser.create({ uuid: USER_B, displayName: "B" } as any);
    const res = await this.request(USER_A, "PUT", "/perm/permUsers", { q: "" });
    assert.deepStrictEqual(
      res.body.results.map((r: any) => r.uuid),
      [USER_A]
    );
    assert.deepStrictEqual((await this.request(undefined, "PUT", "/perm/permUsers", { q: "" })).body.results, []);
    // Filtered in the store, with the id escaped
    const perm = PermUser.getPermissionQuery({ getCurrentUserId: () => "x' OR uuid != 'y" } as any);
    assert.ok(perm);
    assert.deepStrictEqual((await PermUser.query(perm.query)).results, []);
    assert.deepStrictEqual(
      (await PermUser.query(PermUser.getPermissionQuery({ getCurrentUserId: () => USER_B } as any).query)).results.map(
        r => r.uuid
      ),
      [USER_B]
    );
  }

  @test
  async throwingCanActRefusesOnlyItsRow() {
    const row = (uuid: string, canAct: any) => ({ uuid, canAct });
    const model: any = {
      prototype: { canAct: () => true },
      query: async () => ({
        results: [
          row("ok", async () => true),
          row("boom", async () => {
            throw new Error("db down");
          })
        ]
      })
    };
    const res = await queryModelWithPermissions(model, "", { getCurrentUserId: () => "u" } as any);
    assert.deepStrictEqual(
      res.results.map((r: any) => r.uuid),
      ["ok"]
    );
  }
}
