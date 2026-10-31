import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/index.js";
import { Router, RouterParameters } from "./router.service.js";
import { runWithContext } from "../contexts/execution.js";
import { WebContext } from "../contexts/webcontext.js";
import { HttpContext, HttpMethodType } from "../contexts/httpcontext.js";

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
}
