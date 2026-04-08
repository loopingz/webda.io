import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Readable } from "stream";
import * as WebdaQL from "@webda/ql";
import { WebContext } from "./webcontext";
import { OperationContext } from "./operationcontext";
import { HttpContext } from "./httpcontext";
import { Session } from "../session/session";
import { UnpackedConfiguration } from "../application/iconfiguration";
import { SimpleOperationContext } from "./simplecontext";
import { WebdaAsyncStorageTest } from "../test/asyncstorage";
import { setApplication } from "../application/hooks";
import { setCore } from "../core/hooks";
import { setContextUpdate, canUpdateContext, isWebContext } from "./icontext";
import { UnknownSession } from "../session/session";
import { CookieOptions } from "../session/cookie";
import { runWithContext, useContext } from "./execution";
import { GlobalContext } from "./globalcontext";

export class WebContextMock extends WebContext {
  constructor(httpContext: HttpContext) {
    super(httpContext);
  }
}

export class OperationContextMock extends OperationContext {}

@suite
class ContextAppTest extends WebdaAsyncStorageTest {
  @test
  async copyContext() {
    const httpContext = new HttpContext("test.webda.io", "GET", "/");
    httpContext.setBody(Buffer.from("Plop"));
    const context = new WebContextMock(httpContext);
    const newCtx = await SimpleOperationContext.fromContext(context);
    assert.deepStrictEqual(newCtx.getSession(), context.getSession());
    assert.strictEqual((await newCtx.getRawInput()).toString(), "Plop");
  }

  ctx: WebContext;

  async beforeEach() {
    // Mocks
    setApplication({
      getCurrentConfiguration: () => { return this.getTestConfiguration(); }
    } as any);
    setCore({
      getLocales: () => ["es-ES", "en", "fr-FR"],
      getService: (name: string) => {
        if (name === "SessionManager") {
          return {
            save: async () => {},
            load: async () => {
              return {
                getProxy: () => {
                }
              }
            }
          }
        }
      }
    } as any);
    this.ctx = new WebContextMock(new HttpContext("test.webda.io", "GET", "/"));
  }

  getTestConfiguration(): UnpackedConfiguration {
    return {
      version: 4,
      parameters: {
        locales: ["es-ES", "en", "fr-FR"],
        ignoreBeans: true
      }
    };
  }

  @test
  async sanitize() {
    const context = await this.ctx;
    let input = "";
    context.getRawInputAsString = async () => {
      return input;
    };
    input = JSON.stringify({ q: "Inject <script>alert('plop')</script> > = != HTML" });
    assert.deepStrictEqual(await context.getInput({ raw: true }), JSON.parse(input));
    assert.deepStrictEqual((await context.getInput()).q, "Inject  &gt; = != HTML");
    assert.strictEqual(WebdaQL.unsanitize("plop &gt; &lt;"), "plop > <");
  }

  @test
  async cov() {
    // Get the last lines
    this.ctx = new WebContextMock(new HttpContext("test.webda.io", "GET", "/uritemplate/plop"));
    this.ctx.setParameters({ id: "plop" });
    assert.strictEqual(this.ctx.getParameters().id, "plop");
    assert.strictEqual(this.ctx.getHttpContext()!.getPortNumber(), 80);
    this.ctx.setExtension("mine", "plop");
    assert.strictEqual(this.ctx.getExtension("mine"), "plop");
    // @ts-ignore
    assert.strictEqual(this.ctx.getParameters(), this.ctx.parameters);
    // @ts-ignore
    this.ctx.session = undefined;
    assert.strictEqual(this.ctx.getSession(), undefined);
    assert.strictEqual(this.ctx._promises.length, 0);
    this.ctx.addAsyncRequest((async () => {})());
    assert.strictEqual(this.ctx._promises.length, 1);

    // @ts-ignore
    this.ctx._ended = true;
    await this.ctx.end();

    this.ctx.getHttpContext()!.setBody(undefined);
    assert.strictEqual(await this.ctx.getRequestBody(), undefined);
    this.ctx.getHttpContext()!.setBody("");
    assert.strictEqual(await this.ctx.getRequestBody(), undefined);

    // @ts-ignore
    this.ctx._ended = false;
    // @ts-ignore
    this.ctx.statusCode = 204;
    const stream = await this.ctx.getOutputStream();
    stream.write("plop");
    await this.ctx.end();
    assert.strictEqual(this.ctx.statusCode, 200);
    // @ts-ignore
    this.ctx._body = undefined;
    stream.write("ppop", () => {});

    assert.strictEqual(this.ctx.hasFlushedHeaders(), false);
    this.ctx.setFlushedHeaders();
    assert.strictEqual(this.ctx.hasFlushedHeaders(), true);
    this.ctx.setFlushedHeaders(false);
    assert.strictEqual(this.ctx.hasFlushedHeaders(), false);
    assert.strictEqual(this.ctx.getResponseCode(), 200);
  }

  @test
  simpleOperationContext() {
    const ctx = new SimpleOperationContext();
    const session = new Session();
    ctx.setSession(session);
    assert.strictEqual(session, ctx.getSession());
  }

  @test
  async pipe() {
    this.ctx.statusCode = 204;
    await this.ctx.init();
    const stream = Readable.from(Buffer.from("Plop"));
    this.ctx.setHeader("x-plop", "1");
    const prom = new Promise((resolve, reject) => {
      stream.on("close", resolve);
      stream.on("error", reject);
    });
    stream.pipe(await this.ctx.getOutputStream());
    await prom;
    assert.throws(() => this.ctx.setHeader("x-plop", "2"), /Headers have been sent already/);
    await this.ctx.end();
    assert.throws(() => this.ctx.setHeader("x-plop", "3"), /Headers have been sent already/);
    assert.strictEqual(this.ctx.statusCode, 200);
    assert.strictEqual(this.ctx.getResponseBody().toString(), "Plop");
  }

  @test
  async getInputError() {
    let i = 0;
    this.ctx.getRawInputAsString = async () => {
      if (i++ === 0) {
        throw new Error("Error");
      }
      return "";
    };
    assert.strictEqual(await this.ctx.getInput(), undefined);
  }

  @test
  async nullInput() {
    this.ctx.getRawInputAsString = async () => {
      return '{"test": null, "plop": 12}';
    };
    assert.deepStrictEqual(await this.ctx.getInput(), { test: null, plop: 12 });
  }

  @test
  getRequest() {
    // Need to finish this
    const req = this.ctx.getRequest();
    // cov
    req.setTimeout(1, () => {});
  }

  @test
  getResponseSize() {
    // @ts-ignore
    this.ctx._body = "PLOP";
    assert.strictEqual(this.ctx.getResponseSize(), 4);
    // @ts-ignore
    this.ctx._body = "Rémi";
    assert.strictEqual(this.ctx.getResponseSize(), 5);
  }

  @test
  getAbsoluteUrl() {
    let ctx = new HttpContext("test.webda.io", "GET", "/uritemplate/plop", "http", 80, {
      cookie: "PHPSESSID=298zf09hf012fh2; csrftoken=u32t4o3tb3gg43; _gat=1"
    });
    assert.strictEqual(ctx.getAbsoluteUrl("/test"), "http://test.webda.io/test");
    const cookies = ctx.getCookies();
    assert.strictEqual(cookies.PHPSESSID, "298zf09hf012fh2");
    assert.strictEqual(cookies.csrftoken, "u32t4o3tb3gg43");
    assert.strictEqual(cookies._gat, "1");
    ctx = new HttpContext("test.webda.io", "GET", "/uritemplate/plop", "https", 80);
    assert.strictEqual(ctx.getAbsoluteUrl(), "https://test.webda.io:80/uritemplate/plop");
    ctx = new HttpContext("test.webda.io", "GET", "/uritemplate/plop", "http", 443);
    assert.strictEqual(ctx.getAbsoluteUrl("/test"), "http://test.webda.io:443/test");
    ctx = new HttpContext("test.webda.io", "GET", "/uritemplate/plop", "http", 18080);
    assert.strictEqual(ctx.getAbsoluteUrl(), "http://test.webda.io:18080/uritemplate/plop");
    ctx = new HttpContext("test.webda.io", "GET", "/uritemplate/plop", "https", 443);
    assert.strictEqual(ctx.getAbsoluteUrl("/test"), "https://test.webda.io/test");
    assert.strictEqual(ctx.getAbsoluteUrl("ftp://test"), "ftp://test");
    assert.strictEqual(ctx.getAbsoluteUrl("test/ftp://test"), "https://test.webda.io/test/ftp://test");
    assert.strictEqual(ctx.getAbsoluteUrl("https://www.loopingz.com"), "https://www.loopingz.com");
    ctx.setPrefix("/plop/");
    assert.strictEqual(ctx.prefix, "/plop");
  }

  @test
  expressCompatibility() {
    this.ctx = new WebContextMock(new HttpContext("test.webda.io", "GET", "/uritemplate/plop"));
    assert.strictEqual(this.ctx.statusCode, 204);
    assert.strictEqual(this.ctx.status(403), this.ctx);
    assert.strictEqual(this.ctx.statusCode, 403);
    this.ctx = new WebContextMock(new HttpContext("test.webda.io", "GET", "/uritemplate/plop"));
    assert.strictEqual(this.ctx.statusCode, 204);
    assert.strictEqual(this.ctx.json({ plop: "test" }), this.ctx);
    assert.strictEqual(this.ctx.getResponseBody(), '{"plop":"test"}');
    assert.strictEqual(this.ctx.statusCode, 200);
  }

  @test
  async redirect() {
    this.ctx.init();
    this.ctx.redirect("https://www.loopingz.com");
    assert.strictEqual(this.ctx.getResponseHeaders().Location, "https://www.loopingz.com");
    assert.strictEqual(this.ctx.statusCode, 302);
  }
  @test
  async generic() {
    this.ctx.init();
    // @ts-ignore
    this.ctx.session = undefined;
    assert.strictEqual(this.ctx.getCurrentUserId(), undefined);
    this.ctx._cookie = undefined;
    this.ctx.cookie("test", "plop");
    this.ctx.cookie("test2", "plop2");
    assert.strictEqual(this.ctx._cookie["test"].value, "plop");
    assert.strictEqual(this.ctx._cookie["test2"].value, "plop2");
    this.ctx.writeHead(undefined, {
      test: "plop"
    });
    assert.strictEqual(this.ctx.getResponseHeaders()["test"], "plop");
    this.ctx.setHeader("X-Webda", "HEAD");
    this.ctx.setHeader("X-Webda2", "HEAD");
    this.ctx.setHeader("X-Webda2", undefined);
    assert.strictEqual(this.ctx.getResponseHeaders()["X-Webda"], "HEAD");
    assert.strictEqual(this.ctx.getResponseHeaders()["X-Webda2"], undefined);
    this.ctx.write(400);
    assert.strictEqual(this.ctx.getResponseBody(), "400");
    // @ts-ignore
    Object.observe = (obj, callback) => {
      callback([
        {
          name: "_changed"
        }
      ]);
      // @ts-ignore
      assert.strictEqual(this.ctx.session.changed, false);
      callback([
        {
          name: "zzz"
        }
      ]);
      // @ts-ignore
      assert.strictEqual(this.ctx.session.changed, true);
    };
    this.ctx.getSession();
    // @ts-ignore
    Object.observe = undefined;
    assert.notStrictEqual(await this.ctx.getOutputStream(), undefined);
  }

  @test
  defaultLocale() {
    assert.strictEqual(this.ctx.getLocale(), "es-ES");
  }

  @test
  approxLocale() {
    // @ts-ignore
    this.ctx.getHttpContext().getHeaders()["accept-language"] = "en-US;q=0.6,en;q=0.4,es;q=0.2";
    assert.strictEqual(this.ctx.getLocale(), "en");
  }

  @test
  exactLocale() {
    // @ts-ignore
    this.ctx.getHttpContext().getHeaders()["accept-language"] = "fr-FR,fr;q=0.8,en-US;q=0.6,en;q=0.4,es;q=0.2";
    assert.strictEqual(this.ctx.getLocale(), "fr-FR");
  }

  @test
  fallbackLocale() {
    // @ts-ignore
    this.ctx.getHttpContext().getHeaders()["accept-language"] = "zn-CH,zn;q=0.8,en-US;q=0.6,en;q=0.4,es;q=0.2";
    assert.strictEqual(this.ctx.getLocale(), "en");
  }

  @test
  async operationContext() {
    let ctx = new OperationContextMock();
    assert.strictEqual(ctx.getCurrentUserId(), undefined);
    assert.strictEqual(await ctx.getRawInputAsString(), "");
    assert.strictEqual((await ctx.getRawInput()).toString(), "");
    assert.strictEqual(ctx.getRawStream(), undefined);
    ctx.createStream();
    ctx.writeHead(200, { test: "plip" });
    ctx.setHeader("test", "plip");
    (await ctx.getOutputStream()).write("plop");
    assert.strictEqual(ctx.getOutput(), "plop");

    // cov
    const http = new HttpContext("test.webda.io", "GET", "/");
    ctx = new WebContextMock(http);
    await ctx.getRawInput();
    ctx.getRawStream();
  }

  @test
  async operationContextParameterDeprecated() {
    const ctx = new OperationContextMock();
    ctx.setParameters({ foo: "bar", num: 42 });
    // Test deprecated parameter() method
    assert.strictEqual(ctx.parameter("foo"), "bar");
    assert.strictEqual(ctx.parameter("num"), 42);
    assert.strictEqual(ctx.parameter("missing"), undefined);
    assert.strictEqual(ctx.parameter("missing", "default"), "default");
  }

  @test
  async operationContextWrite() {
    const ctx = new OperationContextMock();
    // Write with undefined/null returns false
    assert.strictEqual(ctx.write(undefined), false);
    assert.strictEqual(ctx.write(null), false);
    // Write an object
    assert.strictEqual(ctx.write({ key: "value" }), true);
    assert.ok(ctx.getOutput().includes("key"));
    // Write a string
    ctx.resetResponse();
    ctx.write("hello");
    assert.strictEqual(ctx.getOutput(), "hello");
    // Write appends strings
    ctx.write(" world");
    assert.strictEqual(ctx.getOutput(), "hello world");
    // Write a buffer
    ctx.resetResponse();
    ctx.write(Buffer.from("buf"));
    assert.strictEqual(ctx.getOutput(), "buf");
  }

  @test
  async operationContextClearInput() {
    const ctx = new OperationContextMock();
    ctx.clearInput();
    const input = await ctx.getInput();
    assert.deepStrictEqual(input, {});
  }

  @test
  async operationContextReinit() {
    const ctx = new OperationContextMock();
    // reinit clears _sanitized and recreates the stream
    ctx["_sanitized"] = { cached: true };
    ctx.reinit();
    assert.strictEqual(ctx["_sanitized"], undefined);
  }

  @test
  async operationContextNewSession() {
    const ctx = new OperationContextMock();
    const session = ctx.newSession();
    assert.ok(session instanceof Session);
    assert.strictEqual(ctx.getSession(), session);
  }

  @test
  async operationContextSetSession() {
    const ctx = new OperationContextMock();
    const session = new Session();
    session.userId = "test-user";
    ctx.setSession(session);
    assert.strictEqual(ctx.getCurrentUserId(), "test-user");
  }

  @test
  async operationContextAddAsyncRequest() {
    const ctx = new OperationContextMock();
    assert.strictEqual(ctx._promises.length, 0);
    ctx.addAsyncRequest(Promise.resolve());
    assert.strictEqual(ctx._promises.length, 1);
  }

  @test
  contextUpdateFunctions() {
    // Test setContextUpdate and canUpdateContext
    assert.strictEqual(canUpdateContext(), false);
    setContextUpdate(true);
    assert.strictEqual(canUpdateContext(), true);
    setContextUpdate(false);
    assert.strictEqual(canUpdateContext(), false);
  }

  @test
  isWebContextFunction() {
    // Test isWebContext with a proper WebContext
    const http = new HttpContext("test.webda.io", "GET", "/");
    const webCtx = new WebContextMock(http);
    assert.strictEqual(isWebContext(webCtx), true);

    // Test with an OperationContext (not a web context)
    const opCtx = new OperationContextMock();
    assert.strictEqual(isWebContext(opCtx), false);
  }

  @test
  async contextFlushHeaders() {
    // Use a WebContext which has hasFlushedHeaders
    const http = new HttpContext("test.webda.io", "GET", "/");
    const ctx = new WebContextMock(http);
    assert.strictEqual(ctx["flushed"], false);
    await ctx.flushHeaders();
    assert.strictEqual(ctx["flushed"], true);
    // Calling again should be a no-op
    await ctx.flushHeaders();
    assert.strictEqual(ctx["flushed"], true);
  }

  @test
  async contextSetHeaderAfterFlush() {
    const ctx = new OperationContextMock();
    ctx.setHeader("X-Test", "value");
    assert.strictEqual(ctx.getResponseHeaders()["X-Test"], "value");
    await ctx.flushHeaders();
    assert.throws(() => ctx.setHeader("X-After", "fail"), /Headers have been sent already/);
  }

  @test
  async contextWriteHead() {
    const ctx = new OperationContextMock();
    ctx.writeHead(200, { "Content-Type": "application/json", "X-Custom": "val" });
    assert.strictEqual(ctx.getResponseHeaders()["Content-Type"], "application/json");
    assert.strictEqual(ctx.getResponseHeaders()["X-Custom"], "val");
  }

  @test
  async contextEnd() {
    const ctx = new OperationContextMock();
    let resolved = false;
    ctx.addAsyncRequest(
      new Promise(resolve =>
        setTimeout(() => {
          resolved = true;
          resolve(undefined);
        }, 10)
      )
    );
    await ctx.end();
    assert.ok(resolved, "Should wait for all promises");
  }

  @test
  isGlobalContext() {
    const ctx = new OperationContextMock();
    assert.strictEqual(ctx.isGlobalContext(), false);
  }

  @test
  async pipelineWithoutOptions() {
    const ctx = new OperationContextMock();
    ctx.createStream();
    const readable = Readable.from(Buffer.from("pipeline-test"));
    await ctx.pipeline(readable);
    assert.ok(ctx.getOutput().includes("pipeline-test"));
  }

  @test
  async registerPromise() {
    const ctx = new OperationContextMock();
    let called = false;
    ctx.registerPromise(
      new Promise<void>(resolve => {
        called = true;
        resolve();
      })
    );
    assert.strictEqual(ctx._promises.length, 1);
    await ctx.end();
    assert.ok(called);
  }
}

@suite
class SessionTest {
  @test
  sessionBasic() {
    const session = new UnknownSession();
    assert.strictEqual(session.isDirty(), false);
    assert.strictEqual(session.isLogged(), false);
  }

  @test
  sessionLogin() {
    const session = new UnknownSession();
    session.login("user1", "ident1");
    assert.strictEqual(session.isLogged(), true);
    assert.strictEqual(session.userId, "user1");
    assert.strictEqual(session.identUsed, "ident1");
  }

  @test
  sessionLogout() {
    const session = new UnknownSession();
    session.login("user1", "ident1");
    session.roles = ["admin"];
    session.logout();
    assert.strictEqual(session.isLogged(), false);
    assert.strictEqual(session.userId, undefined);
    assert.strictEqual(session.identUsed, undefined);
    assert.strictEqual(session.roles, undefined);
  }

  @test
  sessionProxy() {
    const session = new UnknownSession().getProxy();
    assert.strictEqual(session.isDirty(), false);
    session.customField = "value";
    assert.strictEqual(session.isDirty(), true);
    assert.strictEqual(session.customField, "value");
  }

  @test
  sessionProxyTracksObjectAccess() {
    const session = new UnknownSession().getProxy();
    session.nested = { key: "val" };
    assert.strictEqual(session.isDirty(), true);
    // Accessing an object property returns a proxy
    const nested = session.nested;
    assert.strictEqual(nested.key, "val");
  }

  @test
  sessionProxyLoginLogout() {
    const session = new UnknownSession().getProxy();
    session.login("u1", "i1");
    assert.ok(session.isLogged());
    assert.ok(session.isDirty());
    session.logout();
    assert.ok(!session.isLogged());
  }
}

@suite
class CookieOptionsTest {
  @test
  defaults() {
    const opts = new CookieOptions({});
    assert.strictEqual(opts.httpOnly, true);
    assert.strictEqual(opts.path, "/");
    assert.strictEqual(opts.sameSite, "lax");
    assert.strictEqual(opts.name, "webda");
    assert.strictEqual(opts.maxAge, 86400 * 7);
  }

  @test
  customValues() {
    const opts = new CookieOptions({
      httpOnly: false,
      path: "/api",
      sameSite: "strict",
      name: "mysession",
      maxAge: 3600
    });
    assert.strictEqual(opts.httpOnly, false);
    assert.strictEqual(opts.path, "/api");
    assert.strictEqual(opts.sameSite, "strict");
    assert.strictEqual(opts.name, "mysession");
    assert.strictEqual(opts.maxAge, 3600);
  }

  @test
  withHttpContext() {
    const httpCtx = new HttpContext("test.webda.io", "GET", "/", "https", 443);
    const opts = new CookieOptions({}, httpCtx);
    // secure should be true for https
    assert.strictEqual(opts.secure, true);
  }

  @test
  withHttpContextHttp() {
    const httpCtx = new HttpContext("test.webda.io", "GET", "/", "http", 80);
    const opts = new CookieOptions({}, httpCtx);
    assert.strictEqual(opts.secure, false);
  }

  @test
  domainTrue() {
    const httpCtx = new HttpContext("test.webda.io", "GET", "/", "https", 443);
    const opts = new CookieOptions({ domain: true }, httpCtx);
    assert.strictEqual(opts.domain, "test.webda.io");
  }

  @test
  domainString() {
    const httpCtx = new HttpContext("test.webda.io", "GET", "/", "https", 443);
    const opts = new CookieOptions({ domain: "example.com" }, httpCtx);
    assert.strictEqual(opts.domain, "example.com");
  }

  @test
  domainUndefined() {
    const opts = new CookieOptions({});
    assert.strictEqual(opts.domain, undefined);
  }

  @test
  maxAgeString() {
    const opts = new CookieOptions({ maxAge: "1h" as any });
    assert.strictEqual(opts.maxAge, 3600);
  }

  @test
  secureExplicitOverride() {
    const httpCtx = new HttpContext("test.webda.io", "GET", "/", "http", 80);
    const opts = new CookieOptions({ secure: true }, httpCtx);
    assert.strictEqual(opts.secure, true);
  }
}

@suite
class ExecutionContextTest {
  @test
  runWithContextSync() {
    const ctx = new OperationContextMock();
    const result = runWithContext(ctx, () => {
      const current = useContext();
      return current === ctx;
    });
    assert.strictEqual(result, true);
  }

  @test
  async runWithContextAsync() {
    const ctx = new OperationContextMock();
    const result = await runWithContext(ctx, async () => {
      const current = useContext();
      return current === ctx;
    });
    assert.strictEqual(result, true);
  }

  @test
  useContextReturnsGlobalWhenNotInScope() {
    // Outside runWithContext, useContext returns the global context
    const ctx = useContext();
    assert.ok(ctx);
    assert.strictEqual(ctx.isGlobalContext(), true);
  }
}

@suite
class GlobalContextTest {
  @test
  isGlobalContext() {
    const ctx = new GlobalContext();
    assert.strictEqual(ctx.isGlobalContext(), true);
  }

  @test
  getCurrentUserId() {
    const ctx = new GlobalContext();
    assert.strictEqual(ctx.getCurrentUserId(), "system");
  }

  @test
  getCurrentUser() {
    const ctx = new GlobalContext();
    assert.strictEqual(ctx.getCurrentUser(), undefined);
  }

  @test
  getSession() {
    const ctx = new GlobalContext();
    assert.deepStrictEqual(ctx.getSession(), {});
  }

  @test
  getOutputStream() {
    const ctx = new GlobalContext();
    assert.throws(() => ctx.getOutputStream(), /You cannot write to a global context/);
  }
}
