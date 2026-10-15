import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/index.js";
import { HttpContext, HttpMethodType } from "../contexts/httpcontext.js";
import { WebContext } from "../contexts/webcontext.js";
import { useRouter } from "./hooks.js";
import { RouteInfo, RouterParameters, compileAliasTarget } from "./router.service.js";
import * as WebdaError from "../errors/errors.js";
import { runWithContext } from "../contexts/execution.js";
import { IWebContext } from "../contexts/icontext.js";
import { useParameters } from "../application/hooks.js";
import { useWorkerOutput } from "@webda/workout";

/**
 * Route aliases in Router test suite (#684)
 */
@suite
class RouterAliasTest extends WebdaApplicationTest {
  private baseRoutes: Record<string, RouteInfo[]>;

  override async beforeAll() {
    await super.beforeAll();
    const routes = useRouter().getRoutes();
    this.baseRoutes = Object.fromEntries(Object.keys(routes).map(url => [url, routes[url]]));
  }

  override async afterEach() {
    await super.afterEach();
    delete useParameters().routePrefix;
    const router = useRouter();
    const routes = router.getRoutes();
    for (const url of Object.keys(routes)) delete routes[url];
    Object.assign(routes, this.baseRoutes);
    for (const url of Object.keys(router.getAliases())) router.removeAlias(url);
    router.remapRoutes();
  }

  /**
   * Helper to execute a request through the router
   */
  async request(
    method: HttpMethodType,
    url: string,
    options: {
      userId?: string;
      mfa?: "none" | "pending" | "verified";
      prefix?: string;
      headers?: Record<string, string>;
      body?: any;
    } = {}
  ): Promise<{ ctx: WebContext; statusCode: number; body?: any; error?: any }> {
    const httpContext = new HttpContext("test.webda.io", method, url, "http", 80, options.headers || {});
    if (options.prefix) {
      httpContext.setPrefix(options.prefix);
    }
    if (options.body) {
      httpContext.setBody(options.body);
    }
    const ctx = await this.newWebContext(httpContext);
    ctx.newSession();
    if (options.userId) {
      ctx.getSession().login(options.userId, `${options.userId}@test.com:email`, { mfa: options.mfa ?? "none" });
    } else if (options.mfa === "pending") {
      ctx.getSession().login("pending-user", "pending@test.com:email", { mfa: "pending" });
    }
    let error: any;
    let statusCode: number;
    try {
      await runWithContext(ctx, () => useRouter().execute(ctx));
      statusCode = ctx.getResponseCode();
    } catch (err: any) {
      error = err;
      statusCode = err?.getResponseCode?.() || 500;
    }
    let body = ctx.getResponseBody();
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        // keep raw string
      }
    }
    return { ctx, statusCode, body, error };
  }

  /**
   * 1. Static alias: /healthz -> /version serves the /version route, and routeAlias extension is set
   */
  @test
  async testStaticAlias() {
    useRouter().addRouteToRouter("/version", {
      methods: ["GET"],
      executor: "Router",
      _method: async (ctx: WebContext) => {
        ctx.write({ version: "1.0.0" });
      }
    } as RouteInfo);
    useRouter().addAlias("/healthz", "/version");

    const res = await this.request("GET", "/healthz");
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { version: "1.0.0" });
    assert.deepStrictEqual(res.ctx.getExtension("routeAlias"), {
      alias: "/healthz",
      target: "/version"
    });
  }

  /**
   * 2. User alias: /me -> /users/${user.id}
   * With logged session receives uuid=123. Without session returns 401. With mfa: "pending" returns 401.
   */
  @test
  async testUserAlias() {
    useRouter().addRouteToRouter("/users/{uuid}", {
      methods: ["GET"],
      executor: "Router",
      _method: async (ctx: WebContext) => {
        ctx.write({ uuid: ctx.getParameters().uuid });
      }
    } as RouteInfo);
    useRouter().addAlias("/me", "/users/${user.id}");

    // Logged in user
    const resLoggedIn = await this.request("GET", "/me", { userId: "123" });
    assert.strictEqual(resLoggedIn.statusCode, 200);
    assert.deepStrictEqual(resLoggedIn.body, { uuid: "123" });
    assert.deepStrictEqual(resLoggedIn.ctx.getExtension("routeAlias"), {
      alias: "/me",
      target: "/users/123"
    });

    // Without session
    const resNoSession = await this.request("GET", "/me");
    assert.strictEqual(resNoSession.statusCode, 401);
    assert.ok(resNoSession.error instanceof WebdaError.Unauthorized);

    // With MFA pending
    const resMfaPending = await this.request("GET", "/me", { mfa: "pending" });
    assert.strictEqual(resMfaPending.statusCode, 401);
    assert.ok(resMfaPending.error instanceof WebdaError.Unauthorized);
  }

  /**
   * 3. Param + rest: /me/{+rest} -> /users/${user.id}/${params.rest} reaches /users/123/images/0
   */
  @test
  async testParamAndRest() {
    useRouter().addRouteToRouter("/users/{uuid}/images/{index}", {
      methods: ["GET"],
      executor: "Router",
      _method: async (ctx: WebContext) => {
        ctx.write({ uuid: ctx.getParameters().uuid, index: ctx.getParameters().index });
      }
    } as RouteInfo);
    useRouter().addAlias("/me/{+rest}", "/users/${user.id}/${params.rest}");

    const res = await this.request("GET", "/me/images/0", { userId: "123" });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { uuid: "123", index: "0" });
    assert.deepStrictEqual(res.ctx.getExtension("routeAlias"), {
      alias: "/me/{+rest}",
      target: "/users/123/images/0"
    });
  }

  /**
   * 4. Query propagation: /me?fields=a -> the target receives fields=a, and query templates {?q*} on aliases work
   */
  @test
  async testQueryPropagation() {
    useRouter().addRouteToRouter("/users/{uuid}{?fields}", {
      methods: ["GET"],
      executor: "Router",
      _method: async (ctx: WebContext) => {
        ctx.write({ uuid: ctx.getParameters().uuid, fields: ctx.getParameters().fields });
      }
    } as RouteInfo);
    useRouter().addAlias("/me", "/users/${user.id}");

    const res = await this.request("GET", "/me?fields=a", { userId: "123" });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { uuid: "123", fields: "a" });

    // Query template {?q*} on alias
    useRouter().addRouteToRouter("/orders{?userId,q*}", {
      methods: ["GET"],
      executor: "Router",
      _method: async (ctx: WebContext) => {
        ctx.write({ userId: ctx.getParameters().userId, q: ctx.getParameters().q });
      }
    } as RouteInfo);
    useRouter().addAlias("/my/orders{?q*}", "/orders?userId=${user.id}&${params.q*}");

    const resOrders = await this.request("GET", "/my/orders?status=active&sort=desc", { userId: "123" });
    assert.strictEqual(resOrders.statusCode, 200);
    assert.strictEqual(resOrders.body.userId, "123");
    assert.deepStrictEqual(resOrders.body.q, { status: "active", sort: "desc" });
  }

  /**
   * 5. Encoding: user id a/b?c is encoded and never matches another route, and .. is rejected with 400
   */
  @test
  async testEncodingAndPathTraversal() {
    useRouter().addRouteToRouter("/users/{uuid}", {
      methods: ["GET"],
      executor: "Router",
      _method: async (ctx: WebContext) => {
        ctx.write({ uuid: ctx.getParameters().uuid });
      }
    } as RouteInfo);
    useRouter().addRouteToRouter("/users/a/b", {
      methods: ["GET"],
      executor: "Router",
      _method: async (ctx: WebContext) => {
        ctx.write({ hijacked: true });
      }
    } as RouteInfo);
    useRouter().addAlias("/me", "/users/${user.id}");

    // Encoded user id containing slash and question mark
    const resEncoded = await this.request("GET", "/me", { userId: "a/b?c" });
    assert.strictEqual(resEncoded.statusCode, 200);
    assert.deepStrictEqual(resEncoded.body, { uuid: "a/b?c" });

    // Path traversal in user id -> 400
    const resTraversalUser = await this.request("GET", "/me", { userId: ".." });
    assert.strictEqual(resTraversalUser.statusCode, 400);
    assert.ok(resTraversalUser.error instanceof WebdaError.BadRequest);

    // Path traversal in {+rest} parameter -> 400
    useRouter().addAlias("/file/{+path}", "/files/${params.path}");
    const resTraversalParam = await this.request("GET", "/file/../../etc/passwd");
    assert.strictEqual(resTraversalParam.statusCode, 400);
    assert.ok(resTraversalParam.error instanceof WebdaError.BadRequest);
  }

  /**
   * 6. Precedence: alias /users/me wins over the route /users/{uuid}, and an exact alias/route collision logs WARN
   */
  @test
  async testPrecedenceAndCollisionWarning() {
    useRouter().addRouteToRouter("/users/{uuid}", {
      methods: ["GET"],
      executor: "Router",
      _method: async (ctx: WebContext) => {
        ctx.write({ fromRoute: ctx.getParameters().uuid });
      }
    } as RouteInfo);
    useRouter().addRouteToRouter("/collision", {
      methods: ["GET"],
      executor: "Router",
      _method: async (ctx: WebContext) => {
        ctx.write({ collision: "route" });
      }
    } as RouteInfo);

    const logs: { level: string; args: any[] }[] = [];
    this.stub(useWorkerOutput(), "log").callsFake((level, ...args) => {
      logs.push({ level, args });
    });

    useRouter().addAlias("/users/me", "/users/${user.id}");
    useRouter().addAlias("/collision", "/other");

    // Exact collision should log WARN
    const warnLogs = logs.filter(l => l.level === "WARN" && l.args.some(a => String(a).includes("/collision")));
    assert.ok(warnLogs.length > 0, "Exact alias/route collision must log WARN");

    // Alias /users/me wins over /users/{uuid} route
    const res = await this.request("GET", "/users/me", { userId: "999" });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { fromRoute: "999" });
  }

  /**
   * 7. Methods: an alias restricted to GET lets POST /me fall through to normal routing (404 if no route)
   */
  @test
  async testMethodFiltering() {
    useRouter().addRouteToRouter("/target", {
      methods: ["GET"],
      executor: "Router",
      _method: async (ctx: WebContext) => {
        ctx.write({ ok: true });
      }
    } as RouteInfo);
    useRouter().addAlias("/get-only", { target: "/target", methods: ["GET"] });

    // GET matches alias and resolves to /target
    const resGet = await this.request("GET", "/get-only");
    assert.strictEqual(resGet.statusCode, 200);

    // POST falls through to normal routing (which has no /get-only route -> 404)
    const resPost = await this.request("POST", "/get-only");
    assert.strictEqual(resPost.statusCode, 404);
  }

  /**
   * 8. OPTIONS: preflight on /me returns the target's methods (∩ alias methods) without a session
   */
  @test
  async testOptionsPreflight() {
    useRouter().registerCORSFilter({ checkRequest: async () => true });
    useRouter().addRouteToRouter("/users/{uuid}", {
      methods: ["GET", "PUT", "DELETE"],
      executor: "Router",
      _method: async (ctx: WebContext) => {
        ctx.write({});
      }
    } as RouteInfo);
    useRouter().addAlias("/me", {
      target: "/users/${user.id}",
      methods: ["GET", "PUT"]
    });

    // OPTIONS preflight carries no session / cookies
    const res = await this.request("OPTIONS", "/me");
    assert.strictEqual(res.statusCode, 204);
    const allowMethods = res.ctx.getResponseHeaders()["Access-Control-Allow-Methods"] as string;
    assert.ok(allowMethods, "Access-Control-Allow-Methods header must be set");
    const methods = allowMethods.split(",");
    assert.ok(methods.includes("GET"));
    assert.ok(methods.includes("PUT"));
    assert.ok(!methods.includes("DELETE"), "DELETE should be excluded by alias.methods intersection");
  }

  /**
   * 9. Redirect mode: 302 by default, redirectCode honored, Location is absolute and prefix aware
   */
  @test
  async testRedirectMode() {
    useRouter().addAlias("/docs", { target: "/static/docs/index.html", mode: "redirect" });
    useRouter().addAlias("/legacy", { target: "/new-url", mode: "redirect", redirectCode: 301 });

    // Default redirect 302 with prefix awareness
    const resDocs = await this.request("GET", "/docs", { prefix: "/app" });
    assert.strictEqual(resDocs.statusCode, 302);
    assert.strictEqual(resDocs.ctx.getResponseHeaders()["Location"], "http://test.webda.io/app/static/docs/index.html");

    // Custom redirectCode 301
    const resLegacy = await this.request("GET", "/legacy");
    assert.strictEqual(resLegacy.statusCode, 301);
    assert.strictEqual(resLegacy.ctx.getResponseHeaders()["Location"], "http://test.webda.io/new-url");
  }

  /**
   * 10. routePrefix: with routePrefix=/api, the alias /me matches /api/me and rewrites to /api/users/123.
   * A //absolute alias is not prefixed.
   */
  @test
  async testRoutePrefixHandling() {
    useParameters().routePrefix = "/api";
    useRouter().addRouteToRouter("/users/{uuid}", {
      methods: ["GET"],
      executor: "Router",
      _method: async (ctx: WebContext) => {
        ctx.write({ uuid: ctx.getParameters().uuid });
      }
    } as RouteInfo);
    useRouter().addAlias("/me", "/users/${user.id}");
    useRouter().addAlias("//absolute", "/users/${user.id}");
    useRouter().remapRoutes();

    // Prefixed alias /me matches /api/me
    const resPrefixed = await this.request("GET", "/api/me", { userId: "123" });
    assert.strictEqual(resPrefixed.statusCode, 200);
    assert.deepStrictEqual(resPrefixed.body, { uuid: "123" });

    // Absolute alias //absolute matches /absolute (without /api)
    const resAbsolute = await this.request("GET", "/absolute", { userId: "123" });
    assert.strictEqual(resAbsolute.statusCode, 200);
    assert.deepStrictEqual(resAbsolute.body, { uuid: "123" });

    // Reset prefix
    delete useParameters().routePrefix;
    useRouter().remapRoutes();
  }

  /**
   * 11. No chaining: alias A -> B where B is also an alias resolves only once
   */
  @test
  async testNoChaining() {
    useRouter().addAlias("/alias-a", "/alias-b");
    useRouter().addAlias("/alias-b", "/destination");

    // Alias A rewrites to /alias-b once; does not resolve /alias-b as an alias, falls through to 404
    const res = await this.request("GET", "/alias-a");
    assert.strictEqual(res.statusCode, 404);
  }

  /**
   * 12. Invalid config: ${context.getCurrentUserId()} or ${foo} in a target throws at load with a clear message
   */
  @test
  testInvalidConfig() {
    assert.throws(
      () => {
        new RouterParameters().load({
          aliases: {
            "/me": "/users/${context.getCurrentUserId()}"
          }
        });
      },
      (err: any) => {
        return (
          err instanceof WebdaError.CodeError &&
          err.code === "INVALID_ALIAS_TARGET" &&
          err.message.includes("context.getCurrentUserId()") &&
          err.message.includes("/me")
        );
      }
    );

    assert.throws(
      () => {
        new RouterParameters().load({
          aliases: {
            "/foo": "/test/${foo}"
          }
        });
      },
      (err: any) => {
        return (
          err instanceof WebdaError.CodeError &&
          err.code === "INVALID_ALIAS_TARGET" &&
          err.message.includes("foo") &&
          err.message.includes("/foo")
        );
      }
    );

    assert.throws(
      () => {
        compileAliasTarget("/unclosed", "/path/${unclosed");
      },
      (err: any) => {
        return err instanceof WebdaError.CodeError && err.code === "INVALID_ALIAS_TARGET";
      }
    );
  }

  /**
   * 13. Runtime add/remove: addAlias while running takes effect immediately, and removeAlias restores the 404
   */
  @test
  async testRuntimeAddRemove() {
    useRouter().addRouteToRouter("/runtime-target", {
      methods: ["GET"],
      executor: "Router",
      _method: async (ctx: WebContext) => {
        ctx.write({ runtime: true });
      }
    } as RouteInfo);

    // Initial 404
    const resBefore = await this.request("GET", "/dynamic");
    assert.strictEqual(resBefore.statusCode, 404);

    // Add alias at runtime
    useRouter().addAlias("/dynamic", "/runtime-target");
    const resAfterAdd = await this.request("GET", "/dynamic");
    assert.strictEqual(resAfterAdd.statusCode, 200);
    assert.deepStrictEqual(resAfterAdd.body, { runtime: true });

    // Remove alias at runtime
    useRouter().removeAlias("/dynamic");
    const resAfterRemove = await this.request("GET", "/dynamic");
    assert.strictEqual(resAfterRemove.statusCode, 404);
  }

  /**
   * 14. OpenAPI: exportOpenAPI() contains /me with getUserAlias-style operation ids and without uuid path param.
   * Redirect aliases are hidden unless includeHidden.
   */
  @test
  testOpenAPIExport() {
    useRouter().addRouteToRouter("/users/{uuid}", {
      methods: ["GET"],
      executor: "Router",
      openapi: {
        get: {
          operationId: "getUser",
          description: "Retrieve user by UUID"
        }
      }
    } as RouteInfo);
    useRouter().addAlias("/me", "/users/${user.id}");
    useRouter().addAlias("/docs", { target: "/static/docs", mode: "redirect" });
    useRouter().remapRoutes();

    // Default export (skipHidden=true)
    const docDefault = useRouter().exportOpenAPI(true);
    assert.ok(docDefault.paths["/me"], "/me must be documented in OpenAPI");
    assert.strictEqual(docDefault.paths["/me"].get.operationId, "getUserAlias");
    assert.ok(docDefault.paths["/me"].get.description.startsWith("Alias of /users/${user.id}"));
    // /me path parameters must not contain uuid
    const pathParams = docDefault.paths["/me"].parameters || [];
    assert.ok(!pathParams.some((p: any) => p.name === "uuid"), "Path parameters for /me must not include uuid");
    const opParams = docDefault.paths["/me"].get.parameters || [];
    assert.ok(!opParams.some((p: any) => p.name === "uuid"), "Operation parameters for /me must not include uuid");
    // Redirect alias /docs must be hidden
    assert.strictEqual(docDefault.paths["/docs"], undefined);

    // Export with hidden included (skipHidden=false)
    const docWithHidden = useRouter().exportOpenAPI(false);
    assert.ok(docWithHidden.paths["/docs"], "/docs redirect alias must be present when includeHidden is true");
  }

  /**
   * 15. Original URL preserved: ctx.getHttpContext().getUrl() still returns /me inside the handler
   */
  @test
  async testOriginalUrlPreserved() {
    let observedUrlInFilter: string | undefined;
    useRouter().registerRequestFilter({
      checkRequest: async (c: IWebContext) => {
        observedUrlInFilter = c.getHttpContext().getUrl();
        return true;
      }
    });

    useRouter().addRouteToRouter("/users/{uuid}", {
      methods: ["GET"],
      executor: "Router",
      _method: async (ctx: WebContext) => {
        ctx.write({
          handlerUrl: ctx.getHttpContext().getUrl(),
          routeAlias: ctx.getExtension("routeAlias")
        });
      }
    } as RouteInfo);
    useRouter().addAlias("/me", "/users/${user.id}");

    const res = await this.request("GET", "/me?flag=1", { userId: "123" });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.handlerUrl, "/me?flag=1");
    assert.strictEqual(observedUrlInFilter, "/me?flag=1");
    assert.deepStrictEqual(res.body.routeAlias, {
      alias: "/me",
      target: "/users/123?flag=1"
    });
  }
}
