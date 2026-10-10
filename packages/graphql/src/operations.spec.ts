import { suite, test } from "@webda/test";
import * as assert from "assert";
import { describe, it } from "vitest";
import {
  GraphQLBoolean,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLString,
  graphql,
  parse,
  subscribe,
  type GraphQLSchema
} from "graphql";
import { HttpContext, Session, WebContext, WebdaError, useInstanceStorage, useService } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { TestApplication } from "@webda/core/lib/test/objects.js";
import {
  GRAPHQL_FIXTURE_SERVICES,
  GraphQLFixtureService,
  fixtureState,
  registerGraphQLFixture
} from "../test/fixture.js";
import { GraphQLService } from "./graphql.service.js";
import { GraphQLOperationContext, graphqlPlacement, operationFieldName } from "./operations.js";

/**
 * @param value - a GraphQL result (null-prototype objects)
 * @returns a plain copy
 */
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

/**
 * @param check - condition
 */
async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 500 && !check(); i++) await new Promise(r => setTimeout(r, 10));
  if (!check()) throw new Error("timed out");
}

describe("operation placement", () => {
  it("names fields in lower camel case", () => {
    assert.strictEqual(operationFieldName("TaskService.Summary"), "taskServiceSummary");
    assert.strictEqual(operationFieldName("User.Follow"), "userFollow");
  });

  it("places by streaming mode, read-only flag and explicit names", () => {
    const op = (extra: any) => ({ id: "X.Y", input: "void", output: "void", method: "run", ...extra });
    assert.deepStrictEqual(graphqlPlacement("X.Y", op({})), { kind: "mutation", name: "xY" });
    assert.deepStrictEqual(graphqlPlacement("X.Y", op({ rest: { method: "get", path: "y" } })), {
      kind: "query",
      name: "xY"
    });
    assert.deepStrictEqual(graphqlPlacement("X.Y", op({ mcp: { readOnly: true } })), { kind: "query", name: "xY" });
    assert.deepStrictEqual(graphqlPlacement("X.Y", op({ streaming: "server" })), { kind: "subscription", name: "xY" });
    assert.deepStrictEqual(graphqlPlacement("X.Y", op({ graphql: { query: "why" } })), { kind: "query", name: "why" });
    assert.strictEqual(graphqlPlacement("X.Y", op({ streaming: "client" })), undefined);
    assert.strictEqual(graphqlPlacement("X.Y", op({ streaming: "bidi" })), undefined);
    assert.strictEqual(graphqlPlacement("X.Y", op({ method: "modelQuery" })), undefined);
    assert.strictEqual(graphqlPlacement("X.Y", op({ hidden: true })), undefined);
    assert.strictEqual(graphqlPlacement("X.Y", op({ graphql: false })), undefined);
    assert.throws(() => graphqlPlacement("X.Y", op({ streaming: "server", graphql: { query: "why" } })), /X\.Y/);
    assert.throws(() => graphqlPlacement("X.Y", op({ graphql: { subscription: "why" } })), /X\.Y/);
  });

  it("reuses the model type for a model output", () => {
    const svc: GraphQLService = Object.create(GraphQLService.prototype);
    const doc = new GraphQLObjectType({ name: "Doc", fields: { a: { type: GraphQLString } } });
    svc.modelsMap = { "Test/Doc": doc };
    (svc as any).app = { getSchema: () => undefined };
    assert.strictEqual(svc.operationOutputType({ output: "Test/Doc" } as any, "X"), doc);
    assert.strictEqual(svc.operationOutputType({ output: "void" } as any, "X"), GraphQLBoolean);
  });
});

describe("GraphQLOperationContext", () => {
  /**
   * @returns a streaming context over a GraphQL request context
   */
  const streaming = () => {
    const ctx = new GraphQLOperationContext(new WebContext(new HttpContext("localhost", "POST", "/graphql")), {});
    ctx.setExtension("operationStreaming", true);
    return ctx;
  };

  it("keeps a non-streamed result", () => {
    const ctx = new GraphQLOperationContext(new WebContext(new HttpContext("localhost", "POST", "/graphql")), {});
    assert.ok(ctx.write({ a: 1 }));
    assert.deepStrictEqual(ctx.result, { a: 1 });
  });

  it("queues chunks without their private keys and ends on finish", async () => {
    const ctx = streaming();
    const chunks = ctx.chunks();
    ctx.write({ a: 1, __b: 2 });
    ctx.finish();
    assert.deepStrictEqual(await chunks.next(), { value: { a: 1 }, done: false });
    assert.deepStrictEqual((await chunks.next()).done, true);
  });

  it("asks the operation to wait above the high water mark and resumes when consumed", async () => {
    const ctx = streaming();
    const chunks = ctx.chunks();
    let accepting = true;
    for (let i = 0; i < 20 && accepting; i++) accepting = ctx.write({ i });
    assert.strictEqual(accepting, false);
    let resumed = false;
    const waiting = ctx.drained().then(() => (resumed = true));
    await new Promise(r => setTimeout(r, 20));
    assert.strictEqual(resumed, false);
    for (let i = 0; i < 5; i++) await chunks.next();
    await waiting;
    assert.ok(resumed);
  });

  it("throws on write and drained once cancelled, and wakes a waiting drained", async () => {
    const ctx = streaming();
    let accepting = true;
    for (let i = 0; i < 20 && accepting; i++) accepting = ctx.write({ i });
    const waiting = ctx.drained();
    ctx.cancel();
    await assert.rejects(waiting, WebdaError.OperationCancelledError);
    await assert.rejects(ctx.drained(), WebdaError.OperationCancelledError);
    assert.throws(() => ctx.write({}), WebdaError.OperationCancelledError);
    assert.ok(ctx.isCancelled);
  });

  it("does not leave listeners behind a drained() without back-pressure", async () => {
    const ctx = streaming();
    for (let i = 0; i < 100; i++) await ctx.drained();
    assert.strictEqual((ctx as any).wakers.length, 0);
  });

  it("throws on write once finished or failed", () => {
    const finished = streaming();
    finished.finish();
    assert.throws(() => finished.write({}), WebdaError.OperationCancelledError);
    const failed = streaming();
    failed.fail(new Error("x"));
    assert.throws(() => failed.write({}), WebdaError.OperationCancelledError);
  });

  it("cancels the operation when the subscriber leaves", async () => {
    const ctx = streaming();
    const chunks = ctx.chunks();
    ctx.write({ a: 1 });
    await chunks.return!();
    assert.ok(ctx.isCancelled);
    assert.throws(() => ctx.write({}), WebdaError.OperationCancelledError);
    assert.strictEqual((await chunks.next()).done, true);
  });

  it("reports an error after the queued chunks, and a cancellation of the operation itself as an error", async () => {
    const ctx = streaming();
    const chunks = ctx.chunks();
    ctx.write({ a: 1 });
    ctx.fail(new WebdaError.OperationCancelledError());
    assert.strictEqual((await chunks.next()).done, false);
    await assert.rejects(chunks.next(), /Internal server error/);
  });

  it("ignores a failure after the subscriber left", async () => {
    const ctx = streaming();
    const chunks = ctx.chunks();
    await chunks.return!();
    ctx.fail(new WebdaError.OperationCancelledError());
    assert.strictEqual((await chunks.next()).done, true);
  });
});

@suite
class GraphQLOperationsTest extends WebdaApplicationTest {
  getTestConfiguration(): any {
    return {
      services: {
        ...GRAPHQL_FIXTURE_SERVICES,
        GraphQL: {
          type: "Webda/GraphQLService",
          exposeMe: false,
          globalSubscription: false,
          exposeOperations: ["Fixture.*", "Thing.*", "!Fixture.Excluded"]
        }
      }
    };
  }

  async tweakApp(app: TestApplication): Promise<void> {
    app.addModda("Webda/GraphQLFixtureService", GraphQLFixtureService);
    app.addModda("Webda/GraphQLService", GraphQLService);
  }

  /** @returns the service under test */
  get service(): GraphQLService {
    return useService("GraphQL" as any) as unknown as GraphQLService;
  }

  /** @returns the schema rebuilt with the fixture operations */
  schema(): GraphQLSchema {
    registerGraphQLFixture();
    this.service.generateSchema();
    return this.service.schema;
  }

  /**
   * @param user - logged user
   * @returns a GraphQL request context
   */
  context(user?: string): WebContext {
    const ctx = new WebContext(new HttpContext("localhost", "POST", "/graphql"));
    const session = new Session();
    if (user) session.login(user, user);
    ctx.setSession(session);
    ctx.setExtension("graphql", { count: 0 });
    return ctx;
  }

  /**
   * @param source - GraphQL document
   * @param user - logged user
   * @returns the execution result
   */
  run(source: string, user?: string) {
    return graphql({ schema: this.schema(), source, contextValue: this.context(user) });
  }

  @test
  async placesTheOperations() {
    const schema = this.schema();
    const names = (type?: GraphQLObjectType | null) => Object.keys(type?.getFields() ?? {}).sort();
    assert.deepStrictEqual(names(schema.getQueryType()), ["fixtureSecret", "fixtureSummary", "fixtureVersion"]);
    assert.deepStrictEqual(names(schema.getMutationType()), [
      "fixtureCrash",
      "fixtureFail",
      "fixtureRename",
      "thingFollow"
    ]);
    assert.deepStrictEqual(names(schema.getSubscriptionType()), ["fixtureBroken", "fixtureSelfCancel", "fixtureTicks"]);
    const follow = schema.getMutationType()!.getFields().thingFollow;
    assert.deepStrictEqual(
      follow.args.map(a => [a.name, String(a.type)]),
      [["uuid", "String!"]]
    );
    assert.ok(follow.args[0].type instanceof GraphQLNonNull);
  }

  @test
  async runsQueriesAndMutations() {
    const query = await this.run('{ fixtureSummary(project: "p1") { project open done } fixtureVersion }');
    assert.deepStrictEqual(query.errors, undefined);
    assert.deepStrictEqual(plain(query.data), {
      fixtureSummary: { project: "p1", open: 2, done: 1 },
      fixtureVersion: true
    });
    const mutation = await this.run(
      'mutation { fixtureRename(name: "doc") { name } thingFollow(uuid: "t1") { followed } }'
    );
    assert.deepStrictEqual(mutation.errors, undefined);
    assert.deepStrictEqual(plain(mutation.data), { fixtureRename: { name: "DOC" }, thingFollow: { followed: "t1" } });
  }

  @test
  async mapsErrors() {
    const denied = await this.run("{ fixtureSecret { secret } }");
    assert.strictEqual(denied.errors?.[0].extensions?.code, "PERMISSION_DENIED");
    const allowed = await this.run("{ fixtureSecret { secret } }", "alice");
    assert.deepStrictEqual(plain(allowed.data), { fixtureSecret: { secret: 42 } });
    const bad = await this.run("mutation { fixtureFail }");
    assert.strictEqual(bad.errors?.[0].extensions?.code, "BAD_USER_INPUT");
    assert.match(bad.errors![0].message, /Bad kind/);
  }

  @test
  async hidesUnexpectedErrors() {
    const crash = await this.run("mutation { fixtureCrash }");
    assert.strictEqual(crash.errors?.[0].message, "Internal server error");
    assert.strictEqual(crash.errors?.[0].extensions?.code, "INTERNAL_SERVER_ERROR");
    assert.ok(!JSON.stringify(crash).includes("secret internal detail"));
    const result = (await subscribe({
      schema: this.schema(),
      document: parse("subscription { fixtureBroken { index } }"),
      contextValue: this.context()
    })) as AsyncIterableIterator<any>;
    assert.deepStrictEqual(plain((await result.next()).value.data), { fixtureBroken: { index: 1 } });
    // The source iterator fails: the transport (graphql-ws, SSE) reports the rejection
    await assert.rejects(result.next(), error => {
      assert.strictEqual((error as Error).message, "Internal server error");
      assert.strictEqual((error as any).extensions.code, "INTERNAL_SERVER_ERROR");
      return true;
    });
  }

  @test
  async reportsAStreamCancellingItself() {
    const result = (await subscribe({
      schema: this.schema(),
      document: parse("subscription { fixtureSelfCancel { index } }"),
      contextValue: this.context()
    })) as AsyncIterableIterator<any>;
    assert.deepStrictEqual(plain((await result.next()).value.data), { fixtureSelfCancel: { index: 1 } });
    await assert.rejects(result.next(), /Internal server error/);
  }

  @test
  async streamsASubscriptionLive() {
    fixtureState.closed = false;
    const result = await subscribe({
      schema: this.schema(),
      document: parse("subscription { fixtureTicks(n: 5) { index } }"),
      contextValue: this.context()
    });
    const it = result as AsyncIterableIterator<any>;
    assert.deepStrictEqual(plain((await it.next()).value.data), { fixtureTicks: { index: 1 } });
    const second = it.next();
    const raced = await Promise.race([second.then(() => "item"), new Promise(r => setTimeout(() => r("waiting"), 50))]);
    assert.strictEqual(raced, "waiting"); // the generator still waits at its gate
    fixtureState.open();
    assert.deepStrictEqual(plain((await second).value.data), { fixtureTicks: { index: 2 } });
    await it.return!();
    await until(() => fixtureState.closed);
  }

  @test
  async refusesAClashingFieldName() {
    registerGraphQLFixture();
    useInstanceStorage().operations["Fixture.Clash"] = {
      ...useInstanceStorage().operations["Fixture.Version"],
      id: "Fixture.Clash",
      graphql: { query: "fixtureSummary" }
    } as any;
    try {
      assert.throws(() => this.service.generateSchema(), /fixtureSummary.*Fixture\.Summary.*Fixture\.Clash/);
    } finally {
      delete useInstanceStorage().operations["Fixture.Clash"];
    }
  }
}
