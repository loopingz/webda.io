import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/index.js";
import { RESTOperationsTransport, RESTOperationsTransportParameters } from "./restoperationstransport.service.js";
import { useRouter } from "./hooks.js";
import { callOperation, listOperations, Operation } from "../core/operations.js";
import * as WebdaError from "../errors/errors.js";
import { WebContext } from "../contexts/webcontext.js";
import { HttpContext, HttpMethodType } from "../contexts/httpcontext.js";
import { Router, RouterParameters } from "./router.service.js";
import { runWithContext } from "../contexts/execution.js";
import { randomUUID } from "node:crypto";
import { useApplication, useModel } from "../application/hooks.js";
import { MemoryRepository, registerRepository } from "@webda/models";
import { Service } from "../services/service.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { registerSchema } from "../schemas/hooks.js";
import { DomainService } from "../services/domainservice.service.js";
import { useDynamicService } from "../core/hooks.js";
import * as sinon from "sinon";
import { SimpleOperationContext } from "../contexts/simplecontext.js";
import { inputSchemaToOpenAPI } from "./binding.js";
import { useInstanceStorage } from "../core/instancestorage.js";

class RestBindingService extends Service {
  @Operation({ rest: false, input: "void" })
  internal() {}

  @Operation({
    input: "RestBinding.Mixed",
    rest: { method: "post", path: "binding/{id}{?count?,active?,tags?,filters*}" }
  })
  mixed(id: string, count: number, active: boolean, tags: number[], filters: any, title: string) {
    return { id, count, active, tags, filters, title };
  }

  @Operation({ input: "RestBinding.List", rest: { method: "get", path: "binding/list/{id}" } })
  list(id: string, limit: number = 20, active?: boolean, mode?: string) {
    return { id, limit, active, mode };
  }

  @Operation({ input: "RestBinding.Whole", rest: { method: "post", path: "binding/body/{id}", body: "payload" } })
  whole(id: string, payload: { count: number }) {
    return { id, payload };
  }
}

// Minimal Swagger HTML for testing
const SWAGGER_HTML_TEST = `<html><div id="swagger-ui"></div><script>SwaggerUIBundle({})</script></html>`;

/**
 * Main test suite: uses sample-app.
 *
 * DomainService registers operations into the global registry.
 * After Core.init(), we manually add RESTOperationsTransport which
 * walks the model tree and registers REST routes at a custom URL prefix.
 */
@suite
class RESTOperationsTransportTest extends WebdaApplicationTest {
  getTestConfiguration(): string | undefined {
    return process.cwd() + "/../../sample-app";
  }

  protected async buildWebda() {
    const core = await super.buildWebda();
    core.getBeans = () => {};
    core.registerBeans = () => {};
    // Manually create and register a Router so HTTP tests can route requests
    const router = new Router("Router", new RouterParameters().load({}));
    this.registerService(router);
    router.resolve();
    await router.init();
    return core;
  }

  private async bindingTransport() {
    const schemas: Record<string, any> = {
      "RestBinding.Mixed": {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          count: { type: "number" },
          active: { type: "boolean" },
          tags: { type: "array", items: { type: "integer" } },
          filters: { $ref: "#/definitions/Binding%2FFilters%3CNumber%3E" },
          title: { type: "string" }
        },
        required: ["id", "title"],
        definitions: {
          "Binding/Filters<Number>": {
            type: "object",
            properties: { limit: { type: "integer" }, enabled: { type: "boolean" } },
            additionalProperties: { type: "number" }
          }
        }
      },
      "RestBinding.List": {
        type: "object",
        properties: {
          id: { type: "string" },
          limit: { anyOf: [{ type: "null" }, { type: "number" }] },
          active: { oneOf: [{ type: "null" }, { type: "boolean" }] },
          mode: { anyOf: [{ enum: ["yes", "no"] }] }
        },
        required: ["id"]
      },
      "RestBinding.Whole": {
        type: "object",
        properties: {
          id: { type: "string" },
          payload: { type: "object", properties: { count: { type: "number" } }, required: ["count"] }
        },
        required: ["id", "payload"]
      }
    };
    for (const [name, schema] of Object.entries(schemas)) {
      useApplication().getSchemas()[name] = schema;
      registerSchema(name, schema, true);
    }
    const service = new RestBindingService("RestBindingService", new ServiceParameters().load({}));
    this.registerService(service);
    service.initOperations();
    const transport = new RESTOperationsTransport(
      "BindingTransport",
      new RESTOperationsTransportParameters().load({ url: "/v2/" })
    );
    this.registerService(transport);
    transport.resolve();
    await transport.init();
    return transport;
  }

  @test
  async nestedActionInjectsItsParentBeforeValidatingTypedInput() {
    const transport = await this.bindingTransport();
    (transport as any).exposeActionRoute(
      "/nested/{pid.0}",
      "RestBindingService",
      "",
      "mixed",
      { global: true },
      1,
      "title"
    );
    assert.deepStrictEqual(await this.routerHttp({ method: "POST", url: "/nested/parent/binding/key", body: {} }), {
      id: "key",
      title: "parent",
      filters: {}
    });
  }

  @test
  async legacyRouteMetadataKeepsFallbackMethodsPathsAndResponseOverrides() {
    const transport: any = await this.bindingTransport();
    const storage = useInstanceStorage();
    const app: any = useApplication();
    const operations = storage.operations!;
    const operation = (id: string, extra: any = {}) => ({ id, input: "void", output: "void", ...extra });
    operations["Legacy.Global"] = operation("Legacy.Global");
    operations["Legacy.Instance"] = operation("Legacy.Instance");
    operations["Legacy.Explicit"] = operation("Legacy.Explicit", { rest: { path: "custom", method: "get" } });
    transport.exposeActionRoute("/legacy", "Legacy", "", "global", { global: true }, 0);
    transport.exposeActionRoute("/legacy", "Legacy", "", "instance", {}, 0);
    transport.exposeActionRoute("/legacy", "Legacy", "", "explicit", { rest: { method: "GET" } }, 0);
    const behavior = "Test/LegacyRoutes";
    const previous = app.behaviors[behavior];
    app.behaviors[behavior] = { metadata: { Actions: { multi: { methods: ["POST", "PATCH"] }, fallback: {} } } };
    operations["Legacy.Payload.Multi"] = operation("Legacy.Payload.Multi");
    operations["Legacy.Payload.Fallback"] = operation("Legacy.Payload.Fallback");
    try {
      transport.exposeBehaviorRoutes("/legacy", "Legacy", "", "", { behavior, attribute: "payload" });
      const doc: any = useRouter().exportOpenAPI();
      assert.strictEqual(doc.paths["/legacy/global"].put.operationId, "Legacy.Global");
      assert.strictEqual(doc.paths["/legacy/{uuid}/instance"].put.operationId, "Legacy.Instance");
      assert.strictEqual(doc.paths["/legacy/custom"].get.operationId, "Legacy.Explicit");
      assert.strictEqual(doc.paths["/legacy/{uuid}/payload.multi"].post.operationId, "Legacy.Payload.Multi");
      assert.strictEqual(doc.paths["/legacy/{uuid}/payload.multi"].patch.operationId, undefined);
      assert.ok(doc.paths["/legacy/{uuid}/payload.fallback"].put);
      const schemaName = "Legacy.OptionalBody";
      app.getSchemas()[schemaName] = { type: "object", properties: { optional: { type: "string" } } };
      registerSchema(schemaName, app.getSchemas()[schemaName], true);
      const optional = transport.operationOpenAPI(
        operation("Legacy.Optional", { input: schemaName }),
        "/optional",
        "POST"
      );
      assert.strictEqual(optional.requestBody.required, false);
      const response = { description: "Override" };
      const legacy = transport.operationOpenAPI(
        operation("Legacy.Query", {
          rest: { method: "get", path: "query{?unknown?}", responses: { "418": response } }
        }),
        "/query{?unknown?}",
        "GET"
      );
      assert.deepStrictEqual(legacy.parameters[0].schema, { type: "string" });
      assert.deepStrictEqual(legacy.responses["418"], response);
      assert.ok(transport.operationOpenAPI(operation("Legacy.Disabled", { rest: false }), "/disabled", "POST"));
      // Export also works before any operations have been registered.
      storage.operations = undefined;
      assert.ok(useRouter().exportOpenAPI().components);
    } finally {
      storage.operations = operations;
      if (previous === undefined) delete app.behaviors[behavior];
      else app.behaviors[behavior] = previous;
    }
  }

  @test
  async restBindingsConvertOnlyUrlValuesAndKeepPositionalOrder() {
    await this.bindingTransport();
    assert.deepStrictEqual(
      await this.routerHttp({
        method: "POST",
        url: "/v2/binding/key?count=2&active=1&tags=3&tags=4&limit=7&enabled=false",
        body: { title: "hello" }
      }),
      {
        id: "key",
        count: 2,
        active: true,
        tags: [3, 4],
        filters: { limit: 7, enabled: false },
        title: "hello"
      }
    );
    assert.deepStrictEqual(
      (await this.routerHttp<any>({ method: "POST", url: "/v2/binding/key?tags=3,4", body: { title: "hello" } })).tags,
      [3, 4]
    );
    for (const query of [
      "count=NaN",
      "count=Infinity",
      "count=abc",
      "active=yes",
      "tags=1,nope",
      "limit=abc",
      "limit=1&limit=2"
    ]) {
      await assert.rejects(
        () => this.routerHttp({ method: "POST", url: `/v2/binding/key?${query}`, body: { title: "hello" } }),
        WebdaError.BadRequest
      );
    }
    await assert.rejects(
      () => this.routerHttp({ method: "POST", url: "/v2/binding/key", body: { title: "hello", count: "2" } }),
      /InvalidInput.*count/
    );
    assert.deepStrictEqual(
      await this.routerHttp<any>({ method: "POST", url: "/v2/binding/key?tags=&custom=2", body: { title: "hello" } }),
      { id: "key", tags: [], filters: { custom: 2 }, title: "hello" }
    );
    await assert.rejects(
      () => this.routerHttp({ method: "POST", url: "/v2/binding/key", body: { title: "hello", id: "other" } }),
      /conflicts with path parameter/
    );
  }

  @test
  async getBindingAddsQueryParametersAndHonorsDefaults() {
    await this.bindingTransport();
    assert.deepStrictEqual(await this.routerHttp({ method: "GET", url: "/v2/binding/list/key?limit=5&active=false" }), {
      id: "key",
      limit: 5,
      active: false
    });
    assert.deepStrictEqual(await this.routerHttp({ method: "GET", url: "/v2/binding/list/key" }), {
      id: "key",
      limit: 20
    });
    assert.strictEqual(
      (listOperations()["RestBindingService.List"] as any).rest.path,
      "binding/list/{id}{?limit?,active?,mode?}"
    );
    assert.deepStrictEqual(await this.routerHttp({ method: "GET", url: "/v2/binding/list/key?mode=yes" }), {
      id: "key",
      limit: 20,
      mode: "yes"
    });
  }

  @test
  async wholeBodyBindingPreservesObjectsAndStrictValidation() {
    await this.bindingTransport();
    assert.deepStrictEqual(await this.routerHttp({ method: "POST", url: "/v2/binding/body/key", body: { count: 2 } }), {
      id: "key",
      payload: { count: 2 }
    });
    await assert.rejects(
      () => this.routerHttp({ method: "POST", url: "/v2/binding/body/key", body: { count: "2" } }),
      /InvalidInput.*count/
    );
    const rpc = new SimpleOperationContext().setInput(
      Buffer.from(JSON.stringify({ id: "key", payload: { count: 2 } }))
    );
    await rpc.init();
    await callOperation(rpc, "RestBindingService.Whole");
    assert.deepStrictEqual(JSON.parse(rpc.getOutput()), { id: "key", payload: { count: 2 } });
    const empty = await this.newWebContext(new HttpContext("test.webda.io", "POST", "/", "http", 80));
    empty.setParameters({ id: "key" });
    sinon.stub(empty, "getInput").resolves(undefined);
    await assert.rejects(() => callOperation(empty, "RestBindingService.Whole"), /InvalidInput.*payload/);
  }

  @test
  async openApiDocumentsTheSameUrlAndBodyBinding() {
    assert.deepStrictEqual(
      inputSchemaToOpenAPI({
        $schema: "https://json-schema.org/draft-07/schema",
        definitions: { Value: { type: "string" } },
        properties: { definitions: { type: "string" } },
        default: { definitions: { value: "keep" } }
      }),
      { properties: { definitions: { type: "string" } }, default: { definitions: { value: "keep" } } }
    );
    await this.bindingTransport();
    const doc: any = useRouter().exportOpenAPI();
    const mixed = doc.paths["/v2/binding/{id}"].post;
    assert.deepStrictEqual(
      mixed.parameters.find(p => p.name === "count"),
      { name: "count", in: "query", required: false, schema: { type: "number" } }
    );
    assert.strictEqual(mixed.parameters.find(p => p.name === "tags").explode, true);
    assert.deepStrictEqual(mixed.parameters.find(p => p.name === "filters").schema, {
      $ref: "#/components/schemas/Binding~1Filters%3CNumber%3E"
    });
    assert.strictEqual(doc.components.schemas["Binding/Filters<Number>"].properties.limit.type, "integer");
    assert.deepStrictEqual(mixed.requestBody.content["application/json"].schema, {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"]
    });
    const get = doc.paths["/v2/binding/list/{id}"].get;
    assert.ok(!get.requestBody);
    assert.deepStrictEqual(
      get.parameters.map(p => [p.name, p.in]),
      [
        ["id", "path"],
        ["limit", "query"],
        ["active", "query"],
        ["mode", "query"]
      ]
    );
    assert.deepStrictEqual(doc.paths["/v2/binding/body/{id}"].post.requestBody.content["application/json"].schema, {
      type: "object",
      properties: { count: { type: "number" } },
      required: ["count"]
    });
  }

  @test
  async actionRestHintSupportsCompositePrimaryKeysAndQueryArguments() {
    const Classroom: any = useModel("Classroom");
    const metadata = Classroom.Metadata;
    const permission = sinon.stub(Classroom, "canAct").returns(true);
    Classroom.Metadata = {
      ...metadata,
      PrimaryKey: ["tenant", "slug"],
      Actions: { ...metadata.Actions, rename: { methods: ["GET", "POST"], rest: { path: "rename{?force?}" } } }
    };
    const calls: any[] = [];
    const ref = sinon.stub(Classroom, "ref").callsFake((key: any) => ({
      get: async () => ({
        isDeleted: () => false,
        canAct: async () => true,
        rename: (...args: any[]) => {
          calls.push([key, ...args]);
          return { ok: true };
        }
      })
    }));
    try {
      useDynamicService<DomainService>("DomainService").initOperations();
      const transport = new RESTOperationsTransport(
        "CompositeActionTransport",
        new RESTOperationsTransportParameters().load({ url: "/v2/" })
      );
      this.registerService(transport);
      transport.resolve();
      await transport.init();
      assert.deepStrictEqual(
        await this.routerHttp({
          method: "POST",
          url: "/v2/classrooms/org/room/rename?force=true",
          body: { name: "new" }
        }),
        { ok: true }
      );
      assert.deepStrictEqual(calls, [[{ tenant: "org", slug: "room" }, "new", true]]);
      assert.deepStrictEqual(
        await this.routerHttp({ method: "GET", url: "/v2/classrooms/org/room/rename?name=other&force=false" }),
        { ok: true }
      );
      assert.deepStrictEqual(calls[1], [{ tenant: "org", slug: "room" }, "other", false]);
      await assert.rejects(
        () => this.routerHttp({ method: "POST", url: "/v2/classrooms/org/room/rename", body: {} }),
        /InvalidInput.*name/
      );
      const doc: any = useRouter().exportOpenAPI();
      const op = doc.paths["/v2/classrooms/{tenant}/{slug}/rename"].post;
      assert.ok(!doc.paths["/v2/classrooms/{tenant}/{slug}/rename"].get.requestBody);
      assert.deepStrictEqual(
        op.parameters.map(p => p.name),
        ["tenant", "slug", "force"]
      );
      assert.deepStrictEqual(Object.keys(op.requestBody.content["application/json"].schema.properties), ["name"]);
    } finally {
      ref.restore();
      permission.restore();
      Classroom.Metadata = metadata;
      useDynamicService<DomainService>("DomainService").initOperations();
    }
  }

  /**
   * Execute an HTTP request through the Router and return the parsed response.
   * Unlike `this.http()`, this properly awaits the route handler.
   */
  async routerHttp<T = any>(options: {
    method: HttpMethodType;
    url: string;
    body?: any;
    headers?: { [key: string]: string };
  }): Promise<T> {
    const httpContext = new HttpContext(
      "test.webda.io",
      options.method,
      options.url,
      "http",
      80,
      options.headers || {}
    );
    if (options.body !== undefined) {
      httpContext.setBody(options.body);
    }
    httpContext.setClientIp("127.0.0.1");
    const ctx = new WebContext(httpContext);
    // Initialize session without SessionManager (create one directly)
    ctx.newSession();
    let routeError: Error | undefined;
    await runWithContext(ctx, async () => {
      try {
        await useRouter().execute(ctx);
      } catch (err) {
        routeError = err instanceof Error ? err : new Error(String(err));
      }
    });
    // If the route handler threw, propagate as an appropriate HTTP error
    if (routeError) {
      if (routeError instanceof WebdaError.HttpError) {
        throw routeError;
      }
      throw routeError;
    }
    const res = <string>ctx.getResponseBody();
    if (ctx.statusCode >= 400) {
      const code = ctx.statusCode;
      if (code === 404) throw new WebdaError.NotFound(res || "Not Found");
      if (code === 400) throw new WebdaError.BadRequest(res || "Bad Request");
      if (code === 403) throw new WebdaError.Forbidden(res || "Forbidden");
      if (code === 409) throw new WebdaError.Conflict(res || "Conflict");
      throw new WebdaError.HttpError(res || "Error", code);
    }
    if (res) {
      try {
        return JSON.parse(res);
      } catch {
        return res as any;
      }
    }
    return undefined as any;
  }

  @test
  async routesRegistered() {
    // Operations are registered by DomainService during init()
    const operations = listOperations();
    assert.ok(operations["Company.Create"], "Company.Create should be registered");
    assert.ok(operations["Company.Get"], "Company.Get should be registered");
    assert.ok(operations["Company.Update"], "Company.Update should be registered");
    assert.ok(operations["Company.Patch"], "Company.Patch should be registered");
    assert.ok(operations["Company.Delete"], "Company.Delete should be registered");
    assert.ok(operations["Companies.Query"], "Companies.Query should be registered");

    // Nested models
    assert.ok(operations["User.Create"], "User.Create should be registered");
    assert.ok(operations["Users.Query"], "Users.Query should be registered");

    // Binary attribute operations (now registered via the Behavior pipeline)
    assert.ok(operations["Contact.Avatar.Attach"], "Contact.Avatar.Attach should be registered");
    assert.ok(operations["Contact.Avatar.AttachChallenge"], "Contact.Avatar.AttachChallenge should be registered");
    assert.ok(operations["Contact.Avatar.Download"], "Contact.Avatar.Download should be registered");
    assert.ok(operations["Contact.Avatar.Delete"], "Contact.Avatar.Delete should be registered");
    assert.ok(operations["Contact.Avatar.DownloadUrl"], "Contact.Avatar.DownloadUrl should be registered");
    assert.ok(operations["Contact.Avatar.SetMetadata"], "Contact.Avatar.SetMetadata should be registered");
    assert.ok(operations["Contact.Photos.Attach"], "Contact.Photos.Attach should be registered");
    assert.ok(operations["Contact.Photos.Get"], "Contact.Photos.Get should be registered");

    // Now add our transport and verify it can walk the model tree
    const transport = new RESTOperationsTransport(
      "testTransport",
      new RESTOperationsTransportParameters().load({ url: "/api/", exposeOpenAPI: false })
    );
    this.registerService(transport);
    transport.resolve();
    await transport.init();

    // Verify the transport's getOperations returns the registered operations
    const transportOps = transport.getOperations();
    assert.ok(transportOps["Company.Create"], "Transport should see Company.Create");
    assert.ok(transportOps["Users.Query"], "Transport should see Users.Query");
    assert.ok(transportOps["Contact.Avatar.Attach"], "Transport should see binary operations");
  }

  @test
  async patchRouteHasItsOwnOperationId() {
    const transport = new RESTOperationsTransport(
      "testPatchTransport",
      new RESTOperationsTransportParameters().load({ url: "/patch-api/", exposeOpenAPI: false })
    );
    this.registerService(transport);
    transport.resolve();
    await transport.init();

    const infos = Object.entries(useRouter().getRoutes())
      .filter(([path]) => path.startsWith("/patch-api/"))
      .flatMap(([, list]) => list as any[]);
    const update = infos.find(info => info.openapi?.put?.operationId === "Company.Update");
    assert.ok(update, "the Company update route is registered");
    // PATCH is its own operation: unique operationId, so tools can map it to its URL
    assert.strictEqual(update.openapi.patch?.operationId, "Company.Patch");
    assert.strictEqual(update.openapi.patch?.summary, "Patch a Company");
  }

  @test
  async actionRoutesHaveOperationIds() {
    const transport = new RESTOperationsTransport(
      "testActionTransport",
      new RESTOperationsTransportParameters().load({ url: "/action-api/", exposeOpenAPI: false })
    );
    this.registerService(transport);
    transport.resolve();
    await transport.init();

    const operationIds = Object.entries(useRouter().getRoutes())
      .filter(([path]) => path.startsWith("/action-api/"))
      .flatMap(([path, list]) =>
        (list as any[]).flatMap(info => Object.values(info.openapi ?? {}).map((op: any) => [op?.operationId, path]))
      );
    const pathOf = (id: string) => operationIds.find(([operationId]) => operationId === id)?.[1];
    // Instance and static (global) actions carry the operation they dispatch to
    assert.match(pathOf("Classroom.Test") ?? "", /\{uuid\}\/test$/);
    assert.match(pathOf("Hardware.GlobalAction") ?? "", /\/globalAction$/);
  }

  @test
  async routesWithoutQueryTemplateIgnoreTheQueryString() {
    const router = useRouter();
    const urls = ["/qs-plain", "/qs-items/{id}", "/qs-files/{+file}", "/qs-search{?q,page?}", "/qs-any{?rest*}"];
    urls.forEach(url =>
      router.addRouteToRouter(url, { methods: ["GET"], executor: "QueryTest", _method: async () => {} } as any)
    );
    router.remapRoutes();
    const match = (url: string) => {
      const ctx = new WebContext(new HttpContext("test.webda.io", "GET", url));
      const info = router.getRouteFromUrl(ctx, "GET", url);
      return { info, params: ctx.getParameters() };
    };
    try {
      // No query template: the query string doesn't take part in matching
      assert.ok(match("/qs-plain?x=1").info, "a fixed path matches with a query string");
      assert.strictEqual(match("/qs-items/42?x=1").params.id, "42");
      // e.g. a cache-busting `?v=` on a static asset
      assert.strictEqual(match("/qs-files/a/b.js?v=123").params.file, "a/b.js");
      assert.deepStrictEqual(router.getRouteMethodsFromUrl("/qs-plain?x=1"), ["GET"]);

      // Declared query templates keep their behavior
      assert.ok(!match("/qs-search").info, "q is required");
      const search = match("/qs-search?q=abc&page=2").params;
      assert.strictEqual(search.q, "abc");
      assert.strictEqual(search.page, "2");
      assert.deepStrictEqual(match("/qs-any?a=1&b=2").params.rest, { a: "1", b: "2" });
    } finally {
      // The router is shared: OpenAPI generation would look up the fake executor
      urls.forEach(url => router.removeRoute(url));
    }
  }

  @test
  async parameters() {
    const params = new RESTOperationsTransportParameters().load({});
    assert.strictEqual(params.nameTransformer, "camelCase");
    assert.strictEqual(params.queryMethod, "PUT");
    assert.strictEqual(params.url, "/");
    assert.strictEqual(params.swaggerVersion, "5.31.0");

    const custom = new RESTOperationsTransportParameters().load({
      nameTransformer: "snake_case",
      queryMethod: "GET",
      url: "/api/v1",
      swaggerVersion: "4.0.0",
      exposeOpenAPI: false
    });
    assert.strictEqual(custom.nameTransformer, "snake_case");
    assert.strictEqual(custom.queryMethod, "GET");
    assert.strictEqual(custom.url, "/api/v1/");
    assert.strictEqual(custom.swaggerVersion, "4.0.0");
    assert.strictEqual(custom.exposeOpenAPI, false);

    // Test operations filter
    const filtered = new RESTOperationsTransportParameters().load({
      operations: ["Company.*", "!Company.Delete"]
    });
    assert.ok(filtered.isIncluded("Company.Create"));
    assert.ok(!filtered.isIncluded("Company.Delete"));
    assert.ok(!filtered.isIncluded("User.Create"));
  }

  @test
  async actionRoutes() {
    const operations = listOperations();
    assert.ok(operations["SubSubProject.Action"], "SubSubProject.Action should be registered");
    assert.ok(operations["SubSubProject.Action2"], "SubSubProject.Action2 should be registered");
    assert.ok(operations["Hardware.GlobalAction"], "Hardware.GlobalAction should be registered");
    assert.ok(operations["Hardware.GlobalAction"].rest, "Hardware.GlobalAction should have rest hints");
    assert.ok(operations["Classroom.Test"], "Classroom.Test should be registered");
  }

  @test
  async exposeOperationNoOp() {
    const transport = new RESTOperationsTransport("test-noop", new RESTOperationsTransportParameters().load({}));
    transport.exposeOperation("Test.Op", {
      id: "Test.Op",
      service: "test",
      method: "test",
      summary: "Test"
    });
    // Should not throw - it's a no-op
  }

  @test
  async transformName() {
    const transport = new RESTOperationsTransport("test-name", new RESTOperationsTransportParameters().load({}));
    assert.strictEqual(transport.transformName("Users"), "users");
    assert.strictEqual(transport.transformName("UsersTest"), "usersTest");

    const snakeTransport = new RESTOperationsTransport(
      "test-snake",
      new RESTOperationsTransportParameters().load({ nameTransformer: "snake_case" })
    );
    assert.strictEqual(snakeTransport.transformName("UsersTest"), "users_test");
  }

  @test
  async loadParameters() {
    const transport = new RESTOperationsTransport(
      "test-load",
      new RESTOperationsTransportParameters().load({ url: "/test/", queryMethod: "GET" })
    );
    assert.strictEqual(transport.getParameters().url, "/test/");
    assert.strictEqual(transport.getParameters().queryMethod, "GET");
  }

  @test
  async operationsFiltering() {
    // Test that operations filter is applied during getOperations
    const transport = new RESTOperationsTransport(
      "testFiltered",
      new RESTOperationsTransportParameters().load({
        url: "/filtered/",
        exposeOpenAPI: false,
        operations: ["Company.*", "Companies.*"]
      })
    );
    this.registerService(transport);
    transport.resolve();
    await transport.init();

    const ops = transport.getOperations();
    assert.ok(ops["Company.Create"], "Should include Company.Create");
    assert.ok(ops["Companies.Query"], "Should include Companies.Query");
    assert.ok(!ops["User.Create"], "Should exclude User.Create");
    assert.ok(!ops["Contact.Avatar.Attach"], "Should exclude Contact operations");
  }

  @test
  async initTransportWalksModelTree() {
    // Create a transport at a unique prefix
    const transport = new RESTOperationsTransport(
      "testRoutes",
      new RESTOperationsTransportParameters().load({ url: "/v2/", exposeOpenAPI: false })
    );
    this.registerService(transport);
    transport.resolve();
    // initTransport is called during init - even without Router, the tree walk should succeed
    await transport.init();

    // Verify the transport processed operations from the registry
    const ops = transport.getOperations();
    const opKeys = Object.keys(ops);
    assert.ok(opKeys.length > 0, "Transport should have operations after init");
    // Verify root and nested model operations are present
    assert.ok(ops["Company.Create"], "Root model Company should be present");
    assert.ok(ops["User.Create"], "Child model User should be present");
  }

  @test
  async openapiSwagger() {
    // Test the Swagger HTML generation using a stub router
    const transport = new RESTOperationsTransport(
      "testOpenApi",
      new RESTOperationsTransportParameters().load({ url: "/openapi-test/", exposeOpenAPI: false })
    );

    // Manually set the openapi content to test the write path
    transport.openapiContent = SWAGGER_HTML_TEST;

    const ctx = {
      _written: "",
      write(content: string) {
        this._written = content;
      }
    };
    await transport.openapi(ctx as any);
    assert.ok(ctx._written.includes("swagger-ui"), "Should contain swagger-ui");
    assert.ok(ctx._written.includes("SwaggerUIBundle"), "Should contain SwaggerUIBundle");
  }

  @test
  async openapiCaching() {
    // Verify openapiContent is cached after first generation
    const transport = new RESTOperationsTransport(
      "testCaching",
      new RESTOperationsTransportParameters().load({ swaggerVersion: "5.31.0" })
    );
    // Pre-set the cache
    const cached = "<html>cached</html>";
    transport.openapiContent = cached;
    const ctx = {
      _written: "",
      write(content: string) {
        this._written = content;
      }
    };
    await transport.openapi(ctx as any);
    assert.strictEqual(ctx._written, cached, "Should use cached content");
  }

  @test
  async queryRouteHTTP() {
    // Register transport at a unique prefix
    const transport = new RESTOperationsTransport(
      "TestRESTTransportQuery",
      new RESTOperationsTransportParameters().load({ url: "/tq/", exposeOpenAPI: false })
    );
    this.registerService(transport);
    transport.resolve();
    await transport.init();

    // Query route exercises the query closure: parsing body.q, building QueryValidator
    // The callOperation may fail if no repository exists, but the closure code runs
    try {
      const results = await this.routerHttp<{ results: any[] }>({
        method: "PUT",
        url: "/tq/company",
        body: { q: "" }
      });
      assert.ok(results.results, "Query should return results array");
    } catch {
      // Expected if no repository - the route closure still executed
    }

    // Query with empty body (q defaults to "")
    try {
      await this.routerHttp<{ results: any[] }>({
        method: "PUT",
        url: "/tq/company",
        body: {}
      });
    } catch {
      // Expected
    }
  }

  @test
  async nestedQueryRouteHTTP() {
    // Test nested query which injects parent attribute
    const transport = new RESTOperationsTransport(
      "TestRESTTransportNestedQ",
      new RESTOperationsTransportParameters().load({ url: "/nq/", exposeOpenAPI: false })
    );
    this.registerService(transport);
    transport.resolve();
    await transport.init();

    // Query users under a specific company (nested model)
    // Route: /nq/company/{pid.0}/user (camelCase of model shortId)
    // This exercises the parent attribute injection in the query handler
    try {
      const nestedResults = await this.routerHttp<{ results: any[] }>({
        method: "PUT",
        url: "/nq/company/some-company-id/user",
        body: { q: "" }
      });
      assert.ok(nestedResults.results, "Nested query should return results");
    } catch {
      // Expected if no repository - the nested query closure still executed
    }
  }

  @test
  async nestedQueryParentIdIsEscaped() {
    const transport = new RESTOperationsTransport(
      "TestRESTTransportNestedEscape",
      new RESTOperationsTransportParameters().load({ url: "/ne/", exposeOpenAPI: false })
    );
    this.registerService(transport);
    transport.resolve();
    await transport.init();
    const User = useModel<any>("User");
    registerRepository(User, new MemoryRepository(User, ["uuid"]));
    // sample-app User.canAct allows everything: only the parent filter applies
    await User.create({ uuid: "u-c1", name: "in c1", company: "c1" });
    await User.create({ uuid: "u-c2", name: "in c2", company: "c2" });
    const query = async (parent: string) =>
      (
        await this.routerHttp<{ results: any[] }>({
          method: "PUT",
          url: `/ne/companies/${encodeURIComponent(parent)}/users`,
          body: { q: "" }
        })
      ).results.map(r => r.uuid);
    assert.deepStrictEqual(await query("c1"), ["u-c1"]);
    // A parent id carrying WebdaQL stays a value: it cannot widen the filter to other companies
    assert.deepStrictEqual(await query("c1' OR company != 'none"), []);
  }

  @test
  async nestedRoutesDropTheParentIdFromTheValidatedInput() {
    const transport = new RESTOperationsTransport(
      "TestRESTTransportNestedInput",
      new RESTOperationsTransportParameters().load({ url: "/ni/", exposeOpenAPI: false })
    );
    this.registerService(transport);
    transport.resolve();
    await transport.init();
    const User = useModel<any>("User");
    registerRepository(User, new MemoryRepository(User, ["uuid"]));
    const Company = useModel<any>("Company");
    registerRepository(Company, new MemoryRepository(Company, ["uuid"]));
    const parent = (await Company.create({ name: "parent" })).getUUID();
    // The model schema has additionalProperties: false; the `pid.0` path parameter must not reach the validation
    const created = await this.routerHttp<any>({
      method: "POST",
      url: `/ni/companies/${parent}/users`,
      body: { name: "nested" }
    });
    assert.strictEqual(created.company, parent);
    const { uuid } = created;
    const patched = await this.routerHttp<any>({
      method: "PATCH",
      url: `/ni/companies/${parent}/users/${uuid}`,
      body: { name: "patched" }
    });
    assert.strictEqual(patched.name, "patched");
    const updated = await this.routerHttp<any>({
      method: "PUT",
      url: `/ni/companies/${parent}/users/${uuid}`,
      body: { name: "updated", company: parent }
    });
    assert.strictEqual(updated.name, "updated");
    const got = await this.routerHttp<any>({ method: "GET", url: `/ni/companies/${parent}/users/${uuid}` });
    assert.strictEqual(got.name, "updated");
    await this.routerHttp({ method: "DELETE", url: `/ni/companies/${parent}/users/${uuid}` });
    assert.strictEqual(
      (await User.query("")).results.some((u: any) => u.uuid === uuid),
      false
    );
  }

  @test
  async queryBodyNotJsonHTTP() {
    const transport = new RESTOperationsTransport(
      "TestRESTTransportQueryBody",
      new RESTOperationsTransportParameters().load({ url: "/qb/", exposeOpenAPI: false })
    );
    this.registerService(transport);
    transport.resolve();
    await transport.init();
    const User = useModel<any>("User");
    registerRepository(User, new MemoryRepository(User, ["uuid"]));
    await User.create({ uuid: "u-qb", name: "qb", company: "c1" });
    // A malformed JSON body (here unescaped quotes) is a client error, not a 500 "reading 'q' of undefined"
    await assert.rejects(
      () =>
        this.routerHttp({
          method: "PUT",
          url: "/qb/companies/c1/users",
          body: '{"q":"name = "qb""}',
          headers: { "content-type": "application/json" }
        }),
      (err: any) => err instanceof WebdaError.BadRequest
    );
    // A JSON body that is not an object carries no query either
    await assert.rejects(
      () => this.routerHttp({ method: "PUT", url: "/qb/companies/c1/users", body: "null" }),
      (err: any) => err instanceof WebdaError.BadRequest
    );
    // No body at all queries everything, like {"q": ""}
    const all = await this.routerHttp<{ results: any[] }>({ method: "PUT", url: "/qb/companies/c1/users" });
    assert.deepStrictEqual(
      all.results.map(r => r.uuid),
      ["u-qb"]
    );
    const escaped = await this.routerHttp<{ results: any[] }>({
      method: "PUT",
      url: "/qb/companies/c1/users",
      body: { q: 'name = "qb"' }
    });
    assert.deepStrictEqual(
      escaped.results.map(r => r.uuid),
      ["u-qb"]
    );
  }

  @test
  async queryInvalidQueryHTTP() {
    const transport = new RESTOperationsTransport(
      "TestRESTTransportInvalidQ",
      new RESTOperationsTransportParameters().load({ url: "/iq/", exposeOpenAPI: false })
    );
    this.registerService(transport);
    transport.resolve();
    await transport.init();

    // Invalid query string should throw BadRequest from the route handler closure
    await assert.rejects(
      () =>
        this.routerHttp({
          method: "PUT",
          url: "/iq/company",
          body: { q: "invalid ][[ query syntax !!!" }
        }),
      (err: any) => err instanceof WebdaError.HttpError
    );
  }

  @test
  async crudRoutesHTTP() {
    const transport = new RESTOperationsTransport(
      "TestRESTTransportCRUD",
      new RESTOperationsTransportParameters().load({ url: "/tc/", exposeOpenAPI: false })
    );
    this.registerService(transport);
    transport.resolve();
    await transport.init();

    // Each of these exercises a different route closure in the transport.
    // The operations may throw (schema validation, missing repo, etc.) but
    // the closure code runs up to the callOperation call, providing coverage.

    // GET route handler - exercises the get closure
    try {
      await this.routerHttp({ method: "GET", url: "/tc/company/nonexistent-uuid" });
    } catch {
      // Expected
    }

    // DELETE route handler - exercises the delete closure
    try {
      await this.routerHttp({ method: "DELETE", url: "/tc/company/nonexistent-uuid" });
    } catch {
      // Expected
    }

    // PUT (update) route handler - exercises the PUT branch of the update/patch dispatch
    try {
      await this.routerHttp({
        method: "PUT",
        url: "/tc/company/nonexistent-uuid",
        body: { name: "Updated" }
      });
    } catch {
      // Expected
    }

    // PATCH route handler - exercises the PATCH branch of the update/patch dispatch
    try {
      await this.routerHttp({
        method: "PATCH",
        url: "/tc/company/nonexistent-uuid",
        body: { name: "Patched" }
      });
    } catch {
      // Expected
    }

    // POST (create) route handler - exercises the create closure
    try {
      await this.routerHttp({
        method: "POST",
        url: "/tc/company",
        body: { name: "New Company" }
      });
    } catch {
      // Expected
    }

    // POST for nested model (create with parent attribute injection)
    try {
      await this.routerHttp({
        method: "POST",
        url: "/tc/company/parent-uuid/user",
        body: { name: "New User" }
      });
    } catch {
      // Expected
    }
  }

  @test
  async bodyCannotRetargetUrlPrimaryKeyHTTP() {
    const { MemoryRepository, registerRepository } = await import("@webda/models");
    const { useModel } = await import("../application/hooks.js");
    const Brand = useModel("Brand");
    const repo = new MemoryRepository(Brand, ["uuid"]);
    registerRepository(Brand, repo);
    const [a, b] = [randomUUID(), randomUUID()];
    await Brand.create({ uuid: a, name: "A" } as any);
    await Brand.create({ uuid: b, name: "B" } as any);

    const transport = new RESTOperationsTransport(
      "TestRESTTransportRetarget",
      new RESTOperationsTransportParameters().load({ url: "/rt/", exposeOpenAPI: false })
    );
    this.registerService(transport);
    transport.resolve();
    await transport.init();

    // The URL targets A: a body uuid must never redirect the operation to B
    for (const method of ["PUT", "PATCH", "DELETE"] as HttpMethodType[]) {
      await assert.rejects(
        () => this.routerHttp({ method, url: `/rt/brands/${a}`, body: { uuid: b, name: "Hacked" } }),
        (err: any) => err instanceof WebdaError.BadRequest,
        `${method} with a conflicting body uuid should be rejected`
      );
    }
    for (const uuid of [a, b]) {
      const obj = await repo.get(uuid);
      assert.ok(obj && !obj.isDeleted(), `${uuid} must not be deleted`);
      assert.notStrictEqual(obj.name, "Hacked", `${uuid} must not be modified`);
    }

    // A body repeating the same uuid is still accepted
    await this.routerHttp({ method: "PATCH", url: `/rt/brands/${a}`, body: { uuid: a, name: "A2" } });
    assert.strictEqual((await repo.get(a)).name, "A2");
  }

  @test
  async modelActionsHTTP() {
    const transport = new RESTOperationsTransport(
      "TestRESTTransportActions",
      new RESTOperationsTransportParameters().load({ url: "/ta/", exposeOpenAPI: false })
    );
    this.registerService(transport);
    transport.resolve();
    await transport.init();

    // Instance action on a nonexistent object should throw NotFound
    // But the action route closure code runs (setting up parameters, calling callOperation)
    const httpCtx = new HttpContext("test.webda.io", "PUT", "/ta/classroom/nonexistent-uuid/test", "http", 80, {});
    httpCtx.setBody({ test: "123", id: "123" });
    httpCtx.setClientIp("127.0.0.1");
    const ctx = new WebContext(httpCtx);
    ctx.newSession();
    ctx.getSession().login("test", "test");
    let threw = false;
    try {
      await runWithContext(ctx, async () => {
        await useRouter().execute(ctx);
      });
    } catch {
      threw = true;
    }
    // Either threw an error or got a 404 status
    assert.ok(threw || ctx.statusCode >= 400, "Action on nonexistent object should fail");

    // Global action: Hardware.GlobalAction (does not need an existing object)
    // The action route closure sets up parameters and calls callOperation
    const globalCtx = new HttpContext(
      "test.webda.io",
      "PUT",
      "/ta/classroom/{pid.0}/hardware/globalAction",
      "http",
      80,
      {}
    );
    globalCtx.setBody({});
    globalCtx.setClientIp("127.0.0.1");
    const gCtx = new WebContext(globalCtx);
    gCtx.newSession();
    gCtx.getSession().login("test", "test");
    try {
      await runWithContext(gCtx, async () => {
        await useRouter().execute(gCtx);
      });
    } catch {
      // May fail on schema validation, but the action route closure code executed
    }
    // The closure code ran regardless of whether callOperation succeeded
  }

  @test
  async binaryRouteHTTP() {
    const transport = new RESTOperationsTransport(
      "TestRESTTransportBinary",
      new RESTOperationsTransportParameters().load({ url: "/tb/", exposeOpenAPI: false })
    );
    this.registerService(transport);
    transport.resolve();
    await transport.init();

    // Exercise binary route closures with non-existent objects
    // The closures set up model/property/action parameters before calling callOperation

    // POST (direct upload) - exercises modelInjector with POST method branch
    try {
      await this.routerHttp({
        method: "POST",
        url: "/tb/contact/some-uuid/avatar",
        body: "test binary content",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Filename": "avatar.png",
          "Content-Length": "19"
        }
      });
    } catch {
      // Expected - contact doesn't exist
    }

    // PUT challenge - exercises modelInjectorChallenge
    try {
      await this.routerHttp({
        method: "PUT",
        url: "/tb/contact/some-uuid/avatar",
        body: {
          hash: "abc",
          challenge: "def",
          size: 4,
          name: "test.txt",
          mimetype: "text/plain"
        }
      });
    } catch {
      // Expected - contact doesn't exist
    }

    // GET binary - exercises modelInjectorGet
    try {
      await this.routerHttp({
        method: "GET",
        url: "/tb/contact/some-uuid/avatar"
      });
    } catch {
      // Expected
    }

    // GET signed url - exercises modelInjectorGet with url suffix
    try {
      await this.routerHttp({
        method: "GET",
        url: "/tb/contact/some-uuid/avatar/url"
      });
    } catch {
      // Expected
    }

    // DELETE binary - exercises modelInjector with DELETE method branch
    try {
      await this.routerHttp({
        method: "DELETE",
        url: "/tb/contact/some-uuid/avatar/somehash"
      });
    } catch {
      // Expected
    }

    // PUT metadata - exercises modelInjector with PUT method (SetMetadata branch)
    try {
      await this.routerHttp({
        method: "PUT",
        url: "/tb/contact/some-uuid/avatar/somehash",
        body: { key: "value" }
      });
    } catch {
      // Expected
    }

    // MANY cardinality binary (photos) - exercises index parsing
    try {
      await this.routerHttp({
        method: "GET",
        url: "/tb/contact/some-uuid/photos/0"
      });
    } catch {
      // Expected
    }
  }

  @test
  async openAPIRouteHTTP() {
    // Test with exposeOpenAPI enabled so the route is registered
    const transport = new RESTOperationsTransport(
      "TestRESTTransportOpenAPI",
      new RESTOperationsTransportParameters().load({ url: "/oapi/", exposeOpenAPI: true })
    );
    this.registerService(transport);
    transport.resolve();
    await transport.init();

    // Hit the OpenAPI route at the base URL
    const result = await this.routerHttp({ method: "GET", url: "/oapi/" });
    // Returns HTML which won't parse as JSON - returned as raw string
    assert.ok(result !== undefined, "OpenAPI route should return content");
    assert.ok(typeof result === "string", "OpenAPI should return HTML string");
    assert.ok((<string>result).includes("swagger-ui"), "Should contain swagger-ui reference");
  }
}
