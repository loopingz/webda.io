import { suite, test } from "@webda/test";
import * as assert from "assert";
import { MemoryRepository, registerRepository, UuidModel } from "@webda/models";
import { QueryValidator } from "@webda/ql";
import * as sinon from "sinon";
import { WebdaApplicationTest } from "../test/index.js";
import { RESTOperationsTransport, RESTOperationsTransportParameters } from "../rest/restoperationstransport.service.js";
import { Router, RouterParameters } from "../rest/router.service.js";
import { useRouter } from "../rest/hooks.js";
import { WebContext } from "../contexts/webcontext.js";
import { HttpContext, HttpMethodType } from "../contexts/httpcontext.js";
import { runWithContext, useContext } from "../contexts/execution.js";
import { SimpleOperationContext } from "../contexts/simplecontext.js";
import { callOperation, registerOperationAuthorizer, unregisterOperationAuthorizer } from "../core/operations.js";
import { Session } from "../session/session.js";
import { useApplication, useModel } from "../application/hooks.js";
import { useDynamicService } from "../core/hooks.js";
import type { Application } from "../application/application.js";
import type { IOperationContext } from "../contexts/icontext.js";
import * as WebdaError from "../errors/errors.js";
import {
  assertFilterOnly,
  assertSelectFields,
  countModelWithPermissions,
  MAX_REFILL_PAGES,
  QUERY_DESCRIPTION,
  QUERY_RESULTS_DESCRIPTION,
  queryModelWithPermissions
} from "../models/permissions.js";
import {
  DEFAULT_HYDRATE_MAX_DEPTH,
  DEFAULT_HYDRATE_MAX_OBJECTS,
  Hydrator,
  hydratedKeyPaths,
  isSelectablePath,
  MAX_HYDRATE_DEPTH,
  planHydration,
  QUERY_HYDRATE_REFUSED
} from "../models/hydration.js";
import { DomainService, DomainServiceParameters } from "./domainservice.service.js";

/**
 * A user: hidden users are only read by "admin", and `email` is only shown to "admin" (per-caller `toDTO()`)
 */
class HydUser extends UuidModel {
  name: string;
  email?: string;
  hidden?: boolean;
  team?: string;

  static canAct(context: IOperationContext, _action: string, object?: HydUser): boolean | string {
    return object === undefined || !object.hidden || context.getCurrentUserId() === "admin" ? true : "hidden user";
  }

  toDTO(): any {
    const dto: any = super.toDTO();
    if (useContext().getCurrentUserId() !== "admin") {
      delete dto.email;
    }
    return dto;
  }
}

/**
 * A team: secret teams are read by nobody
 */
class HydTeam extends UuidModel {
  name: string;
  secret?: boolean;
  parentTeam?: string;

  static canAct(_context: IOperationContext, _action: string, object?: HydTeam): boolean {
    return !object?.secret;
  }
}

/**
 * A project, open to everyone, without Output schema metadata
 */
class HydProject extends UuidModel {
  name: string;
  team?: string;

  static canAct(): boolean {
    return true;
  }
}

/**
 * A tag, open to everyone
 */
class HydTag extends UuidModel {
  name: string;

  static canAct(): boolean {
    return true;
  }
}

/**
 * A model without any canAct: never read by a client
 */
class HydBadge extends UuidModel {
  name: string;
}

/**
 * The queried model: one relation of each kind, stored as their keys like the relation classes serialize them
 */
class HydTask extends UuidModel {
  title: string;
  /** LINK */
  owner?: string;
  /** Parent */
  project?: string;
  /** LINKS_SIMPLE_ARRAY */
  tags?: string[];
  /** LINKS_ARRAY: link objects holding the key and link data */
  members?: { uuid: string; role: string; name?: string }[];
  /** LINKS_MAP: link data by key */
  labels?: Record<string, { color?: string; name?: string }>;
  /** LINK to a model without canAct */
  badge?: string;

  static canAct(): boolean {
    return true;
  }

  static getPermissionQuery(): { query: string; partial: boolean } {
    return { query: "", partial: false };
  }
}

/**
 * A subclass with a relation of its own: its rows come back from the queries on HydTask
 */
class HydSubTask extends HydTask {
  /** LINK */
  reviewer?: string;
}

HydUser.registerSerializer();
HydTeam.registerSerializer();
HydProject.registerSerializer();
HydTag.registerSerializer();
HydBadge.registerSerializer();
HydTask.registerSerializer();
HydSubTask.registerSerializer();

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

/**
 * A link of `Metadata.Relations.links`
 * @param attribute - the attribute
 * @param model - the related model short name
 * @param type - the link type
 * @returns the link
 */
function link(attribute: string, model: string, type: string = "LINK"): any {
  return { attribute, model: `WebdaDemo/${model}`, type };
}

/**
 * An Output schema listing some fields
 * @param fields - the field names
 * @returns the schemas of a model
 */
function output(...fields: string[]): any {
  return { Output: { type: "object", properties: Object.fromEntries(fields.map(field => [field, {}])) } };
}

const TASK_RELATIONS = {
  parent: { attribute: "project", model: "WebdaDemo/HydProject" },
  links: [
    link("owner", "HydUser"),
    link("tags", "HydTag", "LINKS_SIMPLE_ARRAY"),
    link("members", "HydUser", "LINKS_ARRAY"),
    link("labels", "HydTag", "LINKS_MAP"),
    link("badge", "HydBadge")
  ]
};
const TASK_FIELDS = ["title", "owner", "project", "tags", "members", "labels", "badge"];

const USER_A = "user-a";

/**
 * HYDRATE in client queries: `queryModelWithPermissions` and the Query operation of the DomainService
 */
@suite
class DomainServiceHydrateTest extends WebdaApplicationTest {
  getTestConfiguration(): string | undefined {
    return process.cwd() + "/../../sample-app";
  }

  protected async buildWebda() {
    const core = await super.buildWebda();
    core.getBeans = () => {};
    core.registerBeans = () => {};
    const app = useApplication<Application>();
    app.addModel(
      "WebdaDemo/HydUser",
      HydUser,
      metadata("HydUser", {
        Relations: { links: [link("team", "HydTeam")] },
        Schemas: output("name", "email", "hidden", "team")
      })
    );
    app.addModel(
      "WebdaDemo/HydTeam",
      HydTeam,
      metadata("HydTeam", {
        Relations: { links: [link("parentTeam", "HydTeam")] },
        Schemas: output("name", "secret", "parentTeam")
      })
    );
    app.addModel(
      "WebdaDemo/HydProject",
      HydProject,
      metadata("HydProject", { Relations: { links: [link("team", "HydTeam")] } })
    );
    app.addModel("WebdaDemo/HydTag", HydTag, metadata("HydTag", { Schemas: output("name") }));
    app.addModel("WebdaDemo/HydBadge", HydBadge, metadata("HydBadge"));
    app.addModel(
      "WebdaDemo/HydSubTask",
      HydSubTask,
      metadata("HydSubTask", {
        Relations: { ...TASK_RELATIONS, links: [...TASK_RELATIONS.links, link("reviewer", "HydUser")] },
        Schemas: output(...TASK_FIELDS, "reviewer")
      })
    );
    app.addModel(
      "WebdaDemo/HydTask",
      HydTask,
      metadata("HydTask", { Relations: TASK_RELATIONS, Schemas: output(...TASK_FIELDS), Subclasses: [HydSubTask] })
    );
    const router = new Router("Router", new RouterParameters().load({}));
    this.registerService(router);
    router.resolve();
    await router.init();
    return core;
  }

  async beforeAll(init: boolean = true) {
    await super.beforeAll(init);
    const transport = new RESTOperationsTransport(
      "HydTransport",
      new RESTOperationsTransportParameters().load({ url: "/hyd/", exposeOpenAPI: false })
    );
    this.registerService(transport);
    transport.resolve();
    await transport.init();
  }

  async beforeEach() {
    await super.beforeEach();
    for (const model of [HydUser, HydTeam, HydProject, HydTag, HydBadge]) {
      registerRepository(model, new MemoryRepository(model as any, ["uuid"]) as any);
    }
    // One storage for the hierarchy: subclass rows come back from the queries on HydTask, typed with their class
    const storage = new Map<string, string>();
    registerRepository(HydTask, new MemoryRepository(HydTask, ["uuid"], undefined, storage));
    registerRepository(HydSubTask, new MemoryRepository(HydSubTask, ["uuid"], undefined, storage));
    await HydUser.create({ uuid: "u1", name: "Ada", email: "ada@test", team: "t1" } as any);
    await HydUser.create({ uuid: "u2", name: "Bob", email: "bob@test", hidden: true } as any);
    await HydTeam.create({ uuid: "t0", name: "Root" } as any);
    await HydTeam.create({ uuid: "t1", name: "Core", parentTeam: "t0" } as any);
    await HydTeam.create({ uuid: "t2", name: "Secret", secret: true } as any);
    await HydProject.create({ uuid: "p1", name: "Apollo", team: "t1" } as any);
    await HydProject.create({ uuid: "p2", name: "Zeus", team: "t2" } as any);
    await HydProject.create({ uuid: "p3", name: "Orphan" } as any);
    await HydTag.create({ uuid: "g1", name: "red" } as any);
    await HydTag.create({ uuid: "g2", name: "blue" } as any);
    await HydBadge.create({ uuid: "b1", name: "gold" } as any);
    await HydTask.create({
      uuid: "k1",
      title: "One",
      owner: "u1",
      project: "p1",
      tags: ["g1", "gone", "g2"],
      members: [
        { uuid: "u1", role: "lead", name: "link data" },
        { uuid: "u2", role: "dev" }
      ],
      labels: { g1: { color: "c1", name: "link data" }, gone: { color: "c2" } },
      badge: "b1"
    } as any);
    await HydTask.create({
      uuid: "k2",
      title: "Two",
      // Hidden user, project of a secret team, missing tag
      owner: "u2",
      project: "p2",
      tags: ["gone"],
      members: [{ uuid: "u2", role: "dev" }],
      labels: { gone: {} }
    } as any);
    // Missing owner, project without team, empty collection
    await HydTask.create({ uuid: "k3", title: "Three", owner: "u3", project: "p3", tags: [] } as any);
    // No relation set
    await HydTask.create({ uuid: "k4", title: "Four" } as any);
    await HydSubTask.create({ uuid: "s1", title: "Sub", owner: "u1", project: "p1", reviewer: "u1" } as any);
  }

  /**
   * Query the tasks as a caller, without the DomainService
   * @param q - the query
   * @param user - the caller id
   * @param options - query options
   * @returns the results, as the JSON a client receives
   */
  async run(q: string, user: string = USER_A, options?: any): Promise<any[]> {
    const context: any = { getCurrentUserId: () => user };
    const res = await queryModelWithPermissions(HydTask, q, context, options);
    return runWithContext(context, () => JSON.parse(JSON.stringify(res.results)));
  }

  /**
   * Assert that a query is refused with a 400
   * @param q - the query
   * @param message - the expected message
   * @param options - query options
   * @param model - the queried model
   */
  async refused(q: string, message: string, options?: any, model: any = HydTask): Promise<void> {
    await assert.rejects(
      () => queryModelWithPermissions(model, q, { getCurrentUserId: () => USER_A } as any, options),
      (err: any) => err instanceof WebdaError.BadRequest && err.message === message,
      `${q}: expected "${message}"`
    );
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
   * Call the Query operation of the tasks like gRPC and MCP do: `callOperation` with a non-HTTP context
   * @param query - the query
   * @param user - the caller id
   * @param extensions - context extensions set by the transport
   * @returns the operation output
   */
  async call(query: string, user: string = USER_A, extensions: Record<string, any> = {}): Promise<any> {
    const ctx = new SimpleOperationContext();
    await ctx.init();
    const session = new Session();
    session.login(user, user);
    ctx.setSession(session);
    ctx.setInput(Buffer.from(JSON.stringify({ query })));
    ctx.setParameters({ query });
    Object.entries(extensions).forEach(([key, value]) => ctx.setExtension(key, value));
    await callOperation(ctx, "HydTasks.Query");
    return JSON.parse(<string>ctx.getOutput());
  }

  @test
  async leftIsTheDefault() {
    const ada = { uuid: "u1", name: "Ada", team: "t1" };
    // The related object replaces its key, in its public form as the caller: `email` is only shown to admin
    assert.deepStrictEqual(await this.run("HYDRATE owner ORDER BY uuid ASC"), [
      {
        uuid: "k1",
        title: "One",
        owner: ada,
        project: "p1",
        tags: ["g1", "gone", "g2"],
        members: [
          { uuid: "u1", role: "lead", name: "link data" },
          { uuid: "u2", role: "dev" }
        ],
        labels: { g1: { color: "c1", name: "link data" }, gone: { color: "c2" } },
        badge: "b1"
      },
      // Unreadable (hidden user) and missing: both null, and every row is kept
      {
        uuid: "k2",
        title: "Two",
        owner: null,
        project: "p2",
        tags: ["gone"],
        members: [{ uuid: "u2", role: "dev" }],
        labels: { gone: {} }
      },
      { uuid: "k3", title: "Three", owner: null, project: "p3", tags: [] },
      // Unset: left as it is
      { uuid: "k4", title: "Four" },
      { uuid: "s1", title: "Sub", owner: ada, project: "p1", reviewer: "u1" }
    ]);
    // LEFT is the same query
    assert.deepStrictEqual(
      await this.run("HYDRATE owner LEFT ORDER BY uuid ASC"),
      await this.run("HYDRATE owner ORDER BY uuid ASC")
    );
    // Another caller, other rules: admin reads the hidden user, and the emails
    const admin = await this.run("HYDRATE owner ORDER BY uuid ASC", "admin");
    assert.deepStrictEqual(
      admin.map(row => row.owner),
      [
        { ...ada, email: "ada@test" },
        { uuid: "u2", name: "Bob", email: "bob@test", hidden: true },
        null,
        undefined,
        { ...ada, email: "ada@test" }
      ]
    );
    // A hidden object and a missing one cannot be told apart, with any filter
    const hidden = (await this.run("uuid = 'k2' HYDRATE owner"))[0];
    const missing = (await this.run("uuid = 'k3' HYDRATE owner"))[0];
    assert.strictEqual(hidden.owner, null);
    assert.strictEqual(missing.owner, null);
    assert.doesNotMatch(JSON.stringify(await this.run("HYDRATE owner, members")), /Bob|bob@test/);
    // A related model without canAct is denied by default, even though the object exists
    assert.deepStrictEqual((await this.run("uuid = 'k1' HYDRATE badge"))[0].badge, null);
    assert.ok(await HydBadge.ref("b1").get());
    // The stored rows are untouched
    assert.strictEqual(((await HydTask.ref("k1").get()) as any).owner, "u1");
  }

  @test
  async shapesOfEachRelationKind() {
    const [task] = await this.run("uuid = 'k1' HYDRATE owner, project, tags, members, labels, badge");
    assert.deepStrictEqual(task, {
      uuid: "k1",
      title: "One",
      // LINK and parent: the object
      owner: { uuid: "u1", name: "Ada", team: "t1" },
      project: { uuid: "p1", name: "Apollo", team: "t1" },
      // Array of keys: positions are kept
      tags: [{ uuid: "g1", name: "red" }, null, { uuid: "g2", name: "blue" }],
      // Array of link objects: the object merged over the link data, its fields win (`name`)
      members: [{ uuid: "u1", role: "lead", name: "Ada", team: "t1" }, null],
      // Map of link data: the same merge, map keys are kept
      labels: { g1: { color: "c1", name: "red", uuid: "g1" }, gone: null },
      badge: null
    });
    // Admin reads the hidden member
    const [admin] = await this.run("uuid = 'k1' HYDRATE members", "admin");
    assert.deepStrictEqual(admin.members, [
      { uuid: "u1", role: "lead", name: "Ada", team: "t1", email: "ada@test" },
      { uuid: "u2", role: "dev", name: "Bob", email: "bob@test", hidden: true }
    ]);
    // A relation only a subclass holds: hydrated on its rows, the others are left as they are
    const rows = await this.run("HYDRATE reviewer ORDER BY uuid ASC");
    assert.deepStrictEqual(rows.find(row => row.uuid === "s1").reviewer, { uuid: "u1", name: "Ada", team: "t1" });
    assert.ok(rows.filter(row => row.uuid !== "s1").every(row => !("reviewer" in row)));
    assert.deepStrictEqual(
      (await this.run("HYDRATE reviewer INNER")).map(row => row.uuid),
      ["s1"]
    );
    // A value that does not have the shape of its relation is left as it is (LEFT), or drops the row (INNER)
    await HydTask.create({
      uuid: "odd",
      title: "Odd",
      tags: "g1",
      labels: ["g1"],
      owner: true,
      members: ["u1", 3]
    } as any);
    const [odd] = await this.run("uuid = 'odd' HYDRATE tags, labels, owner, members");
    assert.deepStrictEqual(odd, {
      uuid: "odd",
      title: "Odd",
      tags: "g1",
      labels: ["g1"],
      owner: null,
      members: [{ uuid: "u1", name: "Ada", team: "t1" }, null]
    });
    for (const relation of ["tags", "labels", "owner"]) {
      assert.deepStrictEqual(await this.run(`uuid = 'odd' HYDRATE ${relation} INNER`), [], relation);
    }
    // An array of link objects that is not an array, and a map entry without link data
    await HydTask.create({ uuid: "odd2", title: "Odd", members: "u1", labels: { g1: "no data" } } as any);
    const [odd2] = await this.run("uuid = 'odd2' HYDRATE members, labels");
    assert.deepStrictEqual(odd2, {
      uuid: "odd2",
      title: "Odd",
      members: "u1",
      labels: { g1: { uuid: "g1", name: "red" } }
    });
  }

  @test
  async innerDropsTheResult() {
    const uuids = async (q: string, user?: string) => (await this.run(q, user)).map(row => row.uuid);
    // A single relation: unset (k4), missing (k3) and unreadable (k2) drop the row
    assert.deepStrictEqual(await uuids("HYDRATE owner INNER ORDER BY uuid ASC"), ["k1", "s1"]);
    assert.deepStrictEqual(await uuids("HYDRATE owner INNER ORDER BY uuid ASC", "admin"), ["k1", "k2", "s1"]);
    assert.deepStrictEqual(await uuids("HYDRATE badge INNER"), []);
    // The filter still applies
    assert.deepStrictEqual(await uuids("title = 'Sub' HYDRATE owner INNER"), ["s1"]);
    // A collection: the missing and unreadable entries are dropped, and the row when no entry is left
    assert.deepStrictEqual(await this.run("SELECT tags HYDRATE tags INNER"), [
      {
        uuid: "k1",
        tags: [
          { uuid: "g1", name: "red" },
          { uuid: "g2", name: "blue" }
        ]
      }
    ]);
    assert.deepStrictEqual(await this.run("SELECT members HYDRATE members INNER"), [
      { uuid: "k1", members: [{ uuid: "u1", role: "lead", name: "Ada", team: "t1" }] }
    ]);
    assert.deepStrictEqual(await this.run("SELECT labels HYDRATE labels INNER"), [
      { uuid: "k1", labels: { g1: { color: "c1", name: "red", uuid: "g1" } } }
    ]);
    assert.deepStrictEqual(await uuids("HYDRATE members INNER ORDER BY uuid ASC", "admin"), ["k1", "k2"]);
    // Modes are per relation
    assert.deepStrictEqual(await uuids("HYDRATE owner INNER, tags ORDER BY uuid ASC"), ["k1", "s1"]);
    assert.deepStrictEqual(await uuids("HYDRATE owner, tags INNER ORDER BY uuid ASC"), ["k1"]);
  }

  @test
  async nestedPaths() {
    const projects = async (q: string) =>
      Object.fromEntries((await this.run(`${q} ORDER BY uuid ASC`)).map(row => [row.uuid, row.project]));
    const apollo = { uuid: "p1", name: "Apollo", team: { uuid: "t1", name: "Core", parentTeam: "t0" } };
    // A child path implies its parent, in LEFT mode
    assert.deepStrictEqual(await projects("HYDRATE project.team"), {
      k1: apollo,
      // The team is secret: null inside its project
      k2: { uuid: "p2", name: "Zeus", team: null },
      // No team: left unset
      k3: { uuid: "p3", name: "Orphan" },
      k4: undefined,
      s1: apollo
    });
    assert.deepStrictEqual(await projects("HYDRATE project, project.team"), await projects("HYDRATE project.team"));
    assert.deepStrictEqual(await projects("HYDRATE project.team, project"), await projects("HYDRATE project.team"));
    // INNER below a LEFT parent: a project whose team fails counts as missing, and its own mode keeps the row
    assert.deepStrictEqual(await projects("HYDRATE project.team INNER"), {
      k1: apollo,
      k2: null,
      k3: null,
      k4: undefined,
      s1: apollo
    });
    // INNER on both levels: the row is dropped
    assert.deepStrictEqual(await projects("HYDRATE project INNER, project.team INNER"), { k1: apollo, s1: apollo });
    assert.deepStrictEqual(await projects("HYDRATE project.team INNER, project INNER"), { k1: apollo, s1: apollo });
    // INNER on the parent only: its missing team is null
    assert.deepStrictEqual(Object.keys(await projects("HYDRATE project INNER, project.team")), [
      "k1",
      "k2",
      "k3",
      "s1"
    ]);
    // Inside a collection: an entry refused by its own INNER relation is a null entry
    await HydUser.create({ uuid: "u4", name: "Cy" } as any);
    await HydTask.create({
      uuid: "k5",
      title: "Five",
      members: [
        { uuid: "u1", role: "a" },
        { uuid: "u4", role: "b" }
      ]
    } as any);
    const members = async (q: string) => (await this.run(`uuid = 'k5' ${q}`)).map(row => row.members);
    const ada = { uuid: "u1", role: "a", name: "Ada", team: { uuid: "t1", name: "Core", parentTeam: "t0" } };
    assert.deepStrictEqual(await members("HYDRATE members.team"), [[ada, { uuid: "u4", role: "b", name: "Cy" }]]);
    assert.deepStrictEqual(await members("HYDRATE members.team INNER"), [[ada, null]]);
    assert.deepStrictEqual(await members("HYDRATE members INNER, members.team INNER"), [[ada]]);
    // Three levels, when the limit allows it
    const [deep] = await this.run("uuid = 'k1' HYDRATE project.team.parentTeam", USER_A, { hydrate: { maxDepth: 3 } });
    assert.deepStrictEqual(deep.project.team, { uuid: "t1", name: "Core", parentTeam: { uuid: "t0", name: "Root" } });
  }

  @test
  async eachObjectIsLoadedOnce() {
    const spy = sinon.spy(HydUser.getRepository(), "get");
    const teams = sinon.spy(HydTeam.getRepository(), "get");
    try {
      // u1 is the owner of two tasks, a member and a reviewer; u2 an owner and a member twice; u3 is missing
      await this.run("HYDRATE owner, members, reviewer, owner.team, project.team");
      assert.deepStrictEqual(
        spy
          .getCalls()
          .map(call => String(call.args[0]))
          .sort(),
        ["u1", "u2", "u3"]
      );
      // t1 is reached through two paths and several rows; t2 is read once, and refused
      assert.deepStrictEqual(
        teams
          .getCalls()
          .map(call => String(call.args[0]))
          .sort(),
        ["t1", "t2"]
      );
    } finally {
      spy.restore();
      teams.restore();
    }
  }

  @test
  async limits() {
    // Depth, before any store read
    const spy = sinon.spy(HydTask.getRepository(), "query");
    try {
      await this.refused("HYDRATE project.team.parentTeam", 'HYDRATE "project.team.parentTeam" is deeper than 2');
      await this.refused("HYDRATE a.b.c", 'HYDRATE "a.b.c" is deeper than 2');
      await this.refused("HYDRATE project.team", 'HYDRATE "project.team" is deeper than 1', {
        hydrate: { maxDepth: 1 }
      });
      // The limit itself is bounded
      await this.refused("HYDRATE a.b.c.d.e.f", 'HYDRATE "a.b.c.d.e.f" is deeper than 5', {
        hydrate: { maxDepth: 99 }
      });
      await this.refused("HYDRATE project.team", 'HYDRATE "project.team" is deeper than 1', {
        hydrate: { maxDepth: 0 }
      });
      assert.strictEqual(spy.callCount, 0);
    } finally {
      spy.restore();
    }
    assert.strictEqual(DEFAULT_HYDRATE_MAX_DEPTH, 2);
    assert.strictEqual(MAX_HYDRATE_DEPTH, 5);
    assert.strictEqual(DEFAULT_HYDRATE_MAX_OBJECTS, 1000);
    // Distinct related objects: u1, u2 and the missing u3 are three
    const budget = "HYDRATE loads more than 2 objects: lower LIMIT or HYDRATE fewer relations";
    await this.refused("HYDRATE owner", budget, { hydrate: { maxObjects: 2 } });
    assert.strictEqual((await this.run("HYDRATE owner", USER_A, { hydrate: { maxObjects: 3 } })).length, 5);
    // A lower LIMIT fits
    assert.strictEqual(
      (await this.run("HYDRATE owner ORDER BY uuid ASC LIMIT 2", USER_A, { hydrate: { maxObjects: 2 } })).length,
      2
    );
    // Counted over the whole request, every level
    await this.refused("uuid = 'k1' HYDRATE owner, owner.team, project", budget, { hydrate: { maxObjects: 2 } });
    await this.refused("HYDRATE owner", "HYDRATE loads more than 1 objects: lower LIMIT or HYDRATE fewer relations", {
      hydrate: { maxObjects: 0 }
    });
  }

  @test
  async errors() {
    const spy = sinon.spy(HydTask.getRepository(), "query");
    try {
      for (const [q, message] of [
        // Not a relation, unknown, or through something that is not a relation
        ["HYDRATE title", 'Cannot hydrate "title"'],
        ["HYDRATE nope", 'Cannot hydrate "nope"'],
        ["HYDRATE owner.name", 'Cannot hydrate "owner.name"'],
        ["HYDRATE owner, project.nope", 'Cannot hydrate "project.nope"'],
        ["HYDRATE title.owner", 'Cannot hydrate "title.owner"'],
        // A relation of another model
        ["HYDRATE team", 'Cannot hydrate "team"'],
        // Members of Object.prototype are not relations
        ["HYDRATE constructor", 'Cannot hydrate "constructor"'],
        ["HYDRATE owner.prototype", 'Cannot hydrate "owner.prototype"'],
        ["HYDRATE toString", 'Cannot hydrate "toString"'],
        // Private fields
        ["HYDRATE __secret", "Private fields cannot be queried"],
        ["HYDRATE owner.__proto__", "Private fields cannot be queried"],
        // Duplicates
        ["HYDRATE owner, owner", 'HYDRATE lists "owner" more than once'],
        ["HYDRATE owner, project, owner INNER", 'HYDRATE lists "owner" more than once'],
        // Statements and aggregations stay refused
        ["SELECT owner.name", 'Unknown field "owner.name"']
      ]) {
        await this.refused(q, message);
      }
      assert.strictEqual(spy.callCount, 0, "a refused query never reaches the store");
      // The store never receives the clause
      await this.run("title = 'One' HYDRATE owner INNER");
      assert.ok(spy.callCount > 0);
      spy.getCalls().forEach(call => assert.doesNotMatch(String(call.args[0]), /HYDRATE|INNER/));
    } finally {
      spy.restore();
    }
    for (const q of ["HYDRATE", "HYDRATE owner RIGHT", "DELETE HYDRATE owner", "SELECT COUNT(*) AS n HYDRATE owner"]) {
      await assert.rejects(() => this.run(q), SyntaxError, q);
    }
    // Reverse relations (ModelRelated), maps, polymorphic links, binaries and behaviors cannot be hydrated
    const Company: any = useModel("WebdaDemo/Company");
    await this.refused("HYDRATE users", 'Cannot hydrate "users"', undefined, Company);
    class Unhydratable {
      static canAct(): boolean {
        return true;
      }
      static Metadata = {
        Identifier: "WebdaDemo/Unhydratable",
        Relations: {
          links: [
            { attribute: "odd", model: "WebdaDemo/HydUser", type: "OTHER" },
            { attribute: "ghost", model: "WebdaDemo/NoSuchModel", type: "LINK" },
            { attribute: "user", model: "WebdaDemo/HydUser", type: "LINK" }
          ],
          queries: [{ attribute: "children", model: "WebdaDemo/HydTask", targetAttribute: "owner" }],
          maps: [{ attribute: "names", model: "WebdaDemo/HydUser", targetAttributes: ["name"], targetLink: "x" }],
          polymorphicLinks: [{ attribute: "subject" }],
          binaries: [{ attribute: "file", cardinality: "ONE" }],
          behaviors: [{ attribute: "mfa", behavior: "Webda/MFA" }]
        }
      };
      static query = async () => ({ results: [{ uuid: "x", user: "u1", canAct: () => true }] });
    }
    for (const attribute of ["children", "names", "subject", "file", "mfa", "odd", "ghost"]) {
      await this.refused(`HYDRATE ${attribute}`, `Cannot hydrate "${attribute}"`, undefined, Unhydratable);
    }
    // A plain row of a class without metadata of its own is hydrated through the first relation found
    const res = await queryModelWithPermissions(Unhydratable, "HYDRATE user", {
      getCurrentUserId: () => USER_A
    } as any);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(res.results)), [
      { uuid: "x", user: { uuid: "u1", name: "Ada", team: "t1" } }
    ]);
    // A model without metadata has no relation, and one without canAct still checks its query
    await this.refused("HYDRATE owner", 'Cannot hydrate "owner"', undefined, { prototype: { canAct: () => true } });
    await this.refused("HYDRATE nope", 'Cannot hydrate "nope"', undefined, HydBadge);
    assert.deepStrictEqual(
      await queryModelWithPermissions(HydBadge, "HYDRATE nope", { getCurrentUserId: () => USER_A } as any).catch(
        () => "refused"
      ),
      "refused"
    );
    // The transports that return or store whole objects refuse the clause
    assert.throws(
      () => assertFilterOnly(new QueryValidator("title = 'x' HYDRATE owner")),
      (err: any) => err instanceof WebdaError.BadRequest && err.message === "HYDRATE is not accepted by queries"
    );
    assertFilterOnly(new QueryValidator("hydrate = 1"));
    await this.refused("HYDRATE owner", "not here", { hydrate: { refused: "not here" } });
    assert.strictEqual((await this.run("title = 'One'", USER_A, { hydrate: { refused: "not here" } })).length, 1);
  }

  @test
  async withAFieldList() {
    // The field list is applied after hydration, and keeps the primary key of the hydrated objects it goes through
    assert.deepStrictEqual(await this.run("SELECT title, owner.name WHERE uuid = 'k1' HYDRATE owner"), [
      { uuid: "k1", title: "One", owner: { uuid: "u1", name: "Ada" } }
    ]);
    assert.deepStrictEqual(await this.run("SELECT owner.name, title HYDRATE owner INNER ORDER BY uuid DESC LIMIT 1"), [
      { uuid: "s1", title: "Sub", owner: { uuid: "u1", name: "Ada" } }
    ]);
    // Without HYDRATE the relation holds a key: it has no sub-field
    await this.refused("SELECT title, owner.name", 'Unknown field "owner.name"');
    await this.refused("SELECT tags.name", 'Unknown field "tags.name"');
    await this.refused("SELECT project.name WHERE uuid = 'k1' HYDRATE owner", 'Unknown field "project.name"');
    // Link objects carry data: their paths are read as before
    assert.deepStrictEqual(await this.run("SELECT members.role, labels.g1.color WHERE uuid = 'k1'"), [
      { uuid: "k1", members: [{ role: "lead" }, { role: "dev" }], labels: { g1: { color: "c1" } } }
    ]);
    // Through a hydrated relation: the fields a client can see of the related model
    await this.refused("SELECT owner.nope HYDRATE owner", 'Unknown field "owner.nope"');
    await this.refused("SELECT owner.team.name HYDRATE owner", 'Unknown field "owner.team.name"');
    await this.refused("SELECT owner.team.nope HYDRATE owner.team", 'Unknown field "owner.team.nope"');
    await this.refused("SELECT owner.constructor HYDRATE owner", 'Unknown field "owner.constructor"');
    await this.refused("SELECT owner.__hash HYDRATE owner", "Private fields cannot be queried");
    assert.deepStrictEqual(await this.run("SELECT owner.uuid, owner.team.name WHERE uuid = 'k1' HYDRATE owner.team"), [
      { uuid: "k1", owner: { uuid: "u1", team: { uuid: "t1", name: "Core" } } }
    ]);
    // A related model without Output schema metadata is not checked: unknown paths are absent
    assert.deepStrictEqual(await this.run("SELECT project.name, project.nope WHERE uuid = 'k1' HYDRATE project"), [
      { uuid: "k1", project: { uuid: "p1", name: "Apollo" } }
    ]);
    // What toDTO() hides from the caller stays hidden when selected
    assert.deepStrictEqual(await this.run("SELECT owner.email WHERE uuid = 'k1' HYDRATE owner"), [
      { uuid: "k1", owner: { uuid: "u1" } }
    ]);
    assert.deepStrictEqual(await this.run("SELECT owner.email WHERE uuid = 'k1' HYDRATE owner", "admin"), [
      { uuid: "k1", owner: { uuid: "u1", email: "ada@test" } }
    ]);
    // A null relation: kept when the relation is selected whole, absent when a path goes through it
    assert.deepStrictEqual(await this.run("SELECT owner WHERE uuid = 'k2' HYDRATE owner"), [
      { uuid: "k2", owner: null }
    ]);
    assert.deepStrictEqual(await this.run("SELECT owner.name WHERE uuid = 'k2' HYDRATE owner"), [{ uuid: "k2" }]);
    // Collections: each hydrated entry is projected; a null entry has no field to keep
    assert.deepStrictEqual(await this.run("SELECT tags.name, members.role WHERE uuid = 'k1' HYDRATE tags, members"), [
      {
        uuid: "k1",
        tags: [
          { uuid: "g1", name: "red" },
          { uuid: "g2", name: "blue" }
        ],
        members: [{ uuid: "u1", role: "lead" }]
      }
    ]);
    // A hydrated map is read through its keys
    assert.deepStrictEqual(await this.run("SELECT labels.g1.name WHERE uuid = 'k1' HYDRATE labels"), [
      { uuid: "k1", labels: { g1: { name: "red" } } }
    ]);
    // A relation hydrated but not selected only filters (INNER)
    assert.deepStrictEqual(await this.run("SELECT title HYDRATE owner INNER ORDER BY uuid ASC"), [
      { uuid: "k1", title: "One" },
      { uuid: "s1", title: "Sub" }
    ]);
    // A field of a subclass, hydrated
    assert.deepStrictEqual(await this.run("SELECT reviewer.name HYDRATE reviewer INNER"), [
      { uuid: "s1", reviewer: { uuid: "u1", name: "Ada" } }
    ]);
  }

  @test
  async selectHelpers() {
    const plan = (q: string) => planHydration(HydTask, new QueryValidator(q));
    assert.strictEqual(plan("title = 'x'"), undefined);
    const hydration = plan("HYDRATE owner INNER, project.team, labels");
    assert.strictEqual(hydration.inner, true);
    assert.strictEqual(hydration.clause, "owner INNER, project.team, labels");
    assert.deepStrictEqual(
      hydration.nodes.map(node => [node.attribute, node.mode, node.children.map(child => child.attribute)]),
      [
        ["owner", "INNER", []],
        ["project", "LEFT", ["team"]],
        ["labels", "LEFT", []]
      ]
    );
    // The relation is known for the model and its subclass
    assert.deepStrictEqual(
      hydration.nodes[0].targets.map(target => [target.owner, target.kind, target.model]),
      [
        [HydTask, "LINK", HydUser],
        [HydSubTask, "LINK", HydUser]
      ]
    );
    assert.strictEqual(plan("HYDRATE owner, tags").inner, false);
    assert.deepStrictEqual(
      hydratedKeyPaths(hydration, ["title", "owner", "owner.name", "project.team.name", "labels.g1.name", "tags.name"]),
      ["owner.uuid", "project.uuid", "project.team.uuid"]
    );
    const classes = [HydTask, HydSubTask];
    assert.strictEqual(isSelectablePath(classes, hydration.nodes, ["owner"]), true);
    assert.strictEqual(isSelectablePath(classes, hydration.nodes, ["owner", "name"]), true);
    assert.strictEqual(isSelectablePath(classes, hydration.nodes, ["owner", "nope"]), false);
    assert.strictEqual(isSelectablePath(classes, hydration.nodes, ["labels", "anything", "at", "all"]), true);
    assert.strictEqual(isSelectablePath(classes, [], ["owner", "name"]), false);
    assert.strictEqual(isSelectablePath(classes, [], ["members", "role"]), true);
    assert.strictEqual(isSelectablePath(classes, [], ["title", "sub"]), true);
    // assertSelectFields without a HYDRATE clause still checks the relations
    assert.throws(
      () => assertSelectFields(HydTask, new QueryValidator("SELECT owner.name")),
      /Unknown field "owner.name"/
    );
    assertSelectFields(HydTask, new QueryValidator("SELECT owner.name HYDRATE owner"), plan("HYDRATE owner"));
  }

  @test
  async hydratorOnPlainRows() {
    // Rows without toDTO(), a public form that is not an object, and a relation whose toDTO() is not one either
    const hydration = planHydration(HydTask, new QueryValidator("HYDRATE owner INNER"));
    const loaded: any[] = [];
    const hydrator = new Hydrator(hydration, { getCurrentUserId: () => USER_A } as any, async (model, key) => {
      loaded.push([model, key]);
      return key === "scalar"
        ? { toDTO: () => "not an object" }
        : key === "plain"
          ? { uuid: "plain", name: "P" }
          : undefined;
    });
    const row = { uuid: "r1", owner: "plain" };
    assert.deepStrictEqual(
      await hydrator.hydrate([
        row,
        { uuid: "r2", owner: "scalar" },
        { toDTO: () => "text" },
        { uuid: "r3", owner: { uuid: "plain" } }
      ]),
      [
        { uuid: "r1", owner: { uuid: "plain", name: "P" } },
        { uuid: "r3", owner: { uuid: "plain", name: "P" } }
      ]
    );
    assert.deepStrictEqual(loaded, [
      [HydUser, "plain"],
      [HydUser, "scalar"]
    ]);
    // The row itself is not changed
    assert.deepStrictEqual(row, { uuid: "r1", owner: "plain" });
    // An instance of a class that does not hold the relation is left as it is
    const left = new Hydrator(
      planHydration(HydTask, new QueryValidator("HYDRATE owner")),
      {} as any,
      async () => undefined
    );
    const team = Object.assign(new HydTeam(), { uuid: "t9", owner: "u1" });
    assert.deepStrictEqual(await left.hydrate([team, "text"]), [{ uuid: "t9", owner: "u1" }, "text"]);
  }

  @test
  async compositeKeys() {
    class Pair {
      static canAct(): boolean {
        return true;
      }
      static Metadata = { Identifier: "WebdaDemo/Pair", PrimaryKey: ["a", "b"], Relations: {} };
      static seen: any[] = [];
      static ref(key: any) {
        Pair.seen.push(key);
        const found = typeof key === "object" && key.b !== "missing";
        return { get: async () => (found ? { ...key, label: `${key.a}-${key.b}` } : undefined) };
      }
    }
    class Holder {
      static canAct(): boolean {
        return true;
      }
      static Metadata = {
        Identifier: "WebdaDemo/Holder",
        Relations: {
          links: [
            { attribute: "pair", model: "WebdaDemo/Pair", type: "LINK" },
            { attribute: "pairs", model: "WebdaDemo/Pair", type: "LINKS_ARRAY" }
          ]
        }
      };
      static query = async () => ({
        results: [
          {
            uuid: "h1",
            pair: { a: "x", b: "y" },
            pairs: [{ a: "x", b: "y", note: "n" }, { a: "x" }, { a: "x", b: "missing" }],
            canAct: () => true
          },
          { uuid: "h2", pair: "not a composite key", canAct: () => true }
        ]
      });
    }
    const app = useApplication<Application>();
    app.addModel("WebdaDemo/Pair", Pair, Pair.Metadata as any);
    const res = await queryModelWithPermissions(Holder, "HYDRATE pair, pairs", {
      getCurrentUserId: () => USER_A
    } as any);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(res.results)), [
      {
        uuid: "h1",
        pair: { a: "x", b: "y", label: "x-y" },
        pairs: [{ a: "x", b: "y", note: "n", label: "x-y" }, null, null]
      },
      { uuid: "h2", pair: null }
    ]);
    // The composite key is read once for its two uses, and an incomplete key is never asked; a scalar is handed to
    // the repository, which knows whether it names an object
    assert.deepStrictEqual(Pair.seen, [{ a: "x", b: "y" }, "not a composite key", { a: "x", b: "missing" }]);
    // A field list keeps every field of the key
    const selected = await queryModelWithPermissions(Holder, "SELECT pair.label WHERE uuid = 'h1' HYDRATE pair", {
      getCurrentUserId: () => USER_A
    } as any);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(selected.results[0])), {
      uuid: "h1",
      pair: { a: "x", b: "y", label: "x-y" }
    });
    // Not hydrated, a composite key has fields of its own
    assertSelectFields(Holder, new QueryValidator("SELECT pair.a"));
  }

  @test
  async innerRefusalsAreRefilled() {
    // One readable owner every five tasks
    for (let i = 0; i < 20; i++) {
      await HydTask.create({
        uuid: `r${String(i).padStart(2, "0")}`,
        title: "refill",
        owner: i % 5 ? "gone" : "u1"
      } as any);
    }
    const context: any = { getCurrentUserId: () => USER_A };
    const spy = sinon.spy(HydTask.getRepository(), "query");
    const pages: string[][] = [];
    try {
      let token: string | undefined;
      do {
        const page = await queryModelWithPermissions(
          HydTask,
          `title = 'refill' HYDRATE owner INNER ORDER BY uuid ASC LIMIT 2${token ? ` OFFSET "${token}"` : ""}`,
          context
        );
        pages.push(page.results.map(row => row.uuid));
        token = page.continuationToken;
      } while (token && pages.length < 10);
      // Full pages: the refused rows were replaced from the next store pages
      assert.deepStrictEqual(pages, [["r00", "r05"], ["r10", "r15"], []]);
      assert.ok(spy.callCount > pages.length, `${spy.callCount} store queries`);
    } finally {
      spy.restore();
    }
    // When the scan budget is spent the page is short, and its token still continues the query
    await HydTask.create({ uuid: "b000", title: "budget", owner: "u1" } as any);
    for (let i = 1; i <= 130; i++) {
      await HydTask.create({ uuid: `b${String(i).padStart(3, "0")}`, title: "budget", owner: "gone" } as any);
    }
    await HydTask.create({ uuid: "b999", title: "budget", owner: "u1" } as any);
    const budget = sinon.spy(HydTask.getRepository(), "query");
    try {
      const q = "title = 'budget' HYDRATE owner INNER ORDER BY uuid ASC LIMIT 2";
      const short = await queryModelWithPermissions(HydTask, q, context);
      assert.deepStrictEqual(
        short.results.map(row => row.uuid),
        ["b000"]
      );
      assert.ok(short.continuationToken);
      assert.ok(budget.callCount <= MAX_REFILL_PAGES, `${budget.callCount} store pages`);
      const next = await queryModelWithPermissions(HydTask, `${q} OFFSET "${short.continuationToken}"`, context);
      assert.deepStrictEqual(
        next.results.map(row => row.uuid),
        ["b999"]
      );
      // The same rows as the LEFT query shows with a readable owner
      const left = await queryModelWithPermissions(
        HydTask,
        "title = 'budget' HYDRATE owner ORDER BY uuid ASC",
        context
      );
      assert.strictEqual(left.results.length, 132);
      assert.deepStrictEqual(
        left.results.filter(row => row.owner !== null).map(row => row.uuid),
        ["b000", "b999"]
      );
    } finally {
      budget.restore();
    }
  }

  @test
  async totalsAndTokens() {
    const context: any = { getCurrentUserId: () => USER_A };
    const query = (q: string, count: boolean = false) => queryModelWithPermissions(HydTask, q, context, { count });
    // LEFT keeps every row: the total is the one of the filter
    const plain = await query("ORDER BY uuid ASC LIMIT 1", true);
    assert.deepStrictEqual(plain.total, { value: 5, relation: "eq" });
    const left = await query("HYDRATE owner, project.team ORDER BY uuid ASC LIMIT 1", true);
    assert.deepStrictEqual(left.total, plain.total);
    assert.deepStrictEqual(await countModelWithPermissions(HydTask, "HYDRATE owner", context), plain.total);
    // INNER drops rows a store count cannot know: no total
    for (const q of ["HYDRATE owner INNER", "HYDRATE owner, project.team INNER"]) {
      const inner = await query(`${q} ORDER BY uuid ASC LIMIT 1`, true);
      assert.ok(!("total" in inner), q);
      assert.strictEqual(inner.results.length, 1);
      assert.strictEqual(await countModelWithPermissions(HydTask, q, context), undefined);
    }
    // The token is bound to the clause: INNER changes which rows a page holds
    const refusedToken = (q: string) =>
      assert.rejects(
        () => query(q),
        (err: any) => err instanceof WebdaError.BadRequest && err.message === "Invalid continuation token",
        q
      );
    await refusedToken(`HYDRATE owner INNER ORDER BY uuid ASC LIMIT 1 OFFSET "${plain.continuationToken}"`);
    await refusedToken(`HYDRATE owner ORDER BY uuid ASC LIMIT 1 OFFSET "${plain.continuationToken}"`);
    const inner = await query("HYDRATE owner INNER ORDER BY uuid ASC LIMIT 1");
    assert.deepStrictEqual(
      inner.results.map(row => row.uuid),
      ["k1"]
    );
    await refusedToken(`ORDER BY uuid ASC LIMIT 1 OFFSET "${inner.continuationToken}"`);
    await refusedToken(`HYDRATE owner ORDER BY uuid ASC LIMIT 1 OFFSET "${inner.continuationToken}"`);
    await refusedToken(`HYDRATE owner INNER, tags ORDER BY uuid ASC LIMIT 1 OFFSET "${inner.continuationToken}"`);
    // The same clause pages on, with any field list
    const next = await query(
      `SELECT title HYDRATE owner INNER ORDER BY uuid ASC LIMIT 1 OFFSET "${inner.continuationToken}"`
    );
    assert.deepStrictEqual(next.results, [{ uuid: "s1", title: "Sub" }]);
    // LEFT written or implied is the same clause
    const implied = await query("HYDRATE owner ORDER BY uuid ASC LIMIT 2");
    const written = await query(`HYDRATE owner LEFT ORDER BY uuid ASC LIMIT 2 OFFSET "${implied.continuationToken}"`);
    assert.deepStrictEqual(
      written.results.map(row => row.uuid),
      ["k3", "k4"]
    );
  }

  @test
  async queriesWithoutHydrateAreUnchanged() {
    const context: any = { getCurrentUserId: () => USER_A };
    const q = "title != 'x' ORDER BY uuid ASC LIMIT 3";
    const res = await queryModelWithPermissions(HydTask, q, context, { count: true, hydrate: { maxDepth: 1 } });
    const stored = await HydTask.query(q);
    // The same model instances as the repository returns, with their relation keys
    assert.ok(res.results.every(row => row instanceof HydTask));
    assert.strictEqual(JSON.stringify(res.results), JSON.stringify(stored.results));
    assert.deepStrictEqual(Object.keys(res).sort(), ["continuationToken", "results", "total"]);
    assert.strictEqual(res.results[0].owner, "u1");
    // No query at all is every row
    assert.strictEqual((await queryModelWithPermissions(HydTask, undefined, context)).results.length, 5);
    // Lowercase words are fields, not the clause
    await HydTask.create({ uuid: "lc", title: "Lower", hydrate: 1, inner: 2, left: 3 } as any);
    const lower = await queryModelWithPermissions(HydTask, "hydrate = 1 AND inner = 2 AND left = 3", context);
    assert.deepStrictEqual(
      lower.results.map(row => row.uuid),
      ["lc"]
    );
    // The descriptions clients read mention the clause
    assert.match(QUERY_DESCRIPTION, /HYDRATE rel, rel\.sub INNER/);
    assert.match(QUERY_RESULTS_DESCRIPTION, /hydrates/);
  }

  @test
  async throughRest() {
    // The tasks are nested under their project: the parent filter is merged, and the clause kept
    const res = await this.request(USER_A, "PUT", "/hyd/hydProjects/p1/hydTasks", {
      q: "HYDRATE owner, project.team ORDER BY uuid ASC"
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const ada = { uuid: "u1", name: "Ada", team: "t1" };
    const apollo = { uuid: "p1", name: "Apollo", team: { uuid: "t1", name: "Core", parentTeam: "t0" } };
    assert.deepStrictEqual(
      res.body.results.map((row: any) => [row.uuid, row.owner, row.project]),
      [
        ["k1", ada, apollo],
        ["s1", ada, apollo]
      ]
    );
    assert.strictEqual(res.body.continuationToken, undefined);
    // The hidden owner: null, exactly as its GET answers 404
    const zeus = await this.request(USER_A, "PUT", "/hyd/hydProjects/p2/hydTasks", { q: "HYDRATE owner" });
    assert.deepStrictEqual(
      zeus.body.results.map((row: any) => [row.uuid, row.owner]),
      [["k2", null]]
    );
    assert.strictEqual((await this.request(USER_A, "GET", "/hyd/hydUsers/u2")).status, 404);
    assert.strictEqual((await this.request(USER_A, "GET", "/hyd/hydUsers/u3")).status, 404);
    assert.strictEqual((await this.request(USER_A, "GET", "/hyd/hydUsers/u1")).status, 200);
    const inner = await this.request(USER_A, "PUT", "/hyd/hydProjects/p2/hydTasks", { q: "HYDRATE owner INNER" });
    assert.deepStrictEqual(inner.body, { results: [] });
    const admin = await this.request("admin", "PUT", "/hyd/hydProjects/p2/hydTasks", {
      q: "SELECT title, owner.email HYDRATE owner INNER",
      count: true
    });
    assert.deepStrictEqual(admin.body, {
      results: [{ uuid: "k2", title: "Two", owner: { uuid: "u2", email: "bob@test" } }]
    });
    // 400s
    for (const q of [
      "HYDRATE project.team.parentTeam",
      "HYDRATE title",
      "HYDRATE owner, owner",
      "HYDRATE __x",
      "HYDRATE"
    ]) {
      assert.strictEqual((await this.request(USER_A, "PUT", "/hyd/hydProjects/p1/hydTasks", { q })).status, 400, q);
    }
  }

  @test
  async throughTheQueryOperation() {
    // gRPC and MCP dispatch through callOperation with a non-HTTP context
    const owners = async (query: string, user?: string, extensions?: Record<string, any>) =>
      (await this.call(query, user, extensions)).results.map((row: any) => row.owner);
    const ada = { uuid: "u1", name: "Ada", team: "t1" };
    assert.deepStrictEqual(await owners("HYDRATE owner ORDER BY uuid ASC"), [ada, null, null, undefined, ada]);
    assert.deepStrictEqual((await this.call("HYDRATE owner INNER ORDER BY uuid ASC", "admin")).results.length, 3);
    // The limits are the ones of the service
    await assert.rejects(() => this.call("HYDRATE project.team.parentTeam"), WebdaError.BadRequest);
    await assert.rejects(() => this.call("HYDRATE owner HYDRATE project"), /Query syntax error/);
    const domain = useDynamicService<DomainService>("DomainService");
    const parameters: any = domain.getParameters();
    const limits = { depth: parameters.queryHydrateMaxDepth, objects: parameters.queryHydrateMaxObjects };
    assert.deepStrictEqual(limits, { depth: 2, objects: 1000 });
    try {
      parameters.queryHydrateMaxDepth = 3;
      parameters.queryHydrateMaxObjects = 3;
      const [deep] = (await this.call("uuid = 'k1' HYDRATE project.team.parentTeam")).results;
      assert.deepStrictEqual(deep.project.team.parentTeam, { uuid: "t0", name: "Root" });
      await assert.rejects(
        () => this.call("HYDRATE owner, project"),
        (err: any) => err instanceof WebdaError.BadRequest && /HYDRATE loads more than 3 objects/.test(err.message)
      );
    } finally {
      parameters.queryHydrateMaxDepth = limits.depth;
      parameters.queryHydrateMaxObjects = limits.objects;
    }
    // A related object is read like a GET: an authorizer refusing its Get operation hides it
    const asked: any[] = [];
    const authorizer = async (_context: any, operationId: string, _operation: any, options: any) => {
      if (operationId === "HydUser.Get") {
        asked.push(options);
        return "not this one";
      }
      return true;
    };
    registerOperationAuthorizer(authorizer);
    try {
      assert.deepStrictEqual(await owners("uuid = 'k1' HYDRATE owner"), [null]);
      assert.deepStrictEqual(asked, [{ input: { uuid: "u1" }, probe: false }]);
      assert.deepStrictEqual((await this.call("uuid = 'k1' HYDRATE owner INNER")).results, []);
      // Other models are still read
      assert.deepStrictEqual((await this.call("uuid = 'k1' HYDRATE project")).results[0].project.name, "Apollo");
    } finally {
      unregisterOperationAuthorizer(authorizer);
    }
    assert.deepStrictEqual(await owners("uuid = 'k1' HYDRATE owner"), [ada]);
    // A model that is not exposed (no Get operation), or without metadata, is never hydrated
    const gate = (model: any, key: any) => (domain as any).canGetModel(model, key, new SimpleOperationContext());
    assert.strictEqual(await gate(HydUser, "u1"), true);
    assert.strictEqual(await gate(HydUser, { uuid: "u1" }), true);
    assert.strictEqual(await gate(class Unknown {}, "u1"), false);
    assert.strictEqual(await gate({ Metadata: { Identifier: "WebdaDemo/NotExposed" } }, "u1"), false);
    assert.strictEqual(await gate({ Metadata: {} }, "u1"), false);
    // A transport whose results cannot hold objects refuses the clause, with its own message
    await assert.rejects(
      () => this.call("HYDRATE owner", USER_A, { [QUERY_HYDRATE_REFUSED]: "HYDRATE is not available here" }),
      (err: any) => err instanceof WebdaError.BadRequest && err.message === "HYDRATE is not available here"
    );
    assert.strictEqual(
      (await this.call("title = 'One'", USER_A, { [QUERY_HYDRATE_REFUSED]: "HYDRATE is not available here" })).results
        .length,
      1
    );
    // Any other value of the extension refuses nothing
    assert.deepStrictEqual(await owners("uuid = 'k1' HYDRATE owner", USER_A, { [QUERY_HYDRATE_REFUSED]: true }), [ada]);
  }

  @test
  async hydrationLimitsAreValidated() {
    const service = (params: any) => new DomainService("HydLimits", new DomainServiceParameters().load(params));
    assert.strictEqual(service({}).getParameters().queryHydrateMaxDepth, 2);
    assert.strictEqual(service({}).getParameters().queryHydrateMaxObjects, 1000);
    for (const queryHydrateMaxDepth of [0, 6, 1.5, -1, "2"]) {
      assert.throws(
        () => service({ queryHydrateMaxDepth }).resolve(),
        /HydLimits: queryHydrateMaxDepth must be an integer between 1 and 5/,
        String(queryHydrateMaxDepth)
      );
    }
    for (const queryHydrateMaxObjects of [0, -5, 2.5, "10"]) {
      assert.throws(
        () => service({ queryHydrateMaxObjects }).resolve(),
        /HydLimits: queryHydrateMaxObjects must be a positive integer/,
        String(queryHydrateMaxObjects)
      );
    }
  }

  @test
  async sampleAppModels() {
    // The compiled metadata: Contact.owner is a link to User
    const Contact: any = useModel("WebdaDemo/Contact");
    const User: any = useModel("WebdaDemo/User");
    const plan = planHydration(Contact, new QueryValidator("HYDRATE owner INNER"));
    assert.deepStrictEqual(
      plan.nodes.map(node => [node.attribute, node.targets[0].kind, node.targets[0].model]),
      [["owner", "LINK", User]]
    );
    // Reverse relations are refused, and the parent of a hydrated user is reached
    assert.throws(() => planHydration(User, new QueryValidator("HYDRATE contacts")), /Cannot hydrate "contacts"/);
    assert.throws(() => planHydration(Contact, new QueryValidator("HYDRATE photos")), /Cannot hydrate "photos"/);
    planHydration(Contact, new QueryValidator("HYDRATE owner.company"));
    planHydration(useModel("WebdaDemo/Course"), new QueryValidator("HYDRATE classroom, teacher, students"));
    planHydration(useModel("WebdaDemo/Student"), new QueryValidator("HYDRATE friends, teachers"));
    // A field of a subclass of the related model is visible through the relation
    planHydration(useModel("WebdaDemo/Project"), new QueryValidator("HYDRATE company INNER"));

    registerRepository(Contact, new MemoryRepository(Contact, ["uuid"]));
    registerRepository(User, new MemoryRepository(User, ["uuid"]));
    await User.create({ uuid: "friend", name: "Friend" });
    await User.create({ uuid: "boss", name: "The Boss" });
    await Contact.create({ uuid: "c1", firstName: "Ada", lastName: "L", owner: "friend" });
    await Contact.create({ uuid: "c2", firstName: "Bob", lastName: "M", owner: "boss" });
    // A guest reads every contact, but not the boss
    const contactCanAct = sinon.stub(Contact.prototype, "canAct").callsFake(async function openContact() {
      return true;
    });
    const userCanAct = sinon.stub(User.prototype, "canAct").callsFake(async function guestCanAct(
      this: any,
      context: any
    ) {
      return context.getCurrentUserId() !== "guest" || this.uuid !== "boss";
    });
    try {
      const run = async (query: string, user: string) => {
        const context: any = { getCurrentUserId: () => user };
        const res = await queryModelWithPermissions(Contact, query, context);
        return JSON.parse(JSON.stringify(res.results));
      };
      const guest = await run("HYDRATE owner ORDER BY uuid ASC", "guest");
      assert.deepStrictEqual(
        guest.map((row: any) => [row.uuid, row.owner?.name ?? row.owner]),
        [
          ["c1", "Friend"],
          ["c2", null]
        ]
      );
      const inner = await run("HYDRATE owner INNER ORDER BY uuid ASC", "guest");
      assert.deepStrictEqual(
        inner.map((row: any) => row.uuid),
        ["c1"]
      );
      // Never the object, in any form
      assert.doesNotMatch(JSON.stringify([guest, inner]), /The Boss/);
      assert.deepStrictEqual(await run("SELECT firstName, owner.name HYDRATE owner INNER", "guest"), [
        { uuid: "c1", firstName: "Ada", owner: { uuid: "friend", name: "Friend" } }
      ]);
      const member = await run("HYDRATE owner INNER ORDER BY uuid ASC", "member");
      assert.deepStrictEqual(
        member.map((row: any) => [row.uuid, row.owner.name]),
        [
          ["c1", "Friend"],
          ["c2", "The Boss"]
        ]
      );
    } finally {
      contactCanAct.restore();
      userCanAct.restore();
    }
  }
}
