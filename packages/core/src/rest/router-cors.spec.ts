import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/index.js";
import { Router, RouterParameters } from "./router.service.js";
import { runWithContext } from "../contexts/execution.js";
import { WebContext } from "../contexts/webcontext.js";
import { HttpContext, HttpMethodType } from "../contexts/httpcontext.js";
import { CorsOriginFilter } from "./originfilter.js";

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
}
