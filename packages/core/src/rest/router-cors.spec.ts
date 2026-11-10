import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/index.js";
import { Router, RouterParameters } from "./router.service.js";
import { runWithContext } from "../contexts/execution.js";
import { WebContext } from "../contexts/webcontext.js";
import { HttpContext, HttpMethodType } from "../contexts/httpcontext.js";
import { CorsOriginFilter, OriginFilter, WebsiteOriginFilter } from "./originfilter.js";
import { MemoryLogger, useWorkerOutput } from "@webda/workout";
import { emitCoreEvent } from "../events/events.js";
import { User } from "../models/user.model.js";
import { hasSchema } from "../schemas/hooks.js";
import { useApplication } from "../application/hooks.js";

/**
 * CORS response headers are sent for the allowed websites only
 */
@suite
class RouterCorsTest extends WebdaApplicationTest {
  router: Router;

  getTestConfiguration(): any {
    return { parameters: { ignoreBeans: true } };
  }

  protected async buildWebda() {
    const core = await super.buildWebda();
    this.router = new Router("Router", new RouterParameters().load({}));
    this.registerService(this.router);
    this.router.resolve();
    await this.router.init();
    this.router.addRouteToRouter("/test", {
      methods: ["GET", "POST"],
      executor: "Router",
      _method: async (ctx: WebContext) => ctx.write({ ok: true })
    } as any);
    return core;
  }

  /**
   * Allow the given origins (matched on the Origin header)
   * @param origins - allowed origins or "*"
   */
  allow(origins: string[]) {
    // Only the filter of this test
    this.router["_requestCORSFilters"] = [];
    this.router.registerCORSFilter({
      checkRequest: async ctx => {
        const origin = ctx.getHttpContext().getUniqueHeader("origin");
        return origins.includes("*") || origins.includes(origin);
      }
    });
  }

  /**
   * Execute a request through the router
   * @param method - the HTTP method
   * @param headers - request headers
   * @returns the web context after execution
   */
  async request(method: HttpMethodType, headers: { [key: string]: string }): Promise<WebContext> {
    const ctx = new WebContext(new HttpContext("api.example.com", method, "/test", "https", 443, headers));
    ctx.newSession();
    await runWithContext(ctx, () => this.router.execute(ctx));
    return ctx;
  }

  /**
   * @param ctx - executed context
   * @returns the Access-Control response header names
   */
  corsHeaders(ctx: WebContext): string[] {
    return Object.keys(ctx.getResponseHeaders()).filter(h => h.toLowerCase().startsWith("access-control"));
  }

  @test
  async preflightAllowed() {
    this.allow(["https://ui.example.com"]);
    this.router.addCorsAllowedHeaders("traceparent");
    this.router.addCorsAllowedHeaders("traceparent", "X-Webda-Trace");
    const ctx = await this.request("OPTIONS", { Origin: "https://ui.example.com" });
    const headers = ctx.getResponseHeaders();
    assert.strictEqual(ctx.statusCode, 204);
    assert.strictEqual(headers["Access-Control-Allow-Origin"], "https://ui.example.com");
    assert.strictEqual(headers["Access-Control-Allow-Credentials"], "true");
    assert.ok(String(headers["Vary"]).includes("Origin"));
    assert.strictEqual(headers["Access-Control-Allow-Methods"], "GET,POST");
    const allowed = String(headers["Access-Control-Allow-Headers"])
      .split(",")
      .map(h => h.trim());
    for (const h of this.router.getCorsAllowedHeaders()) assert.ok(allowed.includes(h), h);
    assert.ok(allowed.includes("traceparent") && allowed.includes("X-Webda-Trace") && allowed.includes("Content-Type"));
    assert.strictEqual(allowed.filter(h => h === "traceparent").length, 1);
  }

  @test
  async simpleRequestAllowed() {
    this.allow(["https://ui.example.com"]);
    const ctx = await this.request("GET", { Origin: "https://ui.example.com" });
    const headers = ctx.getResponseHeaders();
    assert.strictEqual(headers["Access-Control-Allow-Origin"], "https://ui.example.com");
    assert.strictEqual(headers["Access-Control-Allow-Credentials"], "true");
    assert.ok(String(headers["Vary"]).includes("Origin"));
    assert.strictEqual(headers["Access-Control-Allow-Headers"], undefined);
  }

  @test
  async disallowedOrMissingOrigin() {
    this.allow(["https://ui.example.com"]);
    assert.deepStrictEqual(this.corsHeaders(await this.request("GET", { Origin: "https://evil.example.com" })), []);
    assert.deepStrictEqual(this.corsHeaders(await this.request("OPTIONS", { Origin: "https://evil.example.com" })), []);
    assert.deepStrictEqual(this.corsHeaders(await this.request("GET", {})), []);
    assert.deepStrictEqual(this.corsHeaders(await this.request("OPTIONS", {})), []);
  }

  @test
  async wildcardEchoesOrigin() {
    this.allow(["*"]);
    const ctx = await this.request("GET", { Origin: "https://anything.example.org" });
    assert.strictEqual(ctx.getResponseHeaders()["Access-Control-Allow-Origin"], "https://anything.example.org");
  }

  @test
  async varyOriginAlwaysAndPreserved() {
    this.allow(["https://ui.example.com"]);
    const denied = await this.request("GET", { Origin: "https://evil.example.com" });
    assert.strictEqual(denied.getResponseHeaders()["Vary"], "Origin");
    assert.deepStrictEqual(this.corsHeaders(denied), []);
    assert.strictEqual((await this.request("GET", {})).getResponseHeaders()["Vary"], undefined);
    // Pre-existing Vary is preserved, without duplicate
    const ctx = new WebContext(
      new HttpContext("api.example.com", "GET", "/test", "https", 443, { Origin: "https://ui.example.com" })
    );
    ctx.newSession();
    ctx.setHeader("Vary", "Accept-Encoding");
    await runWithContext(ctx, () => this.router.execute(ctx));
    assert.strictEqual(ctx.getResponseHeaders()["Vary"], "Accept-Encoding, Origin");
    const again = new WebContext(
      new HttpContext("api.example.com", "GET", "/test", "https", 443, { Origin: "https://ui.example.com" })
    );
    again.newSession();
    again.setHeader("Vary", "origin");
    await runWithContext(again, () => this.router.execute(again));
    assert.strictEqual(again.getResponseHeaders()["Vary"], "origin");
  }

  @test
  async preflightMaxAge() {
    this.allow(["https://ui.example.com"]);
    const ctx = await this.request("OPTIONS", { Origin: "https://ui.example.com" });
    assert.strictEqual(ctx.getResponseHeaders()["Access-Control-Max-Age"], "3600");
    // An existing value is kept
    const custom = new WebContext(
      new HttpContext("api.example.com", "OPTIONS", "/test", "https", 443, { Origin: "https://ui.example.com" })
    );
    custom.newSession();
    custom.setHeader("Access-Control-Max-Age", "60");
    await runWithContext(custom, () => this.router.execute(custom));
    assert.strictEqual(custom.getResponseHeaders()["Access-Control-Max-Age"], "60");
    // Not on a refused preflight nor on a simple request
    assert.strictEqual(
      (await this.request("OPTIONS", { Origin: "https://evil.example.com" })).getResponseHeaders()[
        "Access-Control-Max-Age"
      ],
      undefined
    );
    assert.strictEqual(
      (await this.request("GET", { Origin: "https://ui.example.com" })).getResponseHeaders()["Access-Control-Max-Age"],
      undefined
    );
  }

  @test
  async nullOriginNeverEchoed() {
    this.allow(["*", "null"]);
    for (const method of ["GET", "OPTIONS"] as HttpMethodType[]) {
      const ctx = await this.request(method, { Origin: "null" });
      assert.deepStrictEqual(this.corsHeaders(ctx), [], method);
      assert.strictEqual(ctx.getResponseHeaders()["Vary"], "Origin");
    }
  }

  @test
  async corsOriginFilterMatching() {
    const filter = new CorsOriginFilter([
      "https://ui.example.com",
      "http://localhost:5173",
      "https://*.apps.example.com"
    ]);
    // Exact origins: scheme, host and port must all match, host case-insensitively
    assert.ok(filter.matches("https://ui.example.com"));
    assert.ok(filter.matches("https://UI.Example.com"));
    assert.ok(filter.matches("https://ui.example.com:443"));
    assert.ok(filter.matches("http://localhost:5173"));
    assert.ok(!filter.matches("http://ui.example.com"));
    assert.ok(!filter.matches("https://ui.example.com:8443"));
    assert.ok(!filter.matches("http://localhost:5174"));
    // Not a regex: the dots are literal
    assert.ok(!filter.matches("https://uiXexample.com"));
    assert.ok(!filter.matches("https://ui.example.com.evil.io"));
    assert.ok(!filter.matches("https://evilui.example.com"));
    // Wildcard: subdomains only, any depth, never the apex
    assert.ok(filter.matches("https://a.apps.example.com"));
    assert.ok(filter.matches("https://a.b.apps.example.com"));
    assert.ok(!filter.matches("https://apps.example.com"));
    assert.ok(!filter.matches("https://a.apps.example.com.evil.io"));
    assert.ok(!filter.matches("https://aapps.example.com"));
    assert.ok(!filter.matches("http://a.apps.example.com"));
    // Never: null, missing or malformed origins
    assert.ok(!filter.matches("null"));
    assert.ok(!filter.matches(undefined));
    assert.ok(!filter.matches(""));
    assert.ok(!filter.matches("not an origin"));
    assert.ok(!filter.matches("https://ui.example.com/path"));
    // "*" accepts any well-formed origin, still never null
    const any = new CorsOriginFilter("*");
    assert.ok(any.matches("https://whatever.io"));
    assert.ok(!any.matches("null"));
    assert.ok(!any.matches("garbage"));
    // Malformed configuration entries are ignored, not fatal
    const broken = new CorsOriginFilter(["::::", "https://ok.example.com"]);
    assert.ok(broken.matches("https://ok.example.com"));
    // Opaque origins (non-special schemes) are never accepted, even by "*"
    assert.ok(!any.matches("foo://bar"));
    assert.ok(!any.matches("file:///etc/passwd"));
    // nor configurable: ignored with a warning
    const memoryLogger = new MemoryLogger(useWorkerOutput());
    let opaque: CorsOriginFilter;
    try {
      opaque = new CorsOriginFilter(["file:///tmp", "foo://bar"]);
    } finally {
      memoryLogger.close();
    }
    assert.ok(!opaque.matches("foo://bar"));
    assert.ok(!opaque.matches("file:///tmp"));
    assert.deepStrictEqual(
      memoryLogger
        .getLogs()
        .filter(m => m.log?.level === "WARN")
        .map(m => m.log!.args[0]),
      ["Ignoring invalid CORS origin 'file:///tmp'", "Ignoring invalid CORS origin 'foo://bar'"]
    );
  }

  @test
  async websiteParameterRegistersOriginFilter() {
    const router = new Router("Router2", new RouterParameters().load({ website: ["https://ui.example.com"] }));
    this.registerService(router);
    router.resolve();
    await router.init();
    router.addRouteToRouter("/test", {
      methods: ["GET"],
      _method: async (ctx: WebContext) => ctx.write({ ok: true })
    } as any);
    const run = async (origin: string) => {
      const ctx = new WebContext(new HttpContext("api.example.com", "GET", "/test", "https", 443, { Origin: origin }));
      ctx.newSession();
      await runWithContext(ctx, () => router.execute(ctx));
      return ctx.getResponseHeaders();
    };
    assert.strictEqual((await run("https://ui.example.com"))["Access-Control-Allow-Origin"], "https://ui.example.com");
    assert.strictEqual((await run("https://evil.example.com"))["Access-Control-Allow-Origin"], undefined);
    // A string is accepted too
    assert.deepStrictEqual(new RouterParameters().load({ website: "https://a.io" }).website, ["https://a.io"]);
    // No website: no filter registered
    assert.strictEqual(this.router["_requestCORSFilters"].filter(f => f instanceof CorsOriginFilter).length, 0);
  }

  @test
  async csrfRejectsCrossOriginCookieMutation() {
    this.allow(["https://ui.example.com"]);
    let executed = 0;
    this.router.addRouteToRouter("/csrf-target", {
      methods: ["POST"],
      executor: "Router",
      _method: async () => {
        executed++;
      }
    } as any);
    this.router.remapRoutes();

    const evilCtx = new WebContext(
      new HttpContext("api.example.com", "POST", "/csrf-target", "https", 443, { Origin: "https://evil.example.com" })
    );
    evilCtx.newSession().login("u1", "i1");
    await runWithContext(evilCtx, () => this.router.execute(evilCtx));
    assert.strictEqual(evilCtx.statusCode, 403);
    assert.strictEqual(executed, 0);

    const sameCtx = new WebContext(
      new HttpContext("api.example.com", "POST", "/csrf-target", "https", 443, { Origin: "https://api.example.com" })
    );
    sameCtx.newSession().login("u1", "i1");
    await runWithContext(sameCtx, () => this.router.execute(sameCtx));
    assert.strictEqual(executed, 1);

    const wsEvilCtx = new WebContext(
      new HttpContext("api.example.com", "GET", "/ws", "https", 443, {
        Origin: "https://evil.example.com",
        Upgrade: "websocket"
      })
    );
    wsEvilCtx.newSession().login("u1", "i1");
    assert.strictEqual(await this.router.checkRequest(wsEvilCtx), false);

    const optLoggedCtx = new WebContext(
      new HttpContext("api.example.com", "OPTIONS", "/csrf-target", "https", 443, {
        Origin: "https://evil.example.com"
      })
    );
    optLoggedCtx.newSession().login("u1", "i1");
    assert.strictEqual(await this.router.checkRequest(optLoggedCtx), true);

    const noSessionPostCtx = new WebContext(
      new HttpContext("api.example.com", "POST", "/csrf-target", "https", 443, {
        Origin: "https://evil.example.com"
      })
    );
    assert.strictEqual(await this.router.checkRequest(noSessionPostCtx), true);
  }

  @test
  async additionalRouterAndOriginFilterCoverage() {
    // 1. OriginFilter & WebsiteOriginFilter
    const of = new OriginFilter(["https://other.com", "api.example.com"]);
    const ctxOrigin = new WebContext(new HttpContext("other.com", "GET", "/test", "https", 443, {}));
    assert.strictEqual(await of.checkRequest(ctxOrigin), true);
    const ctxHost = new WebContext(new HttpContext("api.example.com", "GET", "/test", "https", 443, {}));
    assert.strictEqual(await of.checkRequest(ctxHost), true);
    const ctxMiss = new WebContext(new HttpContext("nope.com", "GET", "/test", "https", 443, {}));
    assert.strictEqual(await of.checkRequest(ctxMiss), false);

    const wofObj = new WebsiteOriginFilter({ url: "https://a.com" });
    assert.strictEqual(await wofObj.checkRequest(ctxMiss), false);
    const wofStr = new WebsiteOriginFilter("https://other.com");
    assert.strictEqual(await wofStr.checkRequest(ctxOrigin), true);
    const wofArr = new WebsiteOriginFilter(["api.example.com"]);
    assert.strictEqual(await wofArr.checkRequest(ctxHost), true);
    const wofWild = new WebsiteOriginFilter(["*"]);
    assert.strictEqual(await wofWild.checkRequest(ctxMiss), true);

    // 2. hasSchema with a Storable instance
    assert.strictEqual(typeof hasSchema(new User()), "boolean");

    // 3. Router Webda.Init event listener (line 313) & getModelUrl(Storable) (line 325)
    emitCoreEvent("Webda.Init", undefined as any);
    assert.strictEqual(this.router.getModelUrl(new User()), undefined);

    // 4. addRouteToRouter with overrideWarning = true (lines 379-383)
    this.router.getParameters().overrideWarning = true;
    this.router.addRouteToRouter("/overlap-warn", {
      methods: ["GET"],
      executor: "Router",
      _method: async () => {}
    } as any);
    this.router.addRouteToRouter("/overlap-warn", {
      methods: ["GET"],
      executor: "Router",
      _method: async () => {}
    } as any);
    this.router.addRouteToRouter("/overlap-warn", {
      methods: ["POST"],
      executor: "Router",
      _method: async () => {}
    } as any);

    // 5. getOpenAPISchema string & object (lines 816-821)
    assert.deepStrictEqual(this.router.getOpenAPISchema("MySchema"), { $ref: "#/components/schemas/MySchema" });
    assert.deepStrictEqual(this.router.getOpenAPISchema({ type: "string" }), { type: "string" });
    assert.deepStrictEqual(this.router.getOpenAPISchema(undefined), { $ref: "#/components/schemas/Object" });

    // 6. completeOpenAPI with {?*q} and POST route with schemas.input (lines 853, 930)
    this.router.addRouteToRouter("/openapi-cov{?*q}", {
      methods: ["POST"],
      executor: "Router",
      _method: async () => {},
      openapi: {
        post: {
          schemas: {
            input: "MyInput",
            output: "MyOutput"
          }
        }
      }
    } as any);
    this.router.remapRoutes();
    const doc: any = { openapi: "3.0.0", info: { title: "T", version: "1" }, paths: {}, tags: [] };
    this.router.completeOpenAPI(doc, false);
    assert.ok(doc.paths["/openapi-cov"]?.post?.requestBody);

    // 7. route execution with string _method and executor service name (lines 1129-1132)
    let called = false;
    const mySvc: any = {
      getName: () => "StringMethodSvc",
      getOpenApiReplacements: () => ({}),
      myHandler: async () => {
        called = true;
      }
    };
    this.registerService(mySvc);
    this.router.addRouteToRouter("/str-method", {
      methods: ["GET"],
      executor: "StringMethodSvc",
      _method: "myHandler"
    } as any);
    this.router.remapRoutes();
    const strCtx = new WebContext(new HttpContext("api.example.com", "GET", "/str-method", "https", 443, {}));
    strCtx.newSession();
    await runWithContext(strCtx, () => this.router.execute(strCtx));
    assert.strictEqual(called, true);

    // 8. exportOpenAPI with author/license as objects and model schema with empty required: [] (lines 1283-1292, 1359)
    const app = useApplication();
    const origPkg = app.getPackageDescription;
    app.getPackageDescription = () => ({
      name: "pkg",
      version: "1.0.0",
      author: { name: "AuthorObj" },
      license: { name: "MITObj" }
    });
    const schemas = app.getSchemas();
    schemas["WebdaCore/User"] = { type: "object", required: [] };
    try {
      const exported = this.router.exportOpenAPI();
      assert.strictEqual(exported.info.contact?.name, "AuthorObj");
      assert.strictEqual(exported.info.license?.name, "MITObj");
    } finally {
      app.getPackageDescription = origPkg;
    }

    // 9. discoverRoutes with non-method executor, undefined finalUrl, and valid route (lines 1461-1471)
    class FakeDiscoveredService {
      static routes = {
        "/bad": [{ executor: "notAMethod", methods: ["GET"] }],
        skip: [{ executor: "goodMethod", methods: ["GET"] }],
        "/good": [{ executor: "goodMethod", methods: ["GET"], openapi: {} }]
      };
      notAMethod = 123;
      getName() {
        return "FakeDiscoveredService";
      }
      goodMethod() {}
      getUrl(path: string) {
        return path.startsWith("/") ? path : undefined;
      }
    }
    this.router.discoverRoutes([undefined as any, new FakeDiscoveredService() as any]);
  }
}
