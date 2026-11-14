import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  EventRepository,
  MemoryRepository,
  Model,
  registerRepository,
  UuidModel,
  WEBDA_PRIMARY_KEY
} from "@webda/models";
import { stringifyQuery } from "@webda/ql";
import * as sinon from "sinon";
import { WebdaApplicationTest } from "../test/index.js";
import { RESTOperationsTransport, RESTOperationsTransportParameters } from "../rest/restoperationstransport.service.js";
import { Router, RouterParameters } from "../rest/router.service.js";
import { useRouter } from "../rest/hooks.js";
import { WebContext } from "../contexts/webcontext.js";
import { HttpContext, HttpMethodType } from "../contexts/httpcontext.js";
import { runWithContext } from "../contexts/execution.js";
import { SimpleOperationContext } from "../contexts/simplecontext.js";
import {
  callOperation,
  registerOperation,
  registerOperationAuthorizer,
  unregisterOperationAuthorizer
} from "../core/operations.js";
import { Session } from "../session/session.js";
import { useApplication } from "../application/hooks.js";
import { useDynamicService } from "../core/hooks.js";
import type { Application } from "../application/application.js";
import type { IOperationContext } from "../contexts/icontext.js";
import * as WebdaError from "../errors/errors.js";
import { MAX_QUERY_LIMIT, MAX_SELECT_DEPTH, MAX_SELECT_FIELDS, QUERY_DESCRIPTION } from "../models/permissions.js";
import {
  executeModelStatement,
  parseModelStatement,
  QUERY_STATEMENT_SCHEMA,
  QUERY_STATEMENTS_ACCEPTED,
  STATEMENT_WRITE_BATCH,
  type StatementOptions
} from "../models/statements.js";
import { DomainService, DomainServiceParameters, sanitizeModelInput } from "./domainservice.service.js";
import { AuditEntry, AuditService, AuditServiceParameters } from "./audit.model.js";

const USER_A = "user-a";
const USER_B = "user-b";
const ADMIN = "admin";

/**
 * A project: hidden projects are read by "admin" only
 */
class StProject extends UuidModel {
  name: string;
  hidden?: boolean;

  static canAct(context: IOperationContext, _action: string, object?: StProject): boolean | string {
    return !object?.hidden || context.getCurrentUserId() === ADMIN ? true : "hidden project";
  }
}

/**
 * A task: everyone reads the tasks that are not hidden, its owner updates and deletes it, "admin" does everything.
 * `role` is protected from everyone but "admin", `removed` soft-deletes, and `patch()` / `delete()` record their calls
 */
class StTask extends UuidModel {
  title: string;
  status: string;
  owner: string;
  priority?: number;
  doneAt?: number;
  meta?: { archived?: boolean; note?: string };
  hidden?: boolean;
  removed?: boolean;
  role?: string;
  project?: string;
  stamp?: string;
  _internal?: string;

  /**
   * Calls of the model methods: what a hook would see
   */
  static hooks: string[] = [];
  /**
   * Permission query of the next statements
   */
  static scope?: string;

  static canAct(context: IOperationContext, action: string, object?: StTask): boolean | string {
    const user = context.getCurrentUserId();
    if (!object || user === ADMIN) {
      return true;
    }
    if (object.hidden) {
      return "hidden task";
    }
    return action === "get" || object.owner === user ? true : "not the owner";
  }

  static getProtectedAttributes(context?: IOperationContext): string[] {
    return context?.getCurrentUserId() === ADMIN ? [] : ["role"];
  }

  static getPermissionQuery(): any {
    return StTask.scope ? { query: StTask.scope, partial: true } : null;
  }

  isDeleted(): boolean {
    return !!this.removed;
  }

  async patch(data: any): Promise<this> {
    StTask.hooks.push(`patch:${this.uuid}`);
    return super.patch(data);
  }

  async delete(): Promise<void> {
    StTask.hooks.push(`delete:${this.uuid}`);
    return super.delete();
  }
}

/**
 * A subclass stored with the tasks: `grade` is protected from everyone
 */
class StSubTask extends StTask {
  grade?: number;

  static getProtectedAttributes(): string[] {
    return ["grade"];
  }
}

/**
 * A model without any canAct: denied by default
 */
class StClosed extends UuidModel {
  text: string;
}

/**
 * A composite-key model open to everyone, without schema metadata
 */
class StPair extends Model {
  [WEBDA_PRIMARY_KEY] = ["a", "b"] as const;
  a: string;
  b: string;
  note?: string;

  static canAct(): boolean {
    return true;
  }
}

StProject.registerSerializer();
StTask.registerSerializer();
StSubTask.registerSerializer();
StClosed.registerSerializer();
StPair.registerSerializer();

/**
 * Minimal metadata for a model registered at runtime
 * @param name - the model short name
 * @param extra - relations, schemas, subclasses
 * @returns the metadata
 */
function metadata(name: string, extra: Record<string, any> = {}): any {
  return {
    Identifier: `WebdaDemo/${name}`,
    Ancestors: [],
    Subclasses: [],
    Relations: {},
    PrimaryKey: ["uuid"],
    Events: [],
    Schemas: {},
    Actions: {},
    Import: "",
    Plural: `${name}s`,
    Reflection: {},
    ...extra
  };
}

const TASK_SCHEMA = {
  type: "object",
  properties: {
    uuid: { type: "string" },
    title: { type: "string" },
    status: { type: "string" },
    owner: { type: "string" },
    priority: { type: "number" },
    doneAt: { type: "number" },
    meta: {
      type: "object",
      properties: { archived: { type: "boolean" }, note: { type: "string" } },
      additionalProperties: false
    },
    hidden: { type: "boolean" },
    removed: { type: "boolean" },
    role: { type: "string" },
    project: { type: "string" },
    stamp: { type: "string", readOnly: true },
    grade: { type: "number" },
    _internal: { type: "string" }
  },
  required: ["title", "owner"]
};
const TASK_METADATA = {
  Relations: { parent: { attribute: "project", model: "WebdaDemo/StProject" } },
  Schemas: { Input: TASK_SCHEMA, Output: TASK_SCHEMA }
};

/**
 * Options of a statement run without the DomainService: everything allowed
 * @param mode - how the rows are written
 * @param extra - options to override
 * @returns the options
 */
function open(mode: "bulk" | "events" = "bulk", extra: Partial<StatementOptions> = {}): StatementOptions {
  return { mode, sanitize: (_model, input) => input, validate: () => {}, canWrite: () => true, ...extra };
}

/**
 * A caller
 * @param user - the caller id
 * @returns its context
 */
function caller(user: string): IOperationContext {
  return { getCurrentUserId: () => user } as any;
}

/**
 * `UPDATE SET ... WHERE ...` and `DELETE WHERE ...` through the Query operations
 */
@suite
class DomainServiceStatementsTest extends WebdaApplicationTest {
  getTestConfiguration(): string | undefined {
    return process.cwd() + "/../../sample-app";
  }

  protected async buildWebda() {
    const core = await super.buildWebda();
    core.getBeans = () => {};
    core.registerBeans = () => {};
    const app = useApplication<Application>();
    app.addModel("WebdaDemo/StProject", StProject, metadata("StProject"));
    app.addModel("WebdaDemo/StSubTask", StSubTask, metadata("StSubTask", TASK_METADATA));
    app.addModel("WebdaDemo/StTask", StTask, metadata("StTask", { ...TASK_METADATA, Subclasses: [StSubTask] }));
    app.addModel("WebdaDemo/StClosed", StClosed, metadata("StClosed", { Plural: "StCloseds" }));
    app.addModel("WebdaDemo/StPair", StPair, metadata("StPair", { PrimaryKey: ["a", "b"] }));
    // The schema the Patch operation of the tasks validates its input with
    app.getSchemas()["WebdaDemo/StTask"] = TASK_SCHEMA as any;
    const router = new Router("Router", new RouterParameters().load({}));
    this.registerService(router);
    router.resolve();
    await router.init();
    return core;
  }

  async beforeAll(init: boolean = true) {
    await super.beforeAll(init);
    for (const [name, queryMethod] of [
      ["st", "PUT"],
      ["stget", "GET"]
    ]) {
      const transport = new RESTOperationsTransport(
        `${name}Transport`,
        new RESTOperationsTransportParameters().load({ url: `/${name}/`, exposeOpenAPI: false, queryMethod })
      );
      this.registerService(transport);
      transport.resolve();
      await transport.init();
    }
  }

  /**
   * The repositories under the event ones: what a bulk write reaches directly
   */
  stores: { task: MemoryRepository<any>; sub: MemoryRepository<any> };

  async beforeEach() {
    await super.beforeEach();
    StTask.hooks = [];
    StTask.scope = undefined;
    this.modes({});
    registerRepository(StProject, new MemoryRepository(StProject as any, ["uuid"]) as any);
    registerRepository(StClosed, new MemoryRepository(StClosed as any, ["uuid"]) as any);
    registerRepository(StPair, new MemoryRepository(StPair as any, ["a", "b"]) as any);
    // One storage for the hierarchy: subclass rows come back from the queries on StTask, typed with their class
    const storage = new Map<string, string>();
    this.stores = {
      task: new MemoryRepository(StTask, ["uuid"], undefined, storage),
      sub: new MemoryRepository(StSubTask, ["uuid"], undefined, storage)
    };
    registerRepository(StTask, new EventRepository(StTask, ["uuid"], this.stores.task));
    registerRepository(StSubTask, new EventRepository(StSubTask, ["uuid"], this.stores.sub));
    await StProject.create({ uuid: "p1", name: "Apollo" } as any);
    await StProject.create({ uuid: "p2", name: "Zeus" } as any);
    await StProject.create({ uuid: "p-hidden", name: "Secret", hidden: true } as any);
    const task = (uuid: string, extra: any = {}) =>
      StTask.create({ uuid, title: uuid, status: "open", owner: USER_A, project: "p1", ...extra } as any);
    await task("a1", { meta: { note: "keep" } });
    await task("a2");
    // Readable by user-a, not his
    await task("b1", { owner: USER_B });
    // Invisible to everyone but admin
    await task("h1", { hidden: true });
    await task("c1", { status: "closed" });
    // Soft-deleted: a 404 for the Patch and Delete operations
    await task("r1", { removed: true });
    await StSubTask.create({ uuid: "s1", title: "s1", status: "open", owner: USER_A, project: "p1" } as any);
    await StClosed.create({ uuid: "x1", text: "closed" } as any);
  }

  /**
   * Set the statement modes of the DomainService
   * @param modes - the `queryStatements` parameter
   */
  modes(modes: Record<string, any>): void {
    (useDynamicService<DomainService>("DomainService").getParameters() as any).queryStatements = modes;
  }

  /**
   * One field of every stored task, by uuid
   * @param field - the field
   * @returns the values
   */
  async stored(field: string = "status"): Promise<Record<string, any>> {
    const { results } = await StTask.query("");
    return Object.fromEntries(results.map((row: any) => [row.uuid, row[field]]).sort());
  }

  /**
   * Run a request through the Router as `user`
   * @param user - current user id
   * @param method - HTTP method
   * @param url - URL
   * @param body - request body
   * @returns the status code and the parsed body
   */
  async request(user: string, method: HttpMethodType, url: string, body?: any): Promise<{ status: number; body: any }> {
    const httpContext = new HttpContext("test.webda.io", method, url, "http", 80, {});
    if (body !== undefined) {
      httpContext.setBody(body);
    }
    httpContext.setClientIp("127.0.0.1");
    const ctx = new WebContext(httpContext);
    ctx.newSession();
    ctx.getSession().login(user, user);
    let status = 0;
    let message: string | undefined;
    await runWithContext(ctx, async () => {
      try {
        await useRouter().execute(ctx);
        status = ctx.statusCode;
      } catch (err) {
        if (err instanceof WebdaError.HttpError) {
          status = err.getResponseCode();
          message = err.message;
        } else {
          throw err;
        }
      }
    });
    const raw = <string>ctx.getResponseBody();
    return { status, body: message ?? (raw ? JSON.parse(raw) : undefined) };
  }

  /**
   * Send a statement to the Query route of the tasks (`PUT /st/stTasks`)
   * @param q - the statement
   * @param user - the caller id
   * @returns the status code and the parsed body, the error message when refused
   */
  put(q: string, user: string = USER_A): Promise<{ status: number; body: any }> {
    return this.request(user, "PUT", "/st/stProjects/p1/stTasks", { q });
  }

  /**
   * Call a Query operation like gRPC and MCP do: `callOperation` with a non-HTTP context
   * @param query - the query
   * @param user - the caller id
   * @param extensions - context extensions set by the transport
   * @param operation - the operation
   * @returns the operation output
   */
  async call(
    query: string,
    user: string = USER_A,
    extensions: Record<string, any> = { [QUERY_STATEMENTS_ACCEPTED]: true },
    operation: string = "StTasks.Query"
  ): Promise<any> {
    const ctx = new SimpleOperationContext();
    await ctx.init();
    const session = new Session();
    session.login(user, user);
    ctx.setSession(session);
    ctx.setInput(Buffer.from(JSON.stringify({ query })));
    ctx.setParameters({ query });
    Object.entries(extensions).forEach(([key, value]) => ctx.setExtension(key, value));
    await callOperation(ctx, operation);
    return JSON.parse(<string>ctx.getOutput());
  }

  @test
  async refusedUnlessTheModelEnablesThem() {
    const refused = async (q: string) => {
      const res = await this.put(q);
      assert.strictEqual(res.status, 400, q);
      assert.strictEqual(res.body, `${q.split(" ")[0]} statements are not accepted by queries`);
    };
    // The default: no model runs statements
    assert.deepStrictEqual(new DomainServiceParameters().load({}).queryStatements, {});
    await refused("DELETE");
    await refused("UPDATE SET status = 'done'");
    // `false` takes a model out of the wildcard
    this.modes({ "*": "bulk", "WebdaDemo/StTask": false });
    await refused("DELETE WHERE status = 'open'");
    assert.strictEqual(Object.keys(await this.stored()).length, 7);
    // Listed by the wildcard
    this.modes({ "*": "bulk" });
    assert.strictEqual((await this.put("DELETE WHERE uuid = 'a1'")).status, 200);
    // Listed by name: other models still refuse
    this.modes({ "WebdaDemo/StTask": "bulk" });
    assert.strictEqual((await this.put("DELETE WHERE uuid = 'a2'")).status, 200);
    const closed = await this.request(USER_A, "PUT", "/st/stCloseds", { q: "DELETE" });
    assert.deepStrictEqual(closed, { status: 400, body: "DELETE statements are not accepted by queries" });
    assert.deepStrictEqual(Object.keys(await this.stored()), ["b1", "c1", "h1", "r1", "s1"]);
    // The modes are checked when the service resolves
    const service = (queryStatements: any) =>
      new DomainService("StModes", new DomainServiceParameters().load({ queryStatements, operations: false }));
    assert.throws(
      () => service({ "*": "all" }).resolve(),
      /StModes: queryStatements\["\*"\] must be "bulk", "events" or false/
    );
    assert.throws(() => service({ "WebdaDemo/StTask": true }).resolve(), /queryStatements\["WebdaDemo\/StTask"\]/);
    service({ "*": "events", "WebdaDemo/StTask": "bulk", "WebdaDemo/StClosed": false }).resolve();
  }

  @test
  async updateChangesTheRowsTheCallerMayUpdate() {
    this.modes({ "WebdaDemo/StTask": "bulk" });
    const events: string[] = [];
    for (const model of [StTask, StSubTask]) {
      for (const event of ["Patch", "Patched", "Update", "Updated"]) {
        (model.getRepository() as any).on(event, (evt: any) => events.push(`${event}:${evt.object_id}`));
      }
    }
    const res = await this.put("UPDATE SET status = 'done', meta.archived = TRUE WHERE status = 'open'");
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    // b1 is readable but not his: skipped. h1 (hidden) and r1 (soft-deleted) are invisible: not counted
    assert.deepStrictEqual(res.body, {
      results: [],
      statement: { type: "UPDATE", changed: 3, skipped: 1, more: false }
    });
    assert.deepStrictEqual(await this.stored(), {
      a1: "done",
      a2: "done",
      b1: "open",
      c1: "closed",
      h1: "open",
      r1: "open",
      s1: "done"
    });
    // A dotted target keeps the other fields of its object, and creates it when missing
    const meta = await this.stored("meta");
    assert.deepStrictEqual(meta.a1, { note: "keep", archived: true });
    assert.deepStrictEqual(meta.a2, { archived: true });
    assert.strictEqual(meta.b1, undefined);
    // Subclass rows keep their class
    assert.ok((await StTask.ref("s1").get()) instanceof StSubTask);
    // Bulk mode: no per-object event, no model method
    assert.deepStrictEqual(events, []);
    assert.deepStrictEqual(StTask.hooks, []);
    // The admin changes them all, the hidden one included; a soft-deleted object stays a missing one
    const all = await this.put("UPDATE SET priority = 3", ADMIN);
    assert.deepStrictEqual(all.body.statement, { type: "UPDATE", changed: 6, skipped: 0, more: false });
    assert.deepStrictEqual(await this.stored("priority"), { a1: 3, a2: 3, b1: 3, c1: 3, h1: 3, r1: undefined, s1: 3 });
    // A dynamic value is resolved once: every row gets the same
    const before = Date.now();
    await this.put("UPDATE SET doneAt = NOW() WHERE status = 'done'");
    const doneAt = await this.stored("doneAt");
    assert.ok(doneAt.a1 >= before && doneAt.a1 <= Date.now());
    assert.deepStrictEqual([doneAt.a2, doneAt.s1, doneAt.b1], [doneAt.a1, doneAt.a1, undefined]);
  }

  @test
  async deleteRemovesTheRowsTheCallerMayDelete() {
    this.modes({ "WebdaDemo/StTask": "bulk" });
    const events: string[] = [];
    (StTask.getRepository() as any).on("Deleted", (evt: any) => events.push(evt.object_id));
    const res = await this.put("DELETE WHERE status = 'open'");
    assert.deepStrictEqual(res, {
      status: 200,
      body: { results: [], statement: { type: "DELETE", changed: 3, skipped: 1, more: false } }
    });
    assert.deepStrictEqual(await this.stored(), { b1: "open", c1: "closed", h1: "open", r1: "open" });
    assert.deepStrictEqual(events, []);
    assert.deepStrictEqual(StTask.hooks, []);
    // Nothing left to delete for him: the hidden row does not show, whatever the filter
    assert.deepStrictEqual((await this.put("DELETE WHERE uuid = 'h1'")).body.statement, {
      type: "DELETE",
      changed: 0,
      skipped: 0,
      more: false
    });
    assert.deepStrictEqual((await this.put("DELETE WHERE uuid = 'missing'")).body.statement.changed, 0);
    assert.strictEqual((await this.stored()).h1, "open");
    // A plain query still answers as before: no `statement`
    const query = await this.put("status = 'closed'");
    assert.deepStrictEqual(Object.keys(query.body), ["results"]);
    assert.deepStrictEqual(
      query.body.results.map((row: any) => row.uuid),
      ["c1"]
    );
    // A field starting like a keyword is a filter
    assert.strictEqual(parseModelStatement("DELETED = TRUE"), undefined);
    assert.strictEqual(parseModelStatement("UPDATEDAT > 1 LIMIT 1"), undefined);
    assert.strictEqual(parseModelStatement("status = 'DELETE'"), undefined);
    assert.strictEqual(parseModelStatement(undefined), undefined);
    assert.strictEqual(parseModelStatement("  DELETE LIMIT 1").getQuery().type, "DELETE");
    assert.deepStrictEqual((await this.put("DELETED = TRUE")).body, { results: [] });
  }

  @test
  async eventsModeWritesThroughTheModel() {
    this.modes({ "*": "events" });
    const events: string[] = [];
    for (const model of [StTask, StSubTask]) {
      for (const event of ["Patch", "Patched", "Delete", "Deleted"]) {
        (model.getRepository() as any).on(event, (evt: any) => events.push(`${event}:${evt.object_id}`));
      }
    }
    const updated = await this.put("UPDATE SET status = 'done', meta.archived = TRUE WHERE status = 'open'");
    assert.deepStrictEqual(updated.body.statement, { type: "UPDATE", changed: 3, skipped: 1, more: false });
    // Like the Patch operation: the model method runs, and the repository events fire, once per object
    assert.deepStrictEqual(StTask.hooks, ["patch:a1", "patch:a2", "patch:s1"]);
    assert.deepStrictEqual(events, ["Patch:a1", "Patched:a1", "Patch:a2", "Patched:a2", "Patch:s1", "Patched:s1"]);
    assert.deepStrictEqual((await this.stored("meta")).a1, { note: "keep", archived: true });
    assert.deepStrictEqual(await this.stored(), {
      a1: "done",
      a2: "done",
      b1: "open",
      c1: "closed",
      h1: "open",
      r1: "open",
      s1: "done"
    });
    StTask.hooks = [];
    events.length = 0;
    const deleted = await this.put("DELETE WHERE status = 'done' LIMIT 2");
    assert.deepStrictEqual(deleted.body.statement, { type: "DELETE", changed: 2, skipped: 0, more: true });
    assert.deepStrictEqual(StTask.hooks, ["delete:a1", "delete:a2"]);
    assert.deepStrictEqual(events, ["Delete:a1", "Deleted:a1", "Delete:a2", "Deleted:a2"]);
    assert.deepStrictEqual(Object.keys(await this.stored()), ["b1", "c1", "h1", "r1", "s1"]);
  }

  @test
  async eventsModeLeavesOutObjectsDeletedMeanwhile() {
    const listen = (fn: (evt: any) => any) => (StTask.getRepository() as any).on("Patch", fn);
    // a2 is deleted by someone else while the statement runs, and its write fails: it is not counted
    listen(async (evt: any) => {
      if (evt.object_id === "a2") {
        await this.stores.task.delete("a2");
        throw new Error("gone");
      }
    });
    const res = await executeModelStatement(
      StTask,
      parseModelStatement("UPDATE SET status = 'done' WHERE status = 'open'"),
      caller(USER_A),
      open("events")
    );
    assert.deepStrictEqual(res.statement, { type: "UPDATE", changed: 2, skipped: 1, more: false });
    assert.deepStrictEqual(await this.stored(), {
      a1: "done",
      b1: "open",
      c1: "closed",
      h1: "open",
      r1: "open",
      s1: "done"
    });
    // A write failing on an object that still exists fails the statement: the earlier writes stay
    listen((evt: any) => {
      if (evt.object_id === "c1") {
        throw new Error("listener failure");
      }
    });
    await assert.rejects(
      () =>
        executeModelStatement(
          StTask,
          parseModelStatement("UPDATE SET status = 'again' WHERE status IN ['done', 'closed']"),
          caller(USER_A),
          open("events")
        ),
      /listener failure/
    );
    assert.deepStrictEqual(await this.stored(), {
      a1: "again",
      b1: "open",
      c1: "closed",
      h1: "open",
      r1: "open",
      s1: "done"
    });
  }

  @test
  async limitsAndMore() {
    this.modes({ "*": "bulk" });
    // LIMIT 0 changes nothing, and reads nothing
    const query = sinon.spy(StTask.getRepository(), "query");
    try {
      assert.deepStrictEqual((await this.put("DELETE LIMIT 0")).body.statement, {
        type: "DELETE",
        changed: 0,
        skipped: 0,
        more: false
      });
      assert.strictEqual(query.callCount, 0);
    } finally {
      query.restore();
    }
    assert.strictEqual(Object.keys(await this.stored()).length, 7);
    // LIMIT bounds the rows changed: `more` tells that matching rows remain, the statement is sent again
    const first = await this.put("UPDATE SET status = 'done' WHERE status = 'open' LIMIT 2", ADMIN);
    assert.deepStrictEqual(first.body.statement, { type: "UPDATE", changed: 2, skipped: 0, more: true });
    const second = await this.put("UPDATE SET status = 'done' WHERE status = 'open' LIMIT 2", ADMIN);
    assert.deepStrictEqual(second.body.statement, { type: "UPDATE", changed: 2, skipped: 0, more: true });
    const last = await this.put("UPDATE SET status = 'done' WHERE status = 'open' LIMIT 2", ADMIN);
    assert.deepStrictEqual(last.body.statement, { type: "UPDATE", changed: 1, skipped: 0, more: false });
    // A skipped row is replaced by the next ones: LIMIT counts the rows changed
    await StTask.create({ uuid: "b0", title: "b0", status: "todo", owner: USER_B, project: "p1" } as any);
    await StTask.create({ uuid: "a8", title: "a8", status: "todo", owner: USER_A, project: "p1" } as any);
    await StTask.create({ uuid: "a9", title: "a9", status: "todo", owner: USER_A, project: "p1" } as any);
    const refill = await this.put("DELETE WHERE status = 'todo' LIMIT 1");
    assert.deepStrictEqual(refill.body.statement, { type: "DELETE", changed: 1, skipped: 1, more: true });
    assert.deepStrictEqual((await this.stored()).a8, undefined);
    assert.deepStrictEqual((await this.stored()).a9, "todo");
    // LIMIT is capped like the LIMIT of a query, and is the cap when not given
    for (let i = 0; i < MAX_QUERY_LIMIT + 1; i++) {
      await this.stores.task.create({
        uuid: `m${i}`,
        title: "mass",
        status: "mass",
        owner: USER_A,
        project: "p1"
      } as any);
    }
    const capped = await this.put(`DELETE WHERE status = 'mass' LIMIT ${MAX_QUERY_LIMIT * 5}`);
    assert.deepStrictEqual(capped.body.statement, { type: "DELETE", changed: MAX_QUERY_LIMIT, skipped: 0, more: true });
    const rest = await this.put("DELETE WHERE status = 'mass'");
    assert.deepStrictEqual(rest.body.statement, { type: "DELETE", changed: 1, skipped: 0, more: false });
    assert.ok(MAX_QUERY_LIMIT > STATEMENT_WRITE_BATCH);
  }

  @test
  async scanBudget() {
    this.modes({ "*": "bulk" });
    const deep = { title: "z", status: "deep", owner: USER_A, project: "p1" };
    for (let i = 0; i < 120; i++) {
      await this.stores.task.create({ ...deep, uuid: `z${i}`, hidden: true } as any);
    }
    await this.stores.task.create({ ...deep, uuid: "zz" } as any);
    // The budget is spent on rows the caller may not read: nothing tells that rows remain
    const hidden = await this.put("DELETE WHERE status = 'deep' LIMIT 1");
    assert.deepStrictEqual(hidden.body.statement, { type: "DELETE", changed: 0, skipped: 0, more: false });
    assert.strictEqual((await this.stored()).zz, "deep");
    // The caller saw a row he may not change: he is told that the statement did not reach the end
    const skipped = await this.put("DELETE WHERE status = 'deep' OR uuid = 'b1' LIMIT 1");
    assert.deepStrictEqual(skipped.body.statement, { type: "DELETE", changed: 0, skipped: 1, more: true });
    // With a larger LIMIT the scan goes further, by larger pages
    const reached = await this.put("DELETE WHERE status = 'deep' LIMIT 20");
    assert.deepStrictEqual(reached.body.statement, { type: "DELETE", changed: 1, skipped: 0, more: false });
    assert.strictEqual((await this.stored()).zz, undefined);
  }

  @test
  async permissionQueryIsKeptOnTheScanAndOnTheWrite() {
    this.modes({ "*": "bulk" });
    StTask.scope = "uuid != 'a2'";
    const res = await this.put("UPDATE SET status = 'done' WHERE status = 'open'");
    assert.deepStrictEqual(res.body.statement, { type: "UPDATE", changed: 2, skipped: 1, more: false });
    assert.deepStrictEqual([(await this.stored()).a1, (await this.stored()).a2], ["done", "open"]);
    // The WHERE and the permission query are part of the bulk write
    const updateMany = sinon.spy(this.stores.task, "updateMany");
    try {
      await this.put("UPDATE SET status = 'redone' WHERE status = 'done' OR status = 'closed'");
      assert.strictEqual(updateMany.callCount, 1);
      // The parent filter of the nested route is part of the WHERE too
      assert.strictEqual(
        stringifyQuery(updateMany.firstCall.args[0] as any),
        `UPDATE SET status = "redone" WHERE uuid IN ["a1", "c1", "s1"] AND ( ( status = "done" OR status = "closed" ) AND project = "p1" AND uuid != "a2" )`
      );
    } finally {
      updateMany.restore();
    }
    // A row that stopped matching between its check and the write is left as it is, and not counted
    StTask.scope = undefined;
    const authorizer = async (_context: any, _operationId: string, _operation: any, options: any) => {
      if (options.input?.uuid === "a1") {
        await this.stores.task.patch("a2", { status: "moved" } as any);
      }
      return true;
    };
    await this.stores.task.patch("a2", { status: "redone" } as any);
    registerOperationAuthorizer(authorizer);
    try {
      const raced = await this.put("DELETE WHERE status = 'redone'");
      assert.deepStrictEqual(raced.body.statement, { type: "DELETE", changed: 3, skipped: 0, more: false });
    } finally {
      unregisterOperationAuthorizer(authorizer);
    }
    assert.deepStrictEqual(await this.stored(), { a2: "moved", b1: "open", h1: "open", r1: "open" });
  }

  @test
  async refusedTargets() {
    this.modes({ "*": "bulk" });
    const refused = async (q: string, message: string, user: string = USER_A) => {
      const res = await this.put(q, user);
      assert.deepStrictEqual(res, { status: 400, body: message }, q);
    };
    const before = JSON.stringify((await StTask.query("")).results);
    // What the Patch operation would not take: primary key, private, protected, read-only, `_` attributes
    await refused("UPDATE SET uuid = 'other'", 'Cannot set "uuid"');
    await refused("UPDATE SET uuid.part = 'other'", 'Cannot set "uuid.part"');
    await refused("UPDATE SET __secret = 'x'", "Private fields cannot be queried");
    await refused("UPDATE SET meta.__secret = 'x'", "Private fields cannot be queried");
    await refused("UPDATE SET status = 'x' WHERE __secret = 'x'", "Private fields cannot be queried");
    await refused("DELETE WHERE meta.__secret = 'x'", "Private fields cannot be queried");
    await refused("UPDATE SET role = 'boss'", 'Cannot set "role"');
    await refused("UPDATE SET title = 'x', role = 'boss' WHERE uuid = 'a1'", 'Cannot set "role"');
    await refused("UPDATE SET stamp = 'x'", 'Cannot set "stamp"');
    await refused("UPDATE SET _internal = 'x'", 'Cannot set "_internal"');
    // Protected by a subclass, whose rows the statement reaches
    await refused("UPDATE SET grade = 5", 'Cannot set "grade"', ADMIN);
    // Prototype members
    await refused("UPDATE SET meta.constructor = 'x'", 'Cannot set "meta.constructor"');
    await refused("UPDATE SET toString = 'x'", 'Cannot set "toString"');
    await refused("UPDATE SET meta.prototype = 'x'", 'Cannot set "meta.prototype"');
    // Twice, or with one of its children
    await refused("UPDATE SET title = 'a', title = 'b'", '"title" is set more than once');
    await refused("UPDATE SET meta = 'a', meta.note = 'b'", '"meta" is set more than once');
    // Not a field of the model
    await refused("UPDATE SET nope = 1", 'Unknown field "nope"');
    await refused("UPDATE SET nope.deep = 1", 'Unknown field "nope.deep"');
    // Limits
    const many = Array.from({ length: MAX_SELECT_FIELDS + 1 }, (_v, i) => `f${i} = 1`).join(", ");
    await refused(`UPDATE SET ${many}`, `A statement cannot set more than ${MAX_SELECT_FIELDS} fields`);
    const deep = `meta.${Array.from({ length: MAX_SELECT_DEPTH }, () => "a").join(".")}`;
    await refused(`UPDATE SET ${deep} = 1`, `A SET target cannot have more than ${MAX_SELECT_DEPTH} segments`);
    // The schema of the model, like the input of the Patch operation
    await refused("UPDATE SET priority = 'high'", "UPDATE InvalidInput: /priority must be number");
    await refused("UPDATE SET meta.archived = 'yes'", "UPDATE InvalidInput: /meta/archived must be boolean");
    await refused(
      "UPDATE SET title = 'ok', meta.other = 1",
      "UPDATE InvalidInput: /meta must NOT have additional properties"
    );
    // Statements that do not parse, clauses that do not combine
    for (const q of [
      "DELETE WHERE",
      "UPDATE status = 'x'",
      "DELETE WHERE status = 'open' HYDRATE project",
      "UPDATE SET status = 'x' HYDRATE project",
      "DELETE WHERE status = 'open' ORDER BY title",
      "DELETE WHERE status = 'open' OFFSET 'token'",
      "SELECT title DELETE"
    ]) {
      const res = await this.put(q);
      assert.strictEqual(res.status, 400, q);
      await assert.rejects(() => this.call(q), /Query syntax error/, q);
    }
    // Nothing was written by any of them
    assert.strictEqual(JSON.stringify((await StTask.query("")).results), before);
    // Per-caller rule: the admin may set the role. Required fields are not asked for
    const admin = await this.put("UPDATE SET role = 'boss' WHERE uuid = 'a1'", ADMIN);
    assert.deepStrictEqual(admin.body.statement, { type: "UPDATE", changed: 1, skipped: 0, more: false });
    assert.strictEqual((await this.stored("role")).a1, "boss");
  }

  @test
  async movingToAnotherParent() {
    this.modes({ "*": "bulk" });
    // Like an update: the caller must be able to read the new parent. Missing and unreadable answer the same
    for (const project of ["p-hidden", "p-missing"]) {
      const res = await this.put(`UPDATE SET project = '${project}' WHERE uuid = 'a1'`);
      assert.deepStrictEqual(res, { status: 404, body: "Object not found" });
    }
    assert.strictEqual((await this.stored("project")).a1, "p1");
    const moved = await this.put("UPDATE SET project = 'p2' WHERE uuid = 'a1'");
    assert.strictEqual(moved.body.statement.changed, 1);
    const hidden = await this.put("UPDATE SET project = 'p-hidden' WHERE uuid = 'a2'", ADMIN);
    assert.strictEqual(hidden.body.statement.changed, 1);
    assert.deepStrictEqual([(await this.stored("project")).a1, (await this.stored("project")).a2], ["p2", "p-hidden"]);
  }

  @test
  async operationLevelPermission() {
    this.modes({ "*": "bulk" });
    const asked: any[] = [];
    let refuse: (operationId: string, options: any) => boolean = () => false;
    const authorizer = async (_context: any, operationId: string, _operation: any, options: any) => {
      if (operationId === "StTask.Patch" || operationId === "StTask.Delete") {
        asked.push([operationId, options]);
      }
      return refuse(operationId, options) ? "refused" : true;
    };
    registerOperationAuthorizer(authorizer);
    try {
      // A caller who could not call the Patch operation cannot run an UPDATE: nothing is read
      refuse = operationId => operationId === "StTask.Patch";
      const update = await this.put("UPDATE SET status = 'done' WHERE status = 'open'");
      assert.deepStrictEqual(update, { status: 403, body: "UPDATE statements are not allowed" });
      assert.deepStrictEqual(asked, [["StTask.Patch", { input: undefined, probe: true }]]);
      // The Delete operation is another permission
      asked.length = 0;
      const deleted = await this.put("DELETE WHERE uuid = 'a2'");
      assert.deepStrictEqual(deleted.body.statement, { type: "DELETE", changed: 1, skipped: 0, more: false });
      assert.deepStrictEqual(asked, [
        ["StTask.Delete", { input: undefined, probe: true }],
        ["StTask.Delete", { input: { uuid: "a2" }, probe: false }]
      ]);
      refuse = operationId => operationId === "StTask.Delete";
      assert.deepStrictEqual(await this.put("DELETE"), { status: 403, body: "DELETE statements are not allowed" });
      // An authorizer deciding per object (a grant on some objects): the others are skipped. It receives the input
      // of the Patch operation: the key and the patch
      asked.length = 0;
      refuse = (_operationId, options) => options.input?.uuid === "s1";
      const partial = await this.put("UPDATE SET status = 'done', meta.archived = TRUE WHERE status = 'open'");
      assert.deepStrictEqual(partial.body.statement, { type: "UPDATE", changed: 1, skipped: 2, more: false });
      assert.deepStrictEqual(asked, [
        ["StTask.Patch", { input: undefined, probe: true }],
        [
          "StTask.Patch",
          { input: { uuid: "a1", status: "done", meta: { note: "keep", archived: true } }, probe: false }
        ],
        ["StTask.Patch", { input: { uuid: "s1", status: "done", meta: { archived: true } }, probe: false }]
      ]);
      assert.deepStrictEqual([(await this.stored()).a1, (await this.stored()).s1], ["done", "open"]);
    } finally {
      unregisterOperationAuthorizer(authorizer);
    }
    // A model without identifier, or without the Patch and Delete operations of the DomainService, runs none
    this.modes({ "*": "events" });
    class Bare {}
    class Unexposed extends StPair {}
    (Unexposed as any).Metadata = { ...metadata("Unexposed"), PrimaryKey: ["a", "b"] };
    for (const [id, model] of [
      ["Bares", Bare],
      ["Unexposeds", Unexposed]
    ] as [string, any][]) {
      registerOperation(`${id}.Query`, {
        service: "DomainService",
        method: "modelQuery",
        input: "searchRequest",
        output: "void",
        context: { model }
      } as any);
    }
    await assert.rejects(
      () => this.call("DELETE", USER_A, undefined, "Bares.Query"),
      (err: any) =>
        err instanceof WebdaError.BadRequest && err.message === "DELETE statements are not accepted by queries"
    );
    await assert.rejects(
      () => this.call("DELETE", USER_A, undefined, "Unexposeds.Query"),
      (err: any) => err instanceof WebdaError.Forbidden && err.message === "DELETE statements are not allowed"
    );
  }

  @test
  async denyByDefault() {
    this.modes({ "*": "events" });
    // A model without canAct: no row can be read, the store is not asked
    const query = sinon.spy(StClosed.getRepository(), "query");
    try {
      const res = await this.request(USER_A, "PUT", "/st/stCloseds", { q: "DELETE" });
      assert.deepStrictEqual(res, {
        status: 200,
        body: { results: [], statement: { type: "DELETE", changed: 0, skipped: 0, more: false } }
      });
      const update = await this.request(ADMIN, "PUT", "/st/stCloseds", { q: "UPDATE SET text = 'x'" });
      assert.deepStrictEqual(update.body.statement, { type: "UPDATE", changed: 0, skipped: 0, more: false });
      assert.strictEqual(query.callCount, 0);
    } finally {
      query.restore();
    }
    assert.strictEqual(((await StClosed.ref("x1").get()) as any).text, "closed");
  }

  @test
  async transports() {
    this.modes({ "*": "bulk" });
    const refused = (err: any) =>
      err instanceof WebdaError.BadRequest && err.message === "DELETE statements are not accepted by queries";
    // A transport that does not declare that the call may write refuses statements: MCP (its Query tools are
    // announced read-only), and any transport unaware of them
    await assert.rejects(() => this.call("DELETE", ADMIN, {}), refused);
    await assert.rejects(() => this.call("DELETE", ADMIN, { [QUERY_STATEMENTS_ACCEPTED]: "yes" }), refused);
    // A REST GET is a safe method: it never writes
    const get = await this.request(
      ADMIN,
      "GET",
      `/stget/stProjects/p1/stTasks?q=${encodeURIComponent("DELETE WHERE uuid = 'a1'")}`
    );
    assert.deepStrictEqual(get, { status: 400, body: "DELETE statements are not accepted by queries" });
    const update = await this.request(
      ADMIN,
      "GET",
      `/stget/stProjects/p1/stTasks?q=${encodeURIComponent("UPDATE SET status = 'x'")}`
    );
    assert.deepStrictEqual(update, { status: 400, body: "UPDATE statements are not accepted by queries" });
    assert.strictEqual((await this.request(ADMIN, "GET", "/stget/stProjects/p1/stTasks?q=")).body.results.length, 7);
    assert.strictEqual(Object.keys(await this.stored()).length, 7);
    // gRPC declares it: the same statement runs
    const res = await this.call("DELETE WHERE uuid = 'a1'", ADMIN);
    assert.deepStrictEqual(res, { results: [], statement: { type: "DELETE", changed: 1, skipped: 0, more: false } });
    // The count argument is ignored by a statement
    const counted = await this.request(USER_A, "PUT", "/st/stProjects/p1/stTasks", {
      q: "DELETE WHERE uuid = 'a2'",
      count: true
    });
    assert.deepStrictEqual(Object.keys(counted.body), ["results", "statement"]);
  }

  @test
  async auditedAsWrites() {
    this.modes({ "WebdaDemo/StTask": "bulk" });
    registerRepository(AuditEntry, new MemoryRepository(AuditEntry as any, ["uuid"]) as any);
    const audit = new AuditService("StAudit", new AuditServiceParameters().load({ level: "write" }));
    this.registerService(audit);
    audit.resolve();
    const refuse = async (_context: any, operationId: string) => (operationId === "StTask.Patch" ? "refused" : true);
    registerOperationAuthorizer(refuse);
    try {
      // A query reads: the audit of the write operations leaves it out, as before
      await this.put("status = 'open'");
      assert.deepStrictEqual(audit.getEntries(), []);
      // A statement writes through the same operation: recorded, and so is a refused one
      await this.put("DELETE WHERE uuid = 'a1'");
      assert.strictEqual((await this.put("UPDATE SET status = 'x'")).status, 403);
      assert.deepStrictEqual(
        audit.getEntries().map(entry => [entry.operationId, entry.success, entry.userId]),
        [
          ["StTasks.Query", true, USER_A],
          ["StTasks.Query", false, USER_A]
        ]
      );
      // A statement the model or the transport does not accept wrote nothing and could not: a refused query
      await this.request(USER_A, "PUT", "/st/stCloseds", { q: "DELETE" });
      assert.strictEqual(audit.getEntries().length, 2);
      // An entry added without the context of its call
      await audit.addAuditEntry("StTasks.Query", USER_A);
      await audit.addAuditEntry("StTask.Delete", USER_A);
      assert.strictEqual(audit.getEntries().length, 3);
      assert.strictEqual(audit.shouldAudit("StTasks.Query", true), false);
      assert.strictEqual(audit.shouldAudit("StTasks.Query", true, true), true);
    } finally {
      unregisterOperationAuthorizer(refuse);
      await audit.stop();
    }
  }

  @test
  async dryRunChecksAndCounts() {
    this.modes({ "*": "events" });
    const dry = { [QUERY_STATEMENTS_ACCEPTED]: true, requestedDryRun: true };
    const before = JSON.stringify((await StTask.query("")).results);
    const update = await this.call("UPDATE SET status = 'done' WHERE status = 'open'", USER_A, dry);
    assert.deepStrictEqual(update, {
      results: [],
      statement: { type: "UPDATE", changed: 3, skipped: 1, more: false, dryRun: true }
    });
    const deleted = await this.call("DELETE LIMIT 2", ADMIN, dry);
    assert.deepStrictEqual(deleted.statement, { type: "DELETE", changed: 2, skipped: 0, more: true, dryRun: true });
    assert.deepStrictEqual((await this.call("DELETE LIMIT 0", ADMIN, dry)).statement.dryRun, true);
    // The checks still apply
    await assert.rejects(() => this.call("UPDATE SET priority = 'high'", USER_A, dry), /InvalidInput/);
    assert.strictEqual(JSON.stringify((await StTask.query("")).results), before);
    assert.deepStrictEqual(StTask.hooks, []);
  }

  @test
  async compositeKeysAndBatches() {
    const count = STATEMENT_WRITE_BATCH + 50;
    for (let i = 0; i < count; i++) {
      await StPair.create({ a: `a${i}`, b: i % 2 ? "odd" : "even", note: "n" } as any);
    }
    await StPair.create({ a: "a0", b: "odd", note: "same a, other b" } as any);
    const deleteMany = sinon.spy(StPair.getRepository(), "deleteMany");
    const updateMany = sinon.spy(StPair.getRepository(), "updateMany");
    try {
      // A model without field metadata: targets are not checked against its fields
      const updated = await executeModelStatement(
        StPair,
        parseModelStatement("UPDATE SET note = 'updated', extra.flag = TRUE WHERE a = 'a0'"),
        caller(USER_A),
        open()
      );
      assert.deepStrictEqual(updated, {
        results: [],
        statement: { type: "UPDATE", changed: 2, skipped: 0, more: false }
      });
      assert.strictEqual(
        stringifyQuery(updateMany.firstCall.args[0] as any),
        `UPDATE SET note = "updated", extra.flag = TRUE WHERE ( ( a = "a0" AND b = "even" ) OR ( a = "a0" AND b = "odd" ) ) AND a = "a0"`
      );
      const even: any = await StPair.ref({ a: "a0", b: "even" } as any).get();
      assert.deepStrictEqual([even.note, even.extra], ["updated", { flag: true }]);
      // The primary key fields cannot be set
      await assert.rejects(
        () => executeModelStatement(StPair, parseModelStatement("UPDATE SET b = 'x'"), caller(USER_A), open()),
        (err: any) => err instanceof WebdaError.BadRequest && err.message === 'Cannot set "b"'
      );
      // Written by batches of keys
      const deleted = await executeModelStatement(
        StPair,
        parseModelStatement("DELETE WHERE note = 'n'"),
        caller(USER_A),
        open()
      );
      assert.deepStrictEqual(deleted.statement, { type: "DELETE", changed: count - 1, skipped: 0, more: false });
      assert.strictEqual(deleteMany.callCount, 2);
    } finally {
      deleteMany.restore();
      updateMany.restore();
    }
    assert.deepStrictEqual(
      (await StPair.query("")).results.map((row: any) => `${row.a}/${row.b}`),
      ["a0/even", "a0/odd"]
    );
    // The same through the service, in events mode
    this.modes({ "WebdaDemo/StPair": "events" });
    const res = await this.request(USER_A, "PUT", "/st/stPairs", { q: "UPDATE SET note = 'again' WHERE b = 'odd'" });
    assert.deepStrictEqual(res.body.statement, { type: "UPDATE", changed: 1, skipped: 0, more: false });
    assert.strictEqual(((await StPair.ref({ a: "a0", b: "odd" } as any).get()) as any).note, "again");
  }

  @test
  async documentedInTheSchemas() {
    const schema: any = useApplication<Application>().getSchema("WebdaDemo/StTask.queryResult");
    assert.deepStrictEqual(schema.properties.statement, QUERY_STATEMENT_SCHEMA);
    assert.deepStrictEqual(QUERY_STATEMENT_SCHEMA.required, ["type", "changed", "skipped", "more"]);
    assert.match(QUERY_DESCRIPTION, /UPDATE SET a = 1 WHERE \.\.\.` and `DELETE WHERE \.\.\.`/);
    // OpenAPI documents the outcome on the query route
    const routes: any = useRouter().getRoutes();
    const openapi = Object.entries(routes)
      .filter(([url]) => url.startsWith("/st/"))
      .flatMap(([, infos]: [string, any]) => infos)
      .find((info: any) => info.openapi?.put?.operationId === "StTasks.Query").openapi.put;
    assert.deepStrictEqual(
      openapi.responses["200"].content["application/json"].schema.properties.statement,
      QUERY_STATEMENT_SCHEMA
    );
    // The input sanitization the statements share with the Patch operation
    assert.deepStrictEqual(sanitizeModelInput(StTask as any, { role: "x", title: "t" }, caller(USER_A) as any), {
      title: "t"
    });
  }
}
