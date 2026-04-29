import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as sinon from "sinon";
import { WebdaApplicationTest } from "../test/index.js";
import { RESTOperationsTransport, RESTOperationsTransportParameters } from "./restoperationstransport.js";
import { useRouter } from "./hooks.js";
import { Router, RouterParameters } from "./router.js";
import { runWithContext } from "../contexts/execution.js";
import { useApplication, useModel } from "../application/hooks.js";
import { useInstanceStorage } from "../core/instancestorage.js";
import { DomainService, DomainServiceParameters } from "../services/domainservice.js";
import { WebContext } from "../contexts/webcontext.js";
import { HttpContext, HttpMethodType } from "../contexts/httpcontext.js";
import * as WebdaError from "../errors/errors.js";
import type { Application } from "../application/application.js";
import { hasSchema, registerSchema } from "../schemas/hooks.js";

/**
 * Task 10: RESTOperationsTransport must surface Behavior actions over HTTP at
 * `<prefix>/<plural>/{uuid}/<attribute>.<action>` (dot-separated, PUT-only).
 *
 * The bootstrap pattern mirrors the existing
 * `restoperationstransport.spec.ts` and `domainservice-behaviors.spec.ts`:
 * load the sample-app application, splice a fake MFA Behavior onto the User
 * model's metadata, then re-run `DomainService.initOperations` so the
 * operation registry is rebuilt with `User.Mfa.Verify` / `User.Mfa.Set`.
 * The transport's `initTransport` then walks the model tree and is expected
 * to register the matching REST routes.
 */
@suite
class RESTBehaviorsTest extends WebdaApplicationTest {
  getTestConfiguration(): string | undefined {
    return process.cwd() + "/../../sample-app";
  }

  protected async buildWebda() {
    const core = await super.buildWebda();
    // Strip beans so DomainService re-init works with a clean operation set.
    core.getBeans = () => {};
    core.registerBeans = () => {};
    // Manually wire a Router so HTTP-style requests can route through
    // useRouter().execute(ctx).
    const router = new Router("Router", new RouterParameters().load({}));
    this.registerService(router);
    router.resolve();
    await router.init();
    return core;
  }

  /**
   * Inject a Behavior into the loaded application's behaviors registry and
   * splice a `behaviors` relation into the User model metadata.
   *
   * Identical pattern to domainservice-behaviors.spec.ts — Task 10 reuses the
   * harness because we need the same compile-time shape (a Behavior on User
   * named `mfa` with `verify` + `set` actions) the dispatcher tests rely on,
   * but driven through the REST transport instead of `callOperation` directly.
   *
   * @param FakeMFA - the behavior class to register; defaults to a no-op stub
   */
  private patchUserWithMfaBehavior(_FakeMFA: any = class FakeMFA { verify() {} set() {} }): () => void {
    const app = useApplication<Application>() as any;
    const previousBehavior = app.behaviors["Test/MFA"];
    app.behaviors["Test/MFA"] = {
      metadata: {
        Identifier: "Test/MFA",
        Import: "fake:FakeMFA",
        Actions: {
          verify: { method: "PUT" },
          set: { method: "PUT" }
        }
      }
    };
    const User = useModel("User") as any;
    const previousMetadata = User.Metadata;
    User.Metadata = Object.freeze({
      ...previousMetadata,
      Relations: {
        ...(previousMetadata.Relations || {}),
        behaviors: [{ attribute: "mfa", behavior: "Test/MFA" }]
      }
    });
    return () => {
      User.Metadata = previousMetadata;
      if (previousBehavior === undefined) {
        delete app.behaviors["Test/MFA"];
      } else {
        app.behaviors["Test/MFA"] = previousBehavior;
      }
    };
  }

  /**
   * Wipe the operation registry, instantiate a DomainService, register it as
   * the bean, and run initOperations so the registry contains the behavior
   * operations (`User.Mfa.Verify`, `User.Mfa.Set`).
   *
   * @returns the User model class so tests can stub `User.ref(...)`
   */
  private rebuildBehaviorOperations() {
    const ops = useInstanceStorage().operations!;
    for (const k of Object.keys(ops)) delete ops[k];
    const service = new DomainService("DomainService", new DomainServiceParameters().load({}));
    useInstanceStorage().core!.getServices()["DomainService"] = service;
    service.initOperations();
    return { service, User: useModel<any>("User") };
  }

  /**
   * Stub `User.ref(uuid)` so the dispatcher's `model.ref(uuid).get()` call
   * resolves to `instance`. Returns the sinon stub so the caller can restore.
   */
  private stubModelRef(User: any, instance: any) {
    return sinon.stub(User, "ref").callsFake(() => ({
      async get() {
        return instance;
      }
    }));
  }

  /**
   * Execute an HTTP request through the Router and return the parsed body.
   * Mirrors the helper in restoperationstransport.spec.ts.
   */
  private async routerHttp<T = any>(options: {
    method: HttpMethodType;
    url: string;
    body?: any;
  }): Promise<T> {
    const httpContext = new HttpContext("test.webda.io", options.method, options.url, "http", 80, {});
    if (options.body !== undefined) {
      httpContext.setBody(options.body);
    }
    httpContext.setClientIp("127.0.0.1");
    const ctx = new WebContext(httpContext);
    ctx.newSession();
    let routeError: Error | undefined;
    await runWithContext(ctx, async () => {
      try {
        await useRouter().execute(ctx);
      } catch (err) {
        routeError = err instanceof Error ? err : new Error(String(err));
      }
    });
    if (routeError) {
      throw routeError;
    }
    if (ctx.statusCode >= 400) {
      const code = ctx.statusCode;
      const res = <string>ctx.getResponseBody();
      if (code === 404) throw new WebdaError.NotFound(res || "Not Found");
      if (code === 400) throw new WebdaError.BadRequest(res || "Bad Request");
      if (code === 403) throw new WebdaError.Forbidden(res || "Forbidden");
      throw new WebdaError.HttpError(res || "Error", code);
    }
    const res = <string>ctx.getResponseBody();
    if (res) {
      try {
        return JSON.parse(res);
      } catch {
        return res as any;
      }
    }
    return undefined as any;
  }

  /**
   * PUT /<prefix>/users/{uuid}/mfa.verify must dispatch `User.Mfa.Verify` and
   * pipe the body through the dispatcher into `mfa.verify(...)`.
   */
  @test
  async putMfaVerifyDispatchesBehaviorOperation() {
    const calls: any[] = [];
    class FakeMFA {
      async verify(totp: string) {
        calls.push(["verify", totp]);
        return { verified: true, totp };
      }
      async set() {}
    }
    const restore = this.patchUserWithMfaBehavior(FakeMFA);
    // Seed both schema registries the way the dispatcher tests do — the
    // operation registration uses hasSchema() (AJV) and resolveArguments uses
    // app.getSchemas() (cached modules), so both must agree.
    const app = useApplication<Application>() as any;
    const schemaName = "Test/MFA.verify.input";
    const schema = {
      type: "object",
      properties: {
        uuid: { type: "string" },
        totp: { type: "string" }
      },
      required: ["uuid", "totp"]
    };
    const wasRegistered = hasSchema(schemaName);
    if (!wasRegistered) registerSchema(schemaName, schema);
    const schemas = app.getSchemas();
    const previousVerifySchema = schemas[schemaName];
    schemas[schemaName] = schema;

    let refStub: sinon.SinonStub | undefined;
    try {
      const { User } = this.rebuildBehaviorOperations();
      // Spin up a transport at /api/ — it walks the model tree and should
      // register PUT /api/users/{uuid}/mfa.verify.
      const transport = new RESTOperationsTransport(
        "RESTBehaviorsTransportVerify",
        new RESTOperationsTransportParameters().load({ url: "/api/", exposeOpenAPI: false })
      );
      this.registerService(transport);
      transport.resolve();
      await transport.init();

      const fakeUser: any = {
        isDeleted: () => false,
        canAct: async (_ctx: any, action: string) => action === "mfa.verify",
        mfa: new FakeMFA()
      };
      refStub = this.stubModelRef(User, fakeUser);

      // User is nested under Company in sample-app; the transport's tree walk
      // produces `/api/companies/{pid.0}/users/{uuid}/mfa.verify`. The parent
      // company id is not consulted by the dispatcher (we stub User.ref) so any
      // string is fine.
      const result = await this.routerHttp<{ verified: boolean; totp: string }>({
        method: "PUT",
        url: "/api/companies/company-1/users/user-1/mfa.verify",
        body: { totp: "123456" }
      });
      assert.strictEqual(result.verified, true);
      assert.strictEqual(result.totp, "123456");
      assert.deepStrictEqual(calls, [["verify", "123456"]]);
      assert.ok(refStub.calledWith("user-1"), "expected User.ref to be called with the URL uuid");
    } finally {
      if (previousVerifySchema === undefined) {
        delete schemas[schemaName];
      } else {
        schemas[schemaName] = previousVerifySchema;
      }
      refStub?.restore();
      restore();
    }
  }

  /**
   * PUT /<prefix>/users/{uuid}/mfa.set must dispatch `User.Mfa.Set` — the
   * second action on the same Behavior to confirm the per-action loop, not
   * just the first action, gets a route.
   */
  @test
  async putMfaSetDispatchesBehaviorOperation() {
    const calls: any[] = [];
    class FakeMFA {
      async verify() {}
      async set(secret: string) {
        calls.push(["set", secret]);
        return { ok: true };
      }
    }
    const restore = this.patchUserWithMfaBehavior(FakeMFA);
    const app = useApplication<Application>() as any;
    const schemaName = "Test/MFA.set.input";
    const schema = {
      type: "object",
      properties: {
        uuid: { type: "string" },
        secret: { type: "string" }
      },
      required: ["uuid", "secret"]
    };
    const wasRegistered = hasSchema(schemaName);
    if (!wasRegistered) registerSchema(schemaName, schema);
    const schemas = app.getSchemas();
    const previousSetSchema = schemas[schemaName];
    schemas[schemaName] = schema;

    let refStub: sinon.SinonStub | undefined;
    try {
      const { User } = this.rebuildBehaviorOperations();
      const transport = new RESTOperationsTransport(
        "RESTBehaviorsTransportSet",
        new RESTOperationsTransportParameters().load({ url: "/v2/", exposeOpenAPI: false })
      );
      this.registerService(transport);
      transport.resolve();
      await transport.init();

      const fakeUser: any = {
        isDeleted: () => false,
        canAct: async () => true,
        mfa: new FakeMFA()
      };
      refStub = this.stubModelRef(User, fakeUser);

      const result = await this.routerHttp<{ ok: boolean }>({
        method: "PUT",
        url: "/v2/companies/company-1/users/user-2/mfa.set",
        body: { secret: "TOPSECRET" }
      });
      assert.strictEqual(result.ok, true);
      assert.deepStrictEqual(calls, [["set", "TOPSECRET"]]);
    } finally {
      if (previousSetSchema === undefined) {
        delete schemas[schemaName];
      } else {
        schemas[schemaName] = previousSetSchema;
      }
      refStub?.restore();
      restore();
    }
  }

  /**
   * Splice a Behavior with a single action whose `rest` metadata is the
   * given hint (or none, if `rest` is undefined). Returns a restore() fn,
   * the User model, and the spun-up transport instance.
   *
   * Hand-rolled metadata (rather than running the ts-plugin transformer on
   * inline sources) is the same trick `patchUserWithMfaBehavior` uses — the
   * test environment does not run the compiler.
   */
  private async setupBehaviorWithRest(
    actionName: string,
    rest: { route?: string; method?: string } | undefined,
    transportName: string,
    urlPrefix: string
  ): Promise<{ restore: () => void; User: any; transport: RESTOperationsTransport }> {
    const app = useApplication<Application>() as any;
    const previousBehavior = app.behaviors["Test/MFA"];
    const actionMeta: any = {};
    if (rest !== undefined) actionMeta.rest = rest;
    app.behaviors["Test/MFA"] = {
      metadata: {
        Identifier: "Test/MFA",
        Import: "fake:FakeMFA",
        Actions: { [actionName]: actionMeta }
      }
    };

    const User = useModel("User") as any;
    const previousMetadata = User.Metadata;
    User.Metadata = Object.freeze({
      ...previousMetadata,
      Relations: {
        ...(previousMetadata.Relations || {}),
        behaviors: [{ attribute: "mfa", behavior: "Test/MFA" }]
      }
    });

    // Reset operations registry and rebuild
    const ops = useInstanceStorage().operations!;
    for (const k of Object.keys(ops)) delete ops[k];
    const service = new DomainService("DomainService", new DomainServiceParameters().load({}));
    useInstanceStorage().core!.getServices()["DomainService"] = service;
    service.initOperations();

    const transport = new RESTOperationsTransport(
      transportName,
      new RESTOperationsTransportParameters().load({ url: urlPrefix, exposeOpenAPI: false })
    );
    this.registerService(transport);
    transport.resolve();
    await transport.init();

    const restore = () => {
      User.Metadata = previousMetadata;
      if (previousBehavior === undefined) {
        delete app.behaviors["Test/MFA"];
      } else {
        app.behaviors["Test/MFA"] = previousBehavior;
      }
    };
    return { restore, User, transport };
  }

  /**
   * Default (no rest hint) keeps the dot-notation URL and PUT.
   */
  @test
  async defaultRouteIsDotNotationPut() {
    const { restore } = await this.setupBehaviorWithRest("verify", undefined, "RESTRestDefault", "/r0/");
    try {
      const doc = useRouter().exportOpenAPI(true);
      const path = "/r0/companies/{pid.0}/users/{uuid}/mfa.verify";
      assert.ok(doc.paths[path], `expected ${path} in paths, got: ${Object.keys(doc.paths).join(", ")}`);
      assert.ok((doc.paths[path] as any).put, "expected PUT operation");
    } finally {
      restore();
    }
  }

  /**
   * `rest: { route: ".", method: "GET" }` exposes the bare attribute path
   * with GET.
   */
  @test
  async restRouteDotMapsToBareAttributeGet() {
    const { restore } = await this.setupBehaviorWithRest(
      "get",
      { route: ".", method: "GET" },
      "RESTRestDot",
      "/r1/"
    );
    try {
      const doc = useRouter().exportOpenAPI(true);
      const path = "/r1/companies/{pid.0}/users/{uuid}/mfa";
      assert.ok(doc.paths[path], `expected ${path} in paths, got: ${Object.keys(doc.paths).join(", ")}`);
      assert.ok((doc.paths[path] as any).get, "expected GET operation");
      assert.strictEqual((doc.paths[path] as any).put, undefined, "PUT should not be registered");
    } finally {
      restore();
    }
  }

  /**
   * `rest: { route: "url", method: "GET" }` appends the route as a slash
   * suffix.
   */
  @test
  async restRouteSuffixMapsToSlashAppended() {
    const { restore } = await this.setupBehaviorWithRest(
      "getUrl",
      { route: "url", method: "GET" },
      "RESTRestSuffix",
      "/r2/"
    );
    try {
      const doc = useRouter().exportOpenAPI(true);
      const path = "/r2/companies/{pid.0}/users/{uuid}/mfa/url";
      assert.ok(doc.paths[path], `expected ${path} in paths, got: ${Object.keys(doc.paths).join(", ")}`);
      assert.ok((doc.paths[path] as any).get, "expected GET operation");
    } finally {
      restore();
    }
  }

  /**
   * `rest: { route: "{hash}", method: "PUT" }` keeps path templates intact.
   */
  @test
  async restRouteTemplatePreservesPathVariables() {
    const { restore } = await this.setupBehaviorWithRest(
      "setMetadata",
      { route: "{hash}", method: "PUT" },
      "RESTRestTemplate",
      "/r3/"
    );
    try {
      const doc = useRouter().exportOpenAPI(true);
      const path = "/r3/companies/{pid.0}/users/{uuid}/mfa/{hash}";
      assert.ok(doc.paths[path], `expected ${path} in paths, got: ${Object.keys(doc.paths).join(", ")}`);
      assert.ok((doc.paths[path] as any).put, "expected PUT operation");
    } finally {
      restore();
    }
  }

  /**
   * Three actions on `route: "."` differentiated by HTTP method (POST, PUT, GET)
   * — single path, three method registrations.
   */
  @test
  async restRouteDotMultipleMethodsCoexist() {
    const app = useApplication<Application>() as any;
    const previousBehavior = app.behaviors["Test/MFA"];
    app.behaviors["Test/MFA"] = {
      metadata: {
        Identifier: "Test/MFA",
        Import: "fake:FakeMFA",
        Actions: {
          attach: { rest: { route: ".", method: "POST" } },
          attachChallenge: { rest: { route: ".", method: "PUT" } },
          get: { rest: { route: ".", method: "GET" } }
        }
      }
    };

    const User = useModel("User") as any;
    const previousMetadata = User.Metadata;
    User.Metadata = Object.freeze({
      ...previousMetadata,
      Relations: {
        ...(previousMetadata.Relations || {}),
        behaviors: [{ attribute: "mfa", behavior: "Test/MFA" }]
      }
    });

    try {
      const ops = useInstanceStorage().operations!;
      for (const k of Object.keys(ops)) delete ops[k];
      const service = new DomainService("DomainService", new DomainServiceParameters().load({}));
      useInstanceStorage().core!.getServices()["DomainService"] = service;
      service.initOperations();

      const transport = new RESTOperationsTransport(
        "RESTRestMultiMethod",
        new RESTOperationsTransportParameters().load({ url: "/r4/", exposeOpenAPI: false })
      );
      this.registerService(transport);
      transport.resolve();
      await transport.init();

      const doc = useRouter().exportOpenAPI(true);
      const path = "/r4/companies/{pid.0}/users/{uuid}/mfa";
      assert.ok(doc.paths[path], `expected ${path} in paths, got: ${Object.keys(doc.paths).join(", ")}`);
      const node = doc.paths[path] as any;
      assert.ok(node.post, "expected POST operation on bare path");
      assert.ok(node.put, "expected PUT operation on bare path");
      assert.ok(node.get, "expected GET operation on bare path");
    } finally {
      User.Metadata = previousMetadata;
      if (previousBehavior === undefined) {
        delete app.behaviors["Test/MFA"];
      } else {
        app.behaviors["Test/MFA"] = previousBehavior;
      }
    }
  }

  /**
   * The exported OpenAPI document must include the new behavior paths under
   * `paths`, with `put` defined and the model's tag.
   */
  @test
  async openApiDocumentIncludesBehaviorPaths() {
    const restore = this.patchUserWithMfaBehavior();
    try {
      this.rebuildBehaviorOperations();
      const transport = new RESTOperationsTransport(
        "RESTBehaviorsTransportOpenAPI",
        new RESTOperationsTransportParameters().load({ url: "/oa/", exposeOpenAPI: false })
      );
      this.registerService(transport);
      transport.resolve();
      await transport.init();

      const doc = useRouter().exportOpenAPI(true);
      // User is nested under Company in sample-app — paths reflect the parent
      // segment that walkModel injects.
      const verifyPath = "/oa/companies/{pid.0}/users/{uuid}/mfa.verify";
      const setPath = "/oa/companies/{pid.0}/users/{uuid}/mfa.set";
      assert.ok(
        doc.paths[verifyPath],
        `expected ${verifyPath} in OpenAPI paths, found: ${Object.keys(doc.paths)
          .filter(p => p.includes("mfa"))
          .join(", ")}`
      );
      assert.ok(doc.paths[setPath], `expected ${setPath} in OpenAPI paths`);
      const verifyOp = (doc.paths[verifyPath] as any).put;
      assert.ok(verifyOp, "expected PUT operation on the verify path");
      assert.deepStrictEqual(verifyOp.tags, ["User"]);
      assert.ok(/verify/i.test(verifyOp.summary), `expected summary to mention verify, got: ${verifyOp.summary}`);
      assert.strictEqual(verifyOp.operationId, "User.Mfa.Verify");
    } finally {
      restore();
    }
  }
}
